# SMS Transaction Detection — Design

**Status:** Draft, pending user review
**Scope:** Android only, personal sideload build — not the Play Store build

## Motivation

Every transaction currently requires manual entry. Most spending already
generates a bank/UPI SMS the instant it happens (debit alerts, UPI
confirmations). Detecting these automatically and turning them into
pre-filled transaction drafts removes the main friction in using the app
day to day.

## Decisions already made (from brainstorming)

1. **Review before saving, never auto-save.** A parsed SMS becomes a
   pending draft the user confirms/edits/rejects — same trust level as
   manual entry. (Validated further by the real samples below: bank SMS
   text is genuinely messy — e.g. a merchant name truncated mid-word by
   the bank's own SMS length limit — so a human glance before saving is
   load-bearing, not just a safety net.)
2. **Background listener**, not app-open-only scanning — a native
   `BroadcastReceiver` catches `SMS_RECEIVED` the moment a message arrives,
   independent of whether the app is in the foreground.
3. **Starting bank scope: Kotak Bank and Axis Bank** (the user's two
   most-used), with real sample messages captured below. Additional banks
   are new parser modules added later, not a redesign.
4. **Auto-match account by bank name (and product)**, editable on the
   review screen — if an account named "Kotak" already exists, pre-select
   it for a savings-account detection; a Kotak *credit card* detection
   matches a separate "Kotak Credit Card" account if one exists, since the
   real samples showed these are genuinely different sender IDs/products,
   not just one "Kotak" bucket (see Parser modules below).
5. **Distribution: sideload only, not Play Store.** The spike
   ([2026-09-08 conversation], not a separate doc) found that Google Play's
   SMS/Call-Log permission policy only binds apps submitted through Play
   Console — irrelevant here — but a *separate* mechanism, Play Protect's
   "enhanced fraud protection," blocks installing APKs that request
   `READ_SMS`/`RECEIVE_SMS` when installed via a browser/file
   manager/messaging app on enrolled devices (India is enrolled). Installs
   via `adb install` from a trusted computer are a different pathway and
   aren't the flow that protection targets. **This feature must only ship
   in a personal/sideload build, installed via `adb install` — never in a
   build submitted to the Play Store**, where it would need the full
   declaration/review treatment this spec doesn't attempt to satisfy.

## Real sample messages (captured directly from the user's SMS app)

These replace the earlier WhatsApp-forwarded samples and are the
authoritative source for the parser patterns below. Pulling from the real
SMS app (screenshots, not forwards) surfaced the actual sender IDs, and
revealed that **"one bank" is not "one message format"** — Kotak alone
sends from two different sender IDs depending on product, each with its
own set of message shapes. This reshapes the parser module structure (see
below): dispatch is keyed by **sender ID + subtype**, not just "bank name."

**Kotak Bank savings account** (UPI/IMPS) — bank code `KOTAKB`, confirmed
sent from at least two sender-ID prefixes so far (`VK-`, `AD-KOTAKB-S`) with
identical message shapes:
```
# debit (UPI sent)
Sent Rs.150.00 from Kotak Bank A/c X8721 to GUNREDDY RAMANUJA RE on 07-09-26.
UPI Ref 804121858190. Not done by you? Tap https://kotak.bank.in/KBANKT/Fraud

# credit (UPI received) — note: "AC 8721" not "A/c X8721", and "UPI Ref:" with
# a colon and no space, both different from the debit message above
Received Rs.1500.00 in your Kotak Bank AC 8721 from GUNREDDY RAMANUJA RE
on 05-09-26.UPI Ref:765736473067

# credit (IMPS received) — a third distinct shape: "Rs. 16486.30" (space
# after Rs.), "A/C x8721" (lowercase x), no UPI Ref at all, "IMPS Ref no" instead
Received Rs. 16486.30 on 07-09-26 in your Kotak Bank A/C x8721 by an A/C
linked to mobile x163. IMPS Ref no 625010029187.
```

