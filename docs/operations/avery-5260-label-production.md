# Avery 5260 visible-code label production

This runbook defines the non-secret operating boundary for the YGF static-QR
card plus Avery 5260 visible-code label. It does not authorize an upload, print
order, payment, production run, or physical distribution.

## Fixed release inputs

- Reuse active production batch `929c4026-7cfc-4a5e-bf3b-420d26e01ae2`,
  created on 2026-08-07 with 500 eligible credentials. Do not reset, edit,
  reactivate, or regenerate those credentials for this print format.
- The card's static QR is credential-free and opens exact
  `https://malatangai.com/redeem`. It never contains or prefills a claim.
- The Avery 5260 label is 2.625 x 1 inch and carries one eight-character bearer
  code. After a qualifying checkout, the customer scans the static QR and
  manually enters that label code.
- The checked-in card label uses reserved public sample `A7K3B9Q2`, marked
  `SAMPLE ONLY - NOT A LIVE CODE`. The public Avery sheet uses only
  `SAMPLE01` through `SAMPLE30`; those values are eight characters but invalid
  under the production alphabet. Public artwork must never contain a production
  code.

The static QR and label are intentionally different objects. Do not convert the
static QR into `/redeem#code=...`, and do not upload or embed live label data in
the public card artwork.

## Owners and stop conditions

The campaign manager owns inventory and reconciliation. The creative/brand
owner approves image, logo, bilingual copy, trim, stock, and physical proof. The
store manager owns local custody, staff training, and release. Engineering
approves any local merge implementation and its count-only verification.

Stop before live label production unless all of these are true:

- brand and print rights are signed off for the user-source/AI-composite image
  and official-site logo;
- the $25+ offer and Simplified Chinese/English copy are approved;
- a visible-code custody model or concealment layer is approved in writing;
- the merge stays entirely on a manager-controlled local computer with cloud
  sync disabled;
- the private source, merged document, PDF, and receipts stay directly under
  ignored `private/` at mode 0600; and
- a non-secret row-reference reconciliation design is ready before any label is
  printed.

If any condition fails, leave the active database batch unchanged and keep its
private files secured. Do not improvise with email, chat, a shared drive, an
online Avery template, or a print-vendor data service.

## Credential-free artwork proof

Render the public, credential-free artwork and fake-code Avery proof with:

```sh
node scripts/render-static-redemption-card.mts
node scripts/render-avery-5260-labels.mts --sample
```

Before accepting those outputs, inspect
`output/redemption-card/manifest.json`, the front/back/review PNGs, and the
front/back/duplex PDFs. Confirm:

1. the canvas is 3.75 x 2.25 inches at 300 DPI for a 3.5 x 2 inch trim;
2. the static QR decodes to exact `https://malatangai.com/redeem`;
3. no claim appears in the QR, URL, artwork, metadata, or filename;
4. the card sample `A7K3B9Q2` and Avery values `SAMPLE01` through `SAMPLE30`
   are clearly marked non-live; and
5. no clipping, black square, missing glyph, unintended mark, or unreadable
   instruction appears.

The `--sample` command does not read the private CSV. It writes a 30-label,
one-sheet Letter PDF and 1275×1650 PNG proof plus a non-secret manifest.

## Private-file boundary

The canonical source remains the existing ignored file documented in the
non-secret production-batch receipt. Check permissions without printing its
contents, then enforce the private boundary:

```sh
chmod 700 private
chmod 600 private/ygf-production-500-20260807.csv
```

Any live Avery merge output must also be a new mode-0600 file directly under
`private/`. It must refuse overwrite, symlinks, nested/output paths, and
permissive files. Stdout and stderr may report only non-secret status and
aggregate counts. Never print a code, claim URL, CSV row, or private path to a
terminal transcript.

## Local merge and read-only verification

The repository's local-only command consumes the existing canonical CSV. It
does not generate, register, activate, revoke, reset, or otherwise change a
credential:

```sh
umask 077
node scripts/render-avery-5260-labels.mts \
  --input private/ygf-production-500-20260807.csv \
  --html private/ygf-production-500-20260807.avery-5260-labels.html \
  --pdf private/ygf-production-500-20260807.avery-5260-labels.pdf
node scripts/render-avery-5260-labels.mts --verify-only \
  --input private/ygf-production-500-20260807.csv \
  --html private/ygf-production-500-20260807.avery-5260-labels.html \
  --pdf private/ygf-production-500-20260807.avery-5260-labels.pdf
```

The render fails closed unless the source has exactly 500 canonical, unique
production rows and excludes all reserved public sample values. It prints one
code and its non-secret `row_reference` on each 2.625×1-inch label, creates 17
Letter sheets with 20 labels on the last sheet, blocks network access during
rendering, refuses overwrite and symlinks, and publishes both outputs at mode
0600. The verifier reconstructs the expected HTML, checks the source
commitment, confirms Letter page count and dimensions, and finds every code and
row reference exactly once in the PDF. Stdout contains only counts and file
digests.

Do not copy and paste production codes into a word processor one at a time. Do
not upload the CSV or merged PDF to Avery, Staples, a card printer, an online
office suite, cloud storage, email, chat, or a ticket. Static credential-free
artwork and live labels have separate printer/custody boundaries.

## Synthetic proof first

Before any live merge, create a local proof with synthetic, non-production
values and non-secret fixture references. On the exact Avery 5260 stock:

1. print at 100% or Actual Size with Fit and Scale to Fit disabled;
2. confirm the label grid, margins, pitch, code size, and row-reference pairing;
3. apply labels to trimmed proof cards and check placement tolerance, adhesion,
   legibility, and bleed/cut clearance;
4. scan every static-QR imposition position under store lighting and at the
   intended distance; and
5. have participants scan `/redeem` and manually enter synthetic label codes on
   iPhone/Safari, Android/Chrome, and one desktop browser.

Use the soft-test fixtures and record only their non-secret references. Do not
consume a live production credential merely to test printing.

## Live run and reconciliation

Only after the local merge, read-only verification, and synthetic proof gates
close may the campaign
manager authorize a live local run. The authorization must name the operator,
approved input, approved output, expected count 500, printer, stock, custody
location, and stop window. It must not reproduce a code.

Reconcile by non-secret row reference. The manager record must track these
lifecycle states and transitions:

- source rows;
- labels rendered;
- labels printed;
- labels applied to cards;
- spoiled labels;
- quarantined or mismatched cards;
- cards issued;
- cards unused and returned; and
- rows revoked by a manager.

Do not add overlapping lifecycle totals together. At each checkpoint, use
non-overlapping categories that balance to the same 500 source references: for
example, not printed plus printed; then unapplied plus applied plus spoiled; then
unused applied cards plus issued cards plus quarantined cards. Record transitions
separately. A loose, missing, duplicated, misaligned, or unreadable live label is
a bearer-credential incident: stop, quarantine the affected material, identify
it by non-secret row reference, and follow the manager-only revoke/reissue
runbook. Never reset or reprint the same exposed credential as a new card.

Keep printer spools, preview caches, recent-file lists, and local temporary files
inside the approved private boundary or clear them through the approved device
procedure. Never place unused, spoiled, or liner-backed live labels in ordinary
trash.

## Physical release gate

Before handoff to counter staff, owners record dated evidence for:

- final brand, image, logo, bilingual-copy, color, trim, and stock approval;
- exact 500/500 source-to-label-to-PDF parity using non-secret row references;
- mode-0600 private sources and outputs with no vendor/cloud transfer;
- 100% print scale, label placement, adhesion, and physical legibility;
- static QR scans from every physical imposition position under store lighting;
- an approved visible-code custody or concealment model;
- staff training on the static-QR/manual-entry handoff and privacy-safe
  escalation;
- the 10-20 person synthetic soft test; and
- opening, issued, unused, spoiled, quarantined, and revoked inventory counts.

Until every item has a named owner, evidence, date, and sign-off, the 500
database credentials remain active but the physical static/Avery inventory is
not authorized for printing or distribution.
