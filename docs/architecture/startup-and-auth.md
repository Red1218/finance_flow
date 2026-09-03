# Startup and Authentication

The sequence from process start to a usable screen: font loading, then
anonymous session bootstrap, then navigation. Two defects in this sequence
have been found and fixed since the Core Transaction Loop freeze; both are
recorded here because neither the release-build failure mode nor the
startup race is visible from Expo Go or from the unit-test suite alone —
each required a real standalone Android build to surface.

## Sequence

```
RootLayout (app/_layout.tsx)
    → FontGate (loads fonts; blocks on error/loading)
        → AuthProvider (src/data/AuthContext.tsx; bootstraps the anonymous session)
            → RootNavigator (gates on AuthContext's `status`)
                → Stack (tabs, transaction/new, transaction/[id], onboarding/link-bank)
```

Nothing below a gate mounts until that gate clears — `RootNavigator`
doesn't mount until `FontGate` has fonts (or a font error to show), and the
`<Stack>` (and therefore every screen's `useLiveQuery` calls) doesn't mount
until `AuthContext`'s `status` is `'authenticated'`.

## Font loading and the release APK startup fix

**Symptom:** the standalone release APK hung indefinitely on the loading
spinner and never reached authentication. Expo Go did not reproduce this.

**Root cause:** `expo-font`'s font loading calls `expo-asset`'s
`downloadAsync()`, which requires the native module
`expo.modules.interfaces.filesystem.AppDirectories` — provided by
`expo-file-system`. That package was never installed as a direct project
dependency; it was only present as a nested transitive dependency of `expo`
itself. Expo Go bundles its own copy of every Expo module regardless of the
host project's own `package.json`, so it masked the gap. A standalone
release build has no such fallback — Expo's native autolinking only
includes a module if it (or something that directly depends on it) appears
in the project's own dependency tree, and a *transitive* dependency several
levels deep doesn't qualify. The resulting rejected promise from
`useFonts()` was silently discarded, because `RootLayout` originally read
only the first element of its `[loaded, error]` tuple — so the app was not
stuck retrying anything; it was simply never told the load had failed, and
sat on its initial loading render forever.

This was a missing dependency, not a native-project misconfiguration —
fixing it did not require regenerating the Android project
(`expo prebuild --clean` was not run and was not needed).

**Fix (commit `31b0582`):**
- `expo-file-system` added as a direct dependency in `package.json`, so
  autolinking includes it in the standalone build.
- `app/_layout.tsx` restructured: font loading now lives in an isolated
  `FontGate` component that reads both `fontsLoaded` and `fontError` from
  `useFonts()`. A font error renders a visible "Something went wrong
  loading the app. Please try again." message with a **Retry** button,
  instead of leaving the spinner running with no way out.
- Retry is implemented by remounting `FontGate` (`RootLayout` holds an
  `attempt` counter and passes it as `FontGate`'s `key`), so a failed load
  can be retried without restarting the whole native process.

**Validation:** fresh release build boots to Home, anonymous session
created, session persists across relaunch, Add Expense/Income confirmed
working. There is no dedicated automated test for the font-loading gate
itself (font loading is a native-module concern outside Jest's
`jest-expo` mocked environment) — this fix's evidence is the manual
release-build verification above, not a unit test.

**Status:** Approved & Frozen — 2026-09-02. See [`status.md`](../status.md).

## Anonymous session bootstrap and the auth/data startup race

`src/data/repositories/auth.ts`'s `ensureAnonymousSession()` is the
session bootstrap: it reads any persisted session
(`supabase.auth.getSession()`) and falls back to
`supabase.auth.signInAnonymously()` if none exists. `src/data/supabaseClient.ts`
configures the client with `persistSession: true` against `AsyncStorage`,
`autoRefreshToken: true`, and no session-in-URL detection (native app, not
a web redirect flow).

**Symptom:** on a warm relaunch (force-stop, then relaunch — the identity
already has a persisted session), Home/Budgets/other screens would briefly
— and, until navigating to another tab and back, indefinitely — show an
empty state ("No transactions yet", "No budget set") even though the data
was present in Supabase. First-launch (a genuinely new install, no
persisted session) did not exhibit this.

**Root cause, as far as verified:** `AuthContext` previously flipped
`status` to `'authenticated'` as soon as `ensureAnonymousSession()`
resolved. On a warm relaunch that promise resolves quickly, from a local
`AsyncStorage` read rather than a network round-trip. The `<Stack>` (and
every screen's `useLiveQuery`, which fetches on mount via
`useFocusEffect` — see [`src/hooks/useLiveQuery.ts`](../../src/hooks/useLiveQuery.ts))
then mounts immediately and fires its first fetch. It is possible for that
fetch to reach Supabase before the query client's own auth state has
finished catching up with the just-resolved session, so PostgREST/RLS
authorizes the request as if unauthenticated and returns zero rows —
silently, not as an error.

**What was proven, and what was not:** the externally observable race —
empty state on a warm relaunch, corrected only by navigating away and
back — was reproduced and fixed. It was **not** independently established
which exact internal `supabase-js` tick or thread is responsible for the
delay between `getSession()` resolving and the client's request-layer auth
state catching up; that would require instrumenting or reading
non-minified `supabase-js` internals, which this fix does not depend on.
The fix instead closes the observable window without needing to know the
exact internal mechanism.

**Fix (commit `1f3a4f6`):** `AuthContext` now tracks two independent
signals and only sets `status: 'authenticated'` once **both** are true,
regardless of which arrives first:

- `sessionResolved` — `ensureAnonymousSession()`'s promise has resolved.
- `authListenerSeen` — the existing `supabase.auth.onAuthStateChange`
  subscription has fired at least once with a non-null session.

The listener accepts every event type, not just `SIGNED_IN` — a *restored*
session fires `INITIAL_SESSION` rather than `SIGNED_IN`, and filtering to
`SIGNED_IN` only would mean the listener never fires on a warm relaunch at
all, permanently stalling on the loading spinner instead of fixing the
race. This was verified deliberately, not assumed: `INITIAL_SESSION` is
included precisely because a `SIGNED_IN`-only filter was considered and
rejected as a would-be deadlock.

No timers, no polling, and no per-screen retry logic were introduced.
`useLiveQuery`'s contract, `RootNavigator`'s gating logic, and the public
`AuthStatus` shape (`'initializing' | 'authenticated' | 'error'`) are all
unchanged — every other screen and hook is unaware this exists.

**Tests:** `src/data/AuthContext.test.tsx` — 4 cases, driving a mocked
`ensureAnonymousSession` promise and a captured `onAuthStateChange`
callback independently: stays `initializing` when only the session
resolves; stays `initializing` when only the listener fires; reaches
`authenticated` regardless of which of the two signals arrives first
(covering both ordering permutations); a `SIGNED_OUT`/null event alone
does not flip it; a rejected session lookup surfaces `status: 'error'`.

**Native validation:** 3/3 cold `force-stop` → relaunch cycles on the
release APK showed correct data within a few seconds of launch every time,
with no navigation, refresh, or screen reopen required — confirmed against
the same anonymous identity (same `auth.users` id, unchanged
`last_sign_in_at` across relaunches), ruling out session/identity loss as
an alternative explanation.

**Status:** Approved & Frozen — 2026-09-03. See [`status.md`](../status.md).
