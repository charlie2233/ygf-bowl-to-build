# 10-20 person soft-test script

Run this test in staging or a manager-controlled prelaunch window before
public distribution. Recruit **10-20 people** across mobile/desktop, camera
quality, sign-in state, and accessibility needs. Use synthetic test codes and
test transactions; do not collect real payment details or sensitive prompts.

## Roles and evidence

- Facilitator: reads the scenario without coaching the participant.
- Participant: completes the flow on their own device when possible.
- Observer: records timestamps, outcome, issue category, and non-secret device
  context.
- Manager: controls invalid/already used/expired/revoked fixtures and any
  manager-only reissue exercise.
- Engineering owner: watches error, rate-limit, provider-cost, and audit
  signals without viewing plaintext codes or prompt content.

Never copy a full code, private claim QR, claim URL, receipt, email, or prompt
into the test log. Use a non-secret fixture/row identifier.

## Entry criteria

- A release candidate is deployed over HTTPS with production-like auth,
  database, limits, and AI-provider controls.
- Public campaign QR fixtures and paired human-readable code/private claim QR
  rows were produced by the release process.
- Terms, privacy, offer copy, menu and prices, and the $25+ threshold have
  owner approval.
- The manager and engineering owner can set the server-only
  `YGF_REDEMPTION_ENABLED` and `YGF_WEB_TASKS_ENABLED` switches to `false`,
  roll out the configuration, and confirm the localized unavailable response
  occurs before an auth, ledger, or provider mutation. Agent traffic remains
  independently disabled unless its staging gate has passed.

## Participant scenarios

Assign enough overlap that core success paths are completed at least three
times.

| # | Scenario | Expected result |
| --- | --- | --- |
| 1 | Scan a printed public poster QR | HTTPS offer page opens with the correct poster source; no code is prefilled |
| 2 | Scan the counter-card public campaign QR | Offer opens with `counter-card-5x7` attribution |
| 3 | After a qualifying checkout, scan a private claim QR | Claim page prefills the same code printed in human-readable form |
| 4 | Manually enter the paired text code | Same result as the private QR; no confusing character ambiguity |
| 5 | Redeem with no existing session | Anonymous sign-in completes behind the scan-first flow and returns safely to the pending claim without a Google/Apple/Magic Link screen |
| 6a | Submit the same valid code again from its original account after spending credits | Current wallet and current remaining balance return; no second grant, reset to 3,000, expiry extension, or second wallet |
| 6b | Submit that redeemed code from a different account | Already-used state; no wallet, ownership, or code-state information crosses accounts |
| 6c | Redeem a second, distinct eligible card into the same Google/Apple account wallet | Exactly 3,000 Credits are added once; older remaining Credits stay in the same wallet and the whole wallet expiry becomes 14 days from this successful top-up |
| 7 | Enter an invalid fixture | Clear invalid state, no credit, no code leakage, no automatic reissue |
| 8 | Enter an expired fixture | Clear expired state; staff cannot extend it |
| 9 | Enter a revoked fixture | Clear revoked state and manager escalation |
| 10 | Lose account access after redemption | Normal account recovery restores the original wallet; no replacement code |
| 11 | Launch each of Study, Coding, Career, and Pick My Bowl | Eligible request succeeds, balance updates once, and history state is truthful |
| 12 | Submit a provider-failure fixture | Retry/error copy is understandable; no duplicate charge or invented result |
| 13 | Attempt rapid/repeated validation and redemption | Rate limiting is safe and does not reveal whether arbitrary codes exist |
| 14 | Use keyboard-only navigation and 200% zoom | Focus, labels, errors, and controls remain usable without clipped content |
| 15 | Try a sensitive prompt and a food/allergen question | Warnings are visible; no claim of medical or allergen certainty |
| 16 | Manager rehearses recovery/reissue | Original is reviewed/revoked, new row is audited, staff never records plaintext |
| 17 | Engineering rehearses each paused server-side switch | A new redemption or web task receives a clear retry-later state with no wallet/provider mutation; the Agent gateway stays separately disabled |
| 18a | From an anonymous wallet, choose Google sign-in and use an existing Google identity that already has a YGF wallet | A 10-minute one-use merge intent is prepared, normal OAuth returns through `https://malatangai.com/auth/callback`, the remaining guest Credits/history combine atomically into the existing wallet once, and Agent access unlocks without exposing an identifier or merge bearer |
| 18b | Repeat 18a with a human Apple account | The same merge behavior succeeds after Apple's account/2FA round trip; reaching Apple's outbound authorization page alone is not a pass |
| 19 | Retry the completed merge callback and then retry each source code | No duplicate transfer or grant occurs, the retired guest identity cannot create another wallet, and destination recovery still returns the combined wallet |

Include at least one iPhone/Safari participant, one Android/Chrome participant,
one desktop participant, one participant using manual entry, and one
keyboard/zoom accessibility pass. If the final QR is printed on a glossy
surface, test that exact stock under store lighting and at the intended
distance.

## Observation record

For each run capture only:

| Field | Example |
| --- | --- |
| Scenario | 6 - repeat claim |
| Fixture reference | `soft-used-02` (not the code) |
| Device/browser class | iPhone / Safari |
| Start-to-outcome time | 01:42 |
| Outcome | pass / fail / blocked |
| Issue category | copy / scan / auth / state / task / accessibility |
| Expected vs actual | short non-secret description |
| Severity and owner | launch blocker / engineering |

After each participant, ask:

1. What did you think the public QR would do?
2. Could you tell the public campaign QR from the private claim QR?
3. Did you understand that each distinct card grants once and a successful
   new-card top-up sets the whole wallet's expiry to 14 days from that top-up?
4. At any point did you feel asked to share more information than necessary?
5. What was the first confusing or slow moment?

## Exit criteria

- 100% of tested public QRs resolve to the correct `/offer?utm_source=...`.
- 100% of tested private QRs decode to the paired text code with no crop or
  quiet-zone failure.
- Each distinct valid code grants exactly once across retries and sign-in;
  same-code retries never regrant or extend expiry.
- A second distinct card adds 3,000 Credits to the same identity wallet and
  rolls the entire wallet expiry to 14 days from that successful top-up.
- Google and Apple each complete the anonymous-to-existing-account merge with
  a 10-minute one-use digest-backed intent, buffered destination cookies, and
  one service-only atomic transfer/tombstone. The $3 provider budget remains
  per identity after the combine.
- Invalid, already used, expired, and revoked states are distinct and do not
  leak sensitive data.
- No critical keyboard, zoom, focus, contrast, or screen-reader blocker.
- No uncontrolled error/cost spike and no plaintext code or sensitive prompt
  in logs, analytics, or reports.
- Staff complete the privacy-safe escalation without taking an unapproved
  manager action.

Stop and rollback the release candidate on any security/privacy failure,
duplicate credit grant, wrong QR destination, broken auth return, uncontrolled
provider spend, or repeated core-flow failure. Fix the candidate, reset only
approved synthetic fixtures, and re-run the affected scenario plus the full
success path before signing off.
