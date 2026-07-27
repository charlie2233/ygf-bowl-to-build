# YGF Bowl-to-Build

YGF Bowl-to-Build turns a qualifying meal into one simple AI balance:

1. A guest spends $16+ in one completed transaction.
2. Staff hand over one private row containing the same claim as text and QR.
3. The guest scans or enters the claim, confirms once, and receives 3,000
   non-cash Build Credits for 14 days.
4. Study, Coding, Career, and Pick My Bowl each spend 120 credits per run.

The default experience is task-first. An optional advanced control offers a
small server allowlist of friendly model choices; guests never configure a
provider key or provider billing.

## What is in this repository

- Next.js 16 App Router application and responsive campaign UI
- Supabase Auth/Postgres production adapter, RLS, and atomic ledger RPCs
- deterministic local demo mode with the receipt code `BOWL7K2A`
- OpenRouter-compatible provider adapter plus deterministic demo provider
- manager-only batch, revocation, funnel, inventory, and cost operations
- public campaign SVGs, print PDFs, and a private claim-row renderer
- campaign, legal, privacy, staff, recovery, soft-test, and launch documents
- Vitest, Playwright, QR-decoder, schema-contract, and accessibility checks

Plaintext batches belong only under ignored `private/`. No provider key,
Supabase secret, raw IP address, plaintext claim, or submitted prompt should
be committed or logged.

## Requirements

- Node.js 22 or newer
- pnpm 11
- Chromium/WebKit browsers installed by Playwright for browser verification
- a Supabase project and CLI only when using the Supabase modes

Install dependencies and browser engines:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
```

Copy `.env.example` to `.env.local`, then choose exactly one runtime mode
below. Keep all real secrets in the deployment platform or local untracked
file.

## Mode 1: deterministic local demo

Demo mode needs no external account and is the fastest complete product tour.
It is intentionally refused when `NODE_ENV=production`.

```sh
YGF_DEMO_MODE=true pnpm dev
```

Open `http://127.0.0.1:3000`, claim `BOWL7K2A`, and use the four workflows.
Demo authentication represents one local user and the demo provider returns
deterministic structured output through the same application contract as the
live provider.

The in-memory state lasts only for the development server process. It is not a
deployment, data-migration, concurrency, or external-provider proof.

## Mode 2: local application with Supabase

Create a development Supabase project, then provide:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- independent 32-byte-or-longer values for
  `YGF_CLAIM_COOKIE_SECRET`, `YGF_ABUSE_SIGNAL_SECRET`, and
  `YGF_TASK_FINGERPRINT_SECRET`
- `NEXT_PUBLIC_APP_URL` and `YGF_PUBLIC_ORIGIN`
- a server-only `YGF_PROVIDER_API_KEY` or `OPENROUTER_API_KEY`
- optionally `YGF_PROVIDER_BASE_URL` for a reviewed HTTPS-compatible gateway
- optionally `YGF_ADMIN_EMAIL_ALLOWLIST`

Leave `YGF_DEMO_MODE` unset. Apply the migration through the Supabase CLI:

```sh
supabase link --project-ref <development-project-ref>
supabase db push
pnpm dev
```

Configure the approved Supabase magic-link, Google, and Apple providers and
their exact callback URLs in the Supabase console. Console configuration is
external state and is not completed merely by applying this repository.

## Mode 3: production

Production uses the same Supabase and provider variables as Mode 2, with an
approved HTTPS public origin. `YGF_DEMO_MODE=true` fails closed in production.
Deploy the application only after:

- applying the migration to the intended production project;
- verifying RLS and server-only service-role access with separate user/admin
  accounts;
- configuring auth callback origins and provider credentials;
- setting provider usage and billing alerts;
- rendering public QRs with the real production origin;
- completing the manager, photo, print, training, and soft-test gates in
  `docs/operations/launch-checklist.md`.

The application is suitable for a Node-compatible Next.js host. Build and
start it with:

```sh
pnpm build
pnpm start
```

Do not place server secrets in `NEXT_PUBLIC_*` variables. Do not expose the
Supabase secret/service-role key, provider keys, or admin allowlist to client
components.

## Private claim inventory

The admin UI atomically creates a pending, durable hashed batch and returns its
plaintext CSV exactly once. Save that download into ignored `private/`, restrict
it to mode 0600, render the matching print sheet, and only then confirm batch
activation in the admin UI:

```sh
chmod 600 private/<admin-download>.csv
node scripts/render-private-claims.mts \
  --input private/<admin-download>.csv \
  --out private/<batch>.claims.html
```

The renderer consumes existing admin inventory; it cannot create or register
codes. It publishes one mode-0600 file atomically and refuses to overwrite it:

- the admin CSV contains the one-time plaintext inventory, non-secret row
  references, and claim URLs;
- `private/<batch>.claims.html` is a letter-size printable sheet with eight
  3.5x2-inch claim rows per page. Every row shows the human-readable code and
  a QR encoding `/redeem#code=<same-code>`.

Stdout contains only the row count, never a code or private path. Both files
contain bearer credentials; keep them out of Git, chat, tickets, analytics, and
ordinary shared drives. Print from a manager-controlled browser at 100% scale
with browser headers/footers disabled, decode samples from the physical stock,
then activate the pending batch, secure it, and reconcile every unused row.

Public poster QRs are different: they contain no claim and open
`/offer?utm_source=<asset>`.

## Campaign artwork

Render all public variants for the reviewed origin:

```sh
node scripts/render-campaign-assets.mts \
  --origin https://<approved-production-origin>
node scripts/render-campaign-assets.mts \
  --origin https://<approved-production-origin> \
  --verify-only
```

Committed artwork uses the documented beta origin and generated food fallback.
The second command verifies the already-rendered files without modifying them.
Automated renderer tests use an isolated temporary directory and cannot
silently restore the beta origin.
Before printing, replace it with a manager-approved rights-cleared YGF food
photo, regenerate, decode every final QR, and proof the PDFs at 100% scale.

## Verification

The complete local matrix is:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Focused checks are available with `pnpm vitest run <test-file>`. Browser tests
start an isolated local demo server. A green local matrix does not apply the
migration to a live Supabase project, configure external auth/provider
accounts, prove provider billing, scan printed stock, complete a store soft
test, or approve launch. Those gates are tracked in
`docs/release-readiness.md` and `docs/operations/launch-checklist.md`.

## Important product boundaries

- Build Credits are promotional, non-cash units; provider dollars remain in a
  separate server ledger.
- Claim values travel in a URL fragment, are removed from visible history
  before submission, and are persisted only as hashes.
- Input is bounded to 12,000 text characters. Submitted prompt text is not
  retained by default; a generated output enters history only after an
  explicit save.
- Pick My Bowl is general guidance only. Staff must confirm live price,
  availability, ingredients, nutrition, and allergens.
- Partner connection is promoted only after a completed task and is not live
  OAuth until approved credentials and terms exist.
- The campaign is not sponsored, endorsed by, or administered by the
  University of Southern California.

See `docs/architecture.md` for transaction and trust boundaries and
`docs/operations/` for the staff and launch runbooks.
