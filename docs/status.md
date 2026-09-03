# Project Status

## Core Transaction Loop

- **Design:** Approved & Frozen — 2026-09-02
- **Implementation:** Approved & Frozen — 2026-09-02

Expense/Income/Transfer create, edit, and archive, implemented end-to-end
across Domain, Application, Infrastructure, and Presentation layers.
Transfer pairs are created, edited, and archived atomically via three
`SECURITY INVOKER` Postgres RPCs (`create_transfer`, `update_transfer`,
`archive_transfer`), with Row Level Security remaining the sole authority
on row access. Full validation suite passing: 92/92 unit tests, 17/17
integration tests, TypeScript/ESLint clean, Android export clean, and an
end-to-end manual UI verification of the full transfer lifecycle
(create → view paired detail → edit → archive) on the Android emulator.

See [`testing.md`](testing.md) for the verified results and residual
risks, and [`traceability.md`](traceability.md) for the requirement →
implementation mapping.

Note: the Core Transaction Loop design specification itself was produced
and approved in conversation across the investigation, design, design
review, and design revision phases that preceded implementation. No
design-spec file exists in this repository — this status entry and the
architecture docs under `docs/architecture/` are the durable record of
what was approved and built.

## Release APK Startup Fix

- **Implementation:** Approved & Frozen — 2026-09-02 (commit `31b0582`)

The standalone release APK hung indefinitely on the loading spinner and
never reached authentication, because `expo-file-system` was only a
transitive dependency and never picked up by standalone-build autolinking
(Expo Go masked the gap). Fixed by adding it as a direct dependency and by
making `app/_layout.tsx`'s font-loading gate (`FontGate`) surface a
visible error + retry instead of discarding a rejected font-load promise
silently. Native project regeneration was not required and was not part
of this fix. See
[`architecture/startup-and-auth.md`](architecture/startup-and-auth.md).

## Transaction Update Mapping Fix

- **Implementation:** Approved & Frozen — 2026-09-02 (commit `1604d8e`)

`transactionRepository.update()` forwarded the Application layer's
camelCase `TransactionPatch` straight to Supabase, which failed with
`PGRST204` (HTTP 400, unknown `occurredAt` column) for any edit touching
the date or category — corrected historical note: an initial hypothesis
attributing this to unrelated "Warp server error" background log activity
was investigated and disproven; the actual cause was this unmapped
camelCase-to-snake_case field mismatch. Fixed with `toUpdatePayload()` in
the Infrastructure adapter, proven by a real-network regression test
(`transactions.integration.test.ts`) that reproduces the original
`PGRST204` failure against the unmapped code and passes with the fix. See
[`architecture/transaction-architecture.md`](architecture/transaction-architecture.md#update-path-field-mapping-fixed-2026-09-02-commit-1604d8e).

## Mobile UX Reliability Fixes

- **Implementation:** Approved & Frozen — 2026-09-03 (commit `1f3a4f6`)

Two independent native-Android reliability defects, fixed together:

1. **Form modal keyboard dismissal.** Budgets/Accounts/Recurring/Goals
   form modals closed themselves the instant a `TextInput` inside them
   gained focus, on both Expo Web and native Android — caused by React
   Native's `Modal` opening a separate native Android Dialog window that
   doesn't cooperate with this app's `windowSoftInputMode="adjustResize"`
   when the keyboard opens for a field inside it (an earlier hypothesis
   blaming simple Pressable/backdrop touch-bubbling was investigated and
   disproven by device A/B testing). Fixed with a shared `FormModal`
   primitive rendered inline instead of via `Modal`, migrated across six
   modals in four screens; `SelectModal` was unaffected and left
   unchanged.
2. **Auth/data startup race.** On a warm relaunch, `AuthContext` could
   expose `status: 'authenticated'` before `supabase-js`'s own auth-state
   listener had caught up, letting the first screen's data queries fire
   before the query client was actually ready — RLS then silently
   returned nothing until the next navigation. Fixed by gating
   `'authenticated'` on both the session-lookup promise resolving *and*
   an observed `onAuthStateChange` event (accepting `INITIAL_SESSION` as
   well as `SIGNED_IN`, to avoid deadlocking a warm relaunch).

Both verified via `src/ui/FormModal.test.tsx` / `src/data/AuthContext.test.tsx`
plus native release-APK QA (all six modals confirmed working on-device;
3/3 cold relaunches showing correct data immediately). See
[`architecture/presentation.md`](architecture/presentation.md#shared-form-modal-formmodal)
and
[`architecture/startup-and-auth.md`](architecture/startup-and-auth.md).

Known cosmetic trade-off (not an open defect): the inline `FormModal`
sheet no longer layers above the bottom tab bar the way the native
`Modal` did. See [`testing.md`](testing.md)'s Known risks.
