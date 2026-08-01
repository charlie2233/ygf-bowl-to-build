# Code recovery, revocation, and reissue

This runbook prevents duplicate credit grants while giving managers a
consistent recovery path. Counter staff can explain a state; all code-state
changes are **manager-only**.

## Non-negotiable controls

- A human-readable code and its private claim QR are one bearer credential.
- Never request a full code by email, chat, issue form, or analytics note.
- Never reactivate, edit, or print a previously issued plaintext code.
- Reissue creates a new code and audit event. It does not “reset” the old code.
- If the old credential might still work, revoke it before handing over the
  replacement.
- Each distinct valid physical card grants exactly once. The same code never
  grants again, while one account wallet may accumulate multiple distinct
  cards.
- Every successful new-card top-up adds 3,000 Credits and sets the aggregate
  wallet expiry to 14 days from that top-up. Older remaining Credits share the
  updated expiry.
- A public campaign QR cannot prove purchase and can never be reissued as a
  private claim QR.

## Triage by customer-visible state

| State | Safe first check | Staff response | Manager decision |
| --- | --- | --- | --- |
| Invalid | Re-scan the original row, then manually enter it once | Do not guess, transcribe remotely, or consume another row | Verify batch/issuance evidence; reissue only if the printed credential was defective and purchase qualifies |
| Already used | Ask whether the guest used another sign-in account | Direct the guest to the original account; that account can retry the same code to reopen its current wallet | Review audit state; do not reissue merely because the original wallet is on another account |
| Expired | Confirm whether the message refers to the code or redeemed credits | Explain the stated promotional period | No extension unless a written campaign exception is approved and audited |
| Revoked | No counter troubleshooting | Refer to manager immediately | Review the revocation reason before any further action |
| Scan problem | Use the human-readable code on the same row | Keep the QR and text paired | Replace only a physically defective, unredeemed row |
| Account access | Use normal sign-in recovery | Do not collect credentials | Restore the original account; do not create a second wallet |

## Manager recovery procedure

1. Move the conversation away from the active line when practical.
2. Verify the **$25+** completed transaction using the minimum receipt facts
   needed. Do not photograph or attach the full receipt to an issue.
3. Ask the guest to reproduce the state on their own device. Do not ask them
   to send or read the full code.
4. In the approved admin workflow, use the non-secret row/batch reference and
   audit history to identify the issuance. Do not search logs for plaintext.
5. Decide one outcome:
   - restore access to the wallet already created;
   - explain that the valid state is already used, expired, or revoked;
   - revoke the original and issue one new claim row; or
   - escalate without changing code state.
   A same-account retry returns that wallet's current credits and expiry. It
   never restores spent credits, resets the balance to 3,000, or extends the
   promotional period. A separate, distinct eligible card is not a retry: it
   adds 3,000 Credits once and rolls the whole wallet expiry to 14 days from
   that successful top-up.
6. For a reissue, record operator, timestamp, batch/source, reason category,
   original non-secret record identifier, and replacement non-secret record
   identifier. Do not put either plaintext code in the note.
7. Hand the replacement human-readable code and private claim QR to the guest
   together. Confirm the row is complete without scanning it on a staff phone.
8. Reconcile the replacement in the shift count.

If the admin workflow is unavailable, pause reissues. Do not keep plaintext in
a temporary spreadsheet, personal note, or messaging app. The safe fallback is
to give the guest the approved privacy-safe escalation path and have a manager
follow up after service is restored.

## Reissue eligibility

A reissue may be appropriate when all of these are true:

- the qualifying purchase is verified;
- no wallet or credit grant exists for the guest from that credential;
- the original row was misprinted, damaged before handoff, or confirmed lost
  before redemption;
- the manager can revoke any still-usable original credential; and
- the manager records the decision in the audit trail.

A reissue is not appropriate simply because a guest used the code, spent the
credits, changed accounts, shared the row, or reached the stated expiry. A
later qualifying purchase may receive its own distinct card under the normal
campaign policy; that is a new grant, not a reissue or reset of the old code.

## Privacy-safe escalation template

> Category: [invalid / already used / expired / revoked / scan / account]
>
> Approximate time and register: [non-secret context]
>
> Purchase threshold verified: [yes/no]
>
> Batch or row reference: [non-secret identifier only]
>
> Action taken: [none / access recovery / revoked / reissued]
>
> Manager/operator: [approved operator]

Never include a full code, claim URL, receipt image, payment detail, prompt, or
sensitive personal information. Suspected exposure of any plaintext batch is
an incident: revoke the affected unused credentials, quarantine the print
batch, notify the campaign owner, and document the scope without reproducing
the secrets.
