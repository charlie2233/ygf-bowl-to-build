# YGF Bowl-to-Build counter SOP

Owner: YGF store manager

Audience: counter staff and shift leads

Applies to: the limited 300-pass beta only

## Before the shift

1. Confirm the register has only the current manager-issued claim rows.
2. Each row must show a human-readable code and a private claim QR for the
   same code. Set aside any row that is cut off, duplicated, or unreadable.
3. Confirm the public campaign QR on the counter card opens the offer page.
   It is marketing material, not a customer claim code.
4. Confirm the escalation contact and the manager on duty.

Claim rows are private bearer credentials. Keep unused rows behind the
counter. Do not photograph, copy, post, or leave them where guests can scan
them.

## Qualifying checkout

A guest qualifies only after spending **$25+ in one completed transaction**.
Use the final transaction total and the current manager-approved menu and
prices. Do not combine separate receipts, issue a code before payment
finishes, or require a USC email. The offer allows one redemption per
person/account.

Use this handoff:

> Your purchase qualifies for limited YGF Build Credits. This row has the
> same private code in text and QR form. Scan it or enter the code at the
> claim page. Credits expire 14 days after redemption.

Hand over exactly one complete row. The human-readable code is the fallback
when a camera cannot scan; the private claim QR opens
`/redeem#code=<same-code>`. Do not separate the two. Never read the code
aloud across the room or enter it on the guest's device.

## Know the two QR types

| QR | Where it appears | Destination | Treatment |
| --- | --- | --- | --- |
| Public campaign QR | Poster, counter card, social creative | `/offer?utm_source=<asset>` | Safe to display publicly; it contains no claim credential. |
| Private claim QR | Printed claim row handed after purchase | `/redeem#code=<same-code>` | Treat like cash until handed over; never publish or reuse. |

The fragment after `#` stays in the browser and is used to prefill the claim
form. The customer should confirm the visible human-readable code matches the
printed row if a scan behaves unexpectedly.

## If a claim does not work

- **Invalid:** Ask the guest to re-scan the original row or manually enter the
  visible characters once. Do not guess characters or promise a replacement.
- **Already used:** Explain that the code has already been claimed. If the
  guest may be signed into the wrong account, direct them to sign out and use
  the account that originally claimed it. Escalate any reissue request.
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

Count unused claim rows without copying their codes. Return them to the
manager-controlled location, report the number issued and any issue
categories, and destroy only rows the manager has marked for secure disposal.
Do not put unused or spoiled claim rows in ordinary trash.