**Kotak Bank credit card** — bank code `KOTAKB`, but a different product
than the savings account above; also confirmed sent from at least three
sender-ID prefixes (`AX-`, `AD-KOTAKB-S`, alongside the savings account's
own `VK-`/`AD-` prefixes — see the note above about matching by bank code,
not exact sender string):
```
INR 351 spent on Kotak Credit Card x4030 on 06-09-26 at BLINK COMMERCE PVT LTD.
Avl limit INR 3625.51 Not you? SMS CCLOST 4030 to 5676788

# decimals appear when the amount isn't a whole rupee value — do not assume
# credit-card amounts are always decimal-free, only 351/384/500 above happened
# to be whole rupees
INR 1885.64 spent on Kotak Credit Card x4030 on 02-09-26 at AIRTEL IN.
Avl limit INR 5260.5 Not you? SMS CCLOST 4030 to 5676788
```

**Axis Bank** — sent from **two different sender IDs** for the same
message types (`VM-AXISBK-S` and `AX-AXISBK-S` both observed sending
identically-shaped debit messages) — see "Sender ID matching" below, this
is why matching is by bank-code substring, not exact sender string:
```
# debit (UPI/P2M) — seen from both VM-AXISBK-S and AX-AXISBK-S
INR 6800.00 debited
A/c no. XX1994
07-09-26, 11:01:15
UPI/P2M/313051540148/Thanvir Bros Pvt Lt
Not you? SMS BLOCKUPI Cust ID to 919951860002
Axis Bank

# credit (UPI/P2A — person-to-account) — a third distinct shape: trailing
# "IST", counterparty formatted as "<name> /<bank-code>/Paym"
INR 15000.00 credited
A/c no. XX1994
03-09-26, 19:20:56 IST
UPI/P2A/881446193797/GUNREDDY /KKBK/Paym - Axis Bank

# credit (cash/cheque deposit — "BNA-DEPOSIT") — structurally different
# from every other message: single-line "credited to Axis Bank A/c no."
# phrasing, 4-digit YEAR (09-02-2026, not 09-02-26 like everywhere else),
# and a 6-digit account tail (XX771994) instead of the usual 4 — account
# digit length is NOT a safe constant across subtypes
INR 500.00 credited to Axis Bank A/c no. XX771994 on 09-02-2026 00:31:24.
Info-BNA-DEPOSIT/AXIS BANK LIMITED/AXPR/2605. Avl Bal INR 832.61.
```

**Non-transactional messages that must be filtered out, not parsed as
transactions** — real Axis SMS traffic turned out to be **mostly this
category**, not transactions: card PIN set, app-welcome/limit-upgrade
notices, new-device login alerts, transfer-limit-change alerts, security-
question-reset alerts. Enumerating and excluding each one is a losing
game — see "Positive-match only" below, this is why the parser now
requires a positive structural match (amount + debited/credited + account)
rather than trying to blacklist every non-transactional shape.

**Multi-part SMS gotcha**: one Kotak message was observed arriving as two
physically separate SMS, the second being just a continuation fragment:
```
...Refer UM no. 1bb7cf4f5fbd47a4b975d4474a4791eb@ybl. Regards, Kotak Bank
```
Android delivers a long SMS as multiple PDU parts in one `SMS_RECEIVED`
intent. A naive receiver that reads only the first part will see a
truncated message and either fail to parse or parse garbage. The native
receiver **must** concatenate all parts via
`Telephony.Sms.Intents.getMessagesFromIntent(intent)` (join each
`SmsMessage.getMessageBody()` in array order) before handing the body to
the parser — this is called out explicitly because it's a well-known
Android pitfall, not a hypothetical.

## Architecture

