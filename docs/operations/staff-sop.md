# YGF Bowl-to-Build counter SOP

Owner: YGF store manager

Audience: counter staff and shift leads

Applies to: controlled distribution from the active 500-credential production
inventory batch created on 2026-08-07, batch
`929c4026-7cfc-4a5e-bf3b-420d26e01ae2`. The static-QR/Avery-label format reuses
those existing credentials; it does not reset or regenerate them. Activation
does not by itself authorize printing or distribution. The launch checklist
still requires brand approval, an approved visible-code custody or concealment
model, physical proof, staff training, reconciliation, and manager release
sign-off.

## Before the shift

1. Confirm the manager signed the static-card physical release record for this
   shift. If the visible-code custody or concealment decision is still open, do
   not put labeled cards at the register.
2. Confirm the register has only the current manager-issued cards. Each approved
   static card has the same credential-free QR opening
   `https://malatangai.com/redeem` and one readable Avery 5260 label carrying a
   distinct eight-character code.
3. Confirm the manager-controlled handoff record pairs each card or label liner
   with its non-secret row reference. Staff count and escalate by that reference,
   never by copying the code. Set aside any cut-off, duplicated, loose,
   mismatched, or unreadable label.
4. Scan a credential-free proof card and confirm it opens `/redeem` without
   prefilling a code. Do not test a live label by redeeming it.
5. Confirm the public campaign QR on the counter card opens the offer page. It
   is marketing material, not a customer claim code.
6. Confirm the escalation contact and the manager on duty.

An unlabeled static card is credential-free. Once a live Avery label is applied,
the card is a private bearer credential. Keep unused labeled cards and loose
labels in the manager-controlled location. Do not photograph, copy, post, read
aloud, or leave them where guests can see or take a code before a qualifying
purchase. Never upload a private CSV or live label document to a printer or
cloud service.

## Qualifying checkout

A guest qualifies only after spending **$25+ in one completed transaction**.
Use the final transaction total and the current manager-approved menu and
prices. Do not combine separate receipts, issue a code before payment
finishes, or require a USC email. Each distinct valid physical card grants
once. The same code never grants again, but a guest may add cards from later
qualifying purchases to the same account wallet.

Use this handoff:

> Your purchase qualifies for limited YGF Build Credits. This card has the YGF
> claim page QR on the back. Scan it to open the claim page, then enter the
> eight-character code on the label. This distinct card adds 3,000 Credits once.
> A successful new-card top-up sets the whole wallet to expire 14 days later.

Hand over exactly one complete, manager-reconciled card. The static QR opens
`/redeem` but does not contain or prefill a code. The customer enters the Avery
label's human-readable code themselves. Never read the code aloud across the
room, photograph it, or enter it on the guest's device. Record the issuance by
non-secret row reference only.

## Know the three QR types

| QR | Where it appears | Destination | Treatment |
| --- | --- | --- | --- |
| Public campaign QR | Poster, counter card, social creative | `/offer?utm_source=<asset>` | Safe to display publicly; it contains no claim credential. |
| Static redemption QR | Every static Avery-label card back | `/redeem` | Safe before a live label is applied; it opens the form but contains no code. |
| Legacy private claim QR | A separately approved older claim-row format | `/redeem#code=<same-code>` | Treat like cash until handed over; never publish or reuse. It is not printed on the static/Avery card. |

The current static/Avery flow has no claim fragment and does not prefill the
form. If a legacy private-QR row is separately approved, its fragment after `#`
stays in the browser and prefills the paired code. Staff must not mix the two
physical formats in one handoff count.

## If a claim does not work

- **Invalid:** Ask the guest to reopen the static QR and manually enter the
  visible Avery-label characters once. Do not guess characters, read the code
  into a staff device, or promise a replacement.
- **Already used:** This means the current account does not own that code.
  Direct the guest to the original account. Re-entering the same code from its
  original account safely returns the current wallet; it does not restore
  spent credits, add another grant, or extend expiry. A different eligible card
  may add 3,000 Credits once and roll the aggregate wallet expiry to 14 days;
  that normal top-up is not a reissue. Escalate any reissue request.
- **Expired:** Explain that the promotional code or credits are outside the
  allowed period. Staff cannot extend an expiry.
- **Revoked:** Stop. Do not issue another row. Refer the guest to the manager.

Revocation and reissue are **manager-only** actions. Follow
[Code recovery and reissue](./code-recovery-and-reissue.md); counter staff
must not take a second row from the batch as a workaround.

## Privacy-safe escalation

Record only:

- issue category: invalid, already used, expired, revoked, scan problem, or
  account access;
- approximate time and register/shift;
- campaign batch or row identifier if one is printed separately from the
  secret;
- whether the qualifying receipt was verified; and
- non-secret device/browser context.

Do not record or transmit a full code, receipt image, payment data, prompt,
email address, SSN, medical information, or confidential school information.
Use the phrase “privacy-safe escalation” in the handoff and ask a manager to
continue. If sensitive data is exposed, stop copying it and notify the manager
through the approved private incident channel.

## End of shift

Count unused labeled cards, loose labels, spoiled labels, quarantined cards,
and issued cards by non-secret row reference without copying their codes. The
manager must reconcile those categories to the shift's opening count. Return
unused inventory to the manager-controlled location, report only counts and
issue categories, and destroy only credentials the manager has revoked and
marked for secure disposal. Do not put unused labels, spoiled labels, label
liners, or labeled cards in ordinary trash.
