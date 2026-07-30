# Production claim batch receipt — 2026-07-30

This receipt contains no plaintext claim, claim URL, QR payload, individual
code hash, API credential, or user identifier.

## Production inventory

- Batch ID: `c0313939-a965-41a6-8e61-67ba37db0c2c`
- Approved quantity: 500
- Source: `scratch-card`
- Activated at: `2026-07-30T23:12:00.25157Z`
- Production state after activation: 500 `eligible`, zero pending rows for
  this batch
- Code expiry: none; the wallet created by a successful redemption still
  expires 14 days after redemption
- Audit evidence: one idempotent create mutation and one idempotent activate
  mutation; replaying each phase did not create another batch or grant
- Operator boundary: a login-disabled system audit principal was unprivileged
  at rest, elevated only around each service-role-only RPC, and returned to
  `campaign_role=user` in `finally`; the final production admin-profile count
  was zero

## Private custody artifacts

All credential-bearing artifacts are ignored under local `private/`. The
directory is mode 0700 and every listed file is mode 0600:

- `private/ygf-production-500-20260730.csv`
- `private/ygf-production-500-20260730.claims.html`
- `private/ygf-production-500-20260730.claims.pdf`
- immutable intent, operator, pending, and active receipts with the same stem

The one-time Supabase API-key export and temporary Vercel environment download
were removed after final verification. No plaintext inventory entered Git,
chat, application logs, analytics, or the database.

## Verification evidence

- Focused generator and artwork suite: 31/31 tests passed.
- Stable application suite: 80/80 test files and 609/609 tests passed.
- ESLint, TypeScript typecheck, and the Next.js production build passed.
- Canonical CSV count and uniqueness: 500/500.
- Database row-reference/SHA-256 parity before activation: 500/500.
- QR metadata and jsQR decode from the private HTML: 500/500.
- Final PDF: 63 Letter pages at 612×792 pt; pages 1 and 63 were visually
  inspected through credential-redacted rasters.
- QR decode from the final PDF raster: 500/500.
- The last page contains four occupied rows and four blank positions.
- Activation replay returned the same active batch; final aggregate was 500
  eligible rows, two audit mutations, and zero admin profiles at rest.

## Release boundary

These credentials are digitally valid in production, but the PDF is not
authorization to send the job to a commercial printer. Distribution remains
blocked until a manager:

1. approves the YGF image/brand rights and final public-facing card treatment;
2. selects a finishing method that completely conceals both the code and the
   private QR;
3. resolves printer bleed, CMYK/ICC, safe-area, duplex-registration, stock,
   scratch-layer, and custody requirements;
4. prints a 100%-scale proof and scans every imposition position under store
   lighting;
5. completes the 10–20 person soft test and staff training; and
6. records physical inventory reconciliation and the distribution window.

This batch uses the deployed eight-character compatibility format. The planned
128-bit private QR plus 12-character backup-code protocol requires a
backward-compatible schema, API, renderer, and redemption migration before a
future batch can use it; printing a stronger but unsupported credential would
produce unusable cards.