```
Native SMS_RECEIVED broadcast
  → SmsReceiver.kt (Android, new)
      concatenates multi-part PDUs (Telephony.Sms.Intents.getMessagesFromIntent)
      emits {sender, body, timestamp} via DeviceEventEmitter
  → src/data/native/smsEvents.ts (new)
      thin JS subscription wrapper around the native event
  → src/domain/smsTransactionParser.ts (new)
      pure function: (sender, body) -> ParsedTransaction | null
      dispatches to one of N parser modules by exact sender-ID match
  → src/data/repositories/pendingDetections.ts (new)
      AsyncStorage-backed queue of ParsedTransaction drafts, keyed by each
      subtype's dedupKey (usually the bank's own reference number; the
      credit-card subtype has none, so it dedups on sender+amount+date+
      merchant instead) so a re-delivered/duplicate SMS doesn't create a
      second draft
  → UI: a "Detected transactions" list (new screen or a section on an
      existing hub screen — exact placement decided at plan time) showing
      pending drafts as a badge/count; tapping one navigates into the
      EXISTING transaction/new.tsx form, pre-filled via route params,
      using the exact same save path every other transaction already
      goes through. No parallel creation code path.
```

### Permissions

- `RECEIVE_SMS` and `READ_SMS` added to `android/app/src/main/AndroidManifest.xml`
  (this project's native `android/` folder is committed source, not
  regenerated by `expo prebuild` — same place the launcher icons were
  edited earlier this branch, no Expo config plugin needed).
- Requested at **runtime**, only when the user turns the feature on from
  Settings — never at install/first-launch. If denied, the toggle simply
  stays off; no other part of the app is affected (matches this app's
  existing pattern of features degrading gracefully without a permission,
  e.g. how signed-out screens degrade to `SignInPrompt` rather than
  crashing).

### Auth alignment

This slots into the signed-out model the last branch just built:

- The native listener and parser can run regardless of sign-in state —
  they only read device SMS and write to a local AsyncStorage queue,
  nothing Supabase-bound.
- The moment a detected draft is *reviewed and confirmed*, it goes through
  the existing `transaction/new.tsx` save flow — which already requires a
  session (RLS: `user_id = auth.uid()`). Signed out, opening a detected
  draft hits the same `SignInPrompt` gate every other entry point already
  uses. No new auth-gating logic needed; this is inherited for free.

### Parser modules (per sender ID + subtype)

Given one bank can have multiple sender IDs and multiple message shapes per
sender ID, each **sender ID** gets its own module, and internally tries its
known subtypes in order:

- `src/domain/smsParsers/kotakUpi.ts` — bank code `KOTAKB`, savings
  account shapes only (see below): UPI-sent (debit), UPI-received
  (credit), IMPS-received (credit). Only sender `VK-KOTAKB-S` observed so
  far, but matched by bank-code substring like Axis, not exact string —
  Axis's two-sender-ID discovery means assuming Kotak's sender is stable
  would just be the same mistake not yet caught.
- `src/domain/smsParsers/kotakCreditCard.ts` — bank code `KOTAKB`, credit
  card spend shape only (only sender `AX-KOTAKB-S` observed so far, same
  substring-matching caveat as above). Since both Kotak parsers share a
  bank code, dispatch tries `kotakCreditCard` first (its shape — "spent on
  Kotak Credit Card" — is more specific/unambiguous) and falls through to
  `kotakUpi` if it doesn't match.
- `src/domain/smsParsers/axis.ts` — bank code `AXISBK`: debit (P2M),
  credit (P2A), credit (BNA-DEPOSIT)

Shared shape:

```ts
interface BankParser {
  bankCode: string; // substring match against the sender header, e.g. 'KOTAKB', 'AXISBK'
  parse(body: string): ParsedTransaction | null; // null = no known transactional shape matched
}

interface ParsedTransaction {
  amount: number;
  direction: 'debit' | 'credit';
  accountType: 'bank_account' | 'credit_card';
  accountLast4: string; // whatever digit run follows the X/XX prefix — length varies (4 in most messages, 6 in the BNA-DEPOSIT one), never assume a fixed width
  merchant: string;
  date: string; // ISO — source formats vary: DD-MM-YY in most messages, DD-MM-YYYY in the BNA-DEPOSIT one
  dedupKey: string; // sender id + reference number
}
```

**Sender ID matching**: real traffic showed Axis sending the *identical*
debit shape from two different sender strings (`VM-AXISBK-S` and
`AX-AXISBK-S`) — the leading two letters are a telecom-route prefix, not
part of the bank's identity, and apparently not stable. Matching must be a
substring/suffix check against the bank code (`sender.includes('AXISBK')`,
`sender.includes('KOTAKB')`), never exact string equality against a full
sender ID. This app's account list already distinguishes bank vs. credit
card, so `accountType` still matters for auto-matching (a Kotak savings
account and a Kotak credit card are two different rows even though both
are "Kotak") — that distinction is carried by which parser module matched
(`kotakUpi` vs `kotakCreditCard`), not by the sender prefix.

**Positive-match only, not a blacklist**: the real Axis inbox turned out
to be mostly non-transactional traffic (PIN-set, app-welcome, login
alerts, limit-change alerts, security-question resets — five distinct
non-transactional shapes seen already, more will exist). Enumerating and
excluding every non-transactional template is an open-ended, losing game.
Instead, each parser's `parse()` only returns non-null when the body
positively matches a known transactional shape (an amount, a
debited/credited keyword, and an account number are all present and
extractable) — anything else, known or not, returns `null` by default.
This also means the subtype table below is a **living list**, not a
claimed-exhaustive enumeration: a message shape nobody has seen yet simply
produces no draft (safe no-op) until a sample is captured and a case is
added — same low-risk, additive extension path as adding a new bank.

Concrete fields per subtype (final regex written at implementation time —
this documents what each must capture, using the real samples above):

| Subtype | Amount | Direction | Account | Merchant/Counterparty | Date | Dedup ref |
|---|---|---|---|---|---|---|
| Kotak UPI sent | `Rs.150.00` → `Rs\.?\s?([\d,]+\.\d{2})` | literal `Sent` → debit | `A/c X8721` → `X(\d{4})` | between `to ` and ` on ` | `on 07-09-26` | `UPI Ref (\d+)` |
| Kotak UPI received | `Rs.1500.00` (same amount regex) | literal `Received...UPI Ref` → credit | `AC 8721` → `AC (\d{4})` (no `X` prefix here) | between `from ` and ` on ` | `on 05-09-26` | `UPI Ref:(\d+)` (colon, no space) |
| Kotak IMPS received | `Rs. 16486.30` (note the space after `Rs.`) | literal `Received...IMPS Ref` → credit | `A/C x8721` → `x(\d{4})` (lowercase) | not present in this message shape — leave blank, user fills in on review | `on 07-09-26` | `IMPS Ref no (\d+)` |
| Kotak credit card spend | **decimals are optional, not absent** — `INR 351` (whole rupees, no `.00` padding) and `INR 1885.64` (real paise) are both observed → `INR\s?(\d+(?:\.\d+)?)` | always debit (a card "spend") | `x4030` → `x(\d{4})` | after `at ` up to `. Avl limit` — merchant is sometimes a UPI routing string like `UPI-K-048831221119-THE` rather than a business name; passed through as-is, review screen is where the user makes sense of it | `on 06-09-26` | no ref number in the message — dedup on `(sender, amount, date, merchant)` tuple instead |
| Axis debit (P2M) | `INR 6800.00` → `INR\s?([\d,]+\.\d{2})` | literal `debited` → debit | `A/c no. XX1994` → `XX(\d{4})` | text after the last `/` in the `UPI/P2M/<ref>/<name>` line (bank-truncates long names — exactly why review-before-save matters) | own line `07-09-26, 11:01:15` | ref embedded in the same `UPI/P2M/<ref>/...` line |
| Axis credit (P2A) | `INR 15000.00` (same regex) | literal `credited` → credit | `A/c no. XX1994` → `XX(\d{4})` | text between the 3rd and 4th `/` in `UPI/P2A/<ref>/<name> /<bank-code>/Paym` — trailing space before the `/` is real, trim it | own line `03-09-26, 19:20:56 IST` (trailing `IST` must be stripped before date parsing) | ref embedded in the `UPI/P2A/<ref>/...` line |
| Axis credit (deposit) | `INR 500.00` (same regex, but inline in prose, not its own line) | literal `credited to Axis Bank` → credit | `XX771994` → `XX(\d+)` (**not** a fixed 4 digits — capture the full run) | not a person — leave blank or set to a fixed label like `"Deposit"`, since the message only names `AXIS BANK LIMITED`/an internal code, not a payer | `on 09-02-2026 00:31:24` — **4-digit year**, different from every other subtype's 2-digit year | no clean ref number — dedup on `(sender, amount, date, accountLast4)` like the credit-card subtype |

Every subtype above is a **debit or credit that already happened**; see
"Positive-match only" above for how everything else (which turned out to
be most of a real Axis inbox) is handled — always `null`, never a guess.

## Testing

- Per-parser tests (`kotakUpi.test.ts`, `kotakCreditCard.test.ts`,
  `axis.test.ts`) use the **exact real message bodies above** as fixtures —
  no synthetic/guessed SMS text — covering every subtype in the table
  (including the credit-card no-decimal amount format, the IMPS
  no-merchant case, the P2A trailing-`IST`/trailing-space case, and the
  deposit message's 4-digit-year/6-digit-account case), plus every
  non-transactional message captured (PIN-set, app-welcome, login alert,
  limit-change alert, security-question reset) asserting `parse()` returns
  `null` for each — this is the "positive-match only" principle's actual
  regression test, not a formality, given how much of a real inbox is
  non-transactional.
- A dispatch-order test for the two Kotak parsers sharing a bank code:
  a credit-card message must resolve to `kotakCreditCard`, not fall through
  to `kotakUpi` and either misparse or wrongly return `null`.
- A concatenation test for `SmsReceiver`'s JS-visible contract: given the
  two-part Kotak message (`"Sent Rs...."` + `"...Refer UM no....Kotak
  Bank"`), the parser only ever sees the correctly joined single body —
  this is really testing `smsTransactionParser`'s consumption of an
  already-joined string, since the native join itself isn't unit-testable
  in this repo's JS suite (see below), but it documents the joined-body
  shape the native side must produce.
- `pendingDetections.test.ts`: queue add/dedup/remove, AsyncStorage-backed,
  same mocking pattern as this repo's other `AsyncStorage`-touching tests.
  Include a dedup case for the credit-card subtype, which has no reference
  number and dedups on `(sender, amount, date, merchant)` instead.
- Native `SmsReceiver.kt` itself isn't unit-testable in this repo's JS test
  suite — verified manually on-device (send/receive a real SMS, confirm a
  draft appears), consistent with how this repo already treats native-only
  code (not covered by `jest`).
- Review-screen prefill: one representative test (existing
  `transaction/new.test.tsx` pattern) confirming route params pre-fill the
  form fields correctly; does not need duplicate coverage per bank since
  the parser output shape is already normalized to one `ParsedTransaction`
  type before it reaches the screen.

## Documentation impact

New section in `docs/status.md` recording this as an Android-only,
sideload-only feature with the Play Protect distribution caveat spelled
out, so a future session doesn't accidentally build/ship it into a
Play-Store-bound release without re-checking the compliance path this spec
deliberately skipped.

## Out of scope

- iOS: no API exists for third-party SMS access (confirmed in the prior
  spike); not attempted here.
- Play Store distribution of this feature: would require the Permissions
  Declaration Form + review process found in the earlier spike. Not
  pursued now; if this app is ever Play-Store-published, this feature
  either needs that compliance work or must be excluded from that build
  variant.
- Any bank beyond Kotak and Axis: added later as additional parser
  modules following the same pattern, not a redesign. **IDFC FIRST Bank
  specifically** was seen unprompted in the user's real message samples
  (sender `AD-IDFCFB-S`) and deliberately excluded from v1 per an explicit
  scope decision — it introduces at least two more date formats (`DD/MM/YY`
  and `DD-Mon-YY`, e.g. `18-Aug-26`) beyond the two Kotak/Axis already use.
  Not spec'd here; if added later, it needs its own real-sample pass the
  same way Kotak and Axis got one, not a guess from this note.
- Editing/deleting a saved (not pending) transaction that originated from
  SMS detection differently from a manually-entered one — once saved, it's
  an ordinary transaction row, no provenance tracking needed.
