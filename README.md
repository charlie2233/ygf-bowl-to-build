# YGF Bowl-to-Build

YGF Bowl-to-Build turns a qualifying meal into one simple AI balance:

1. A guest spends $16+ in one completed transaction.
2. Staff hand over one private row containing the same claim as text and QR.
3. The guest scans or enters the claim, accepts the terms, and receives 3,000
   non-cash Build Credits for 14 days in a private guest wallet—without a
   login screen.
4. Study, Coding, Career, and Pick My Bowl each spend 120 credits per run.
5. As an optional advanced path, the guest can link Google or Apple, then
   create a personal, limited `ygf_…` API key and connect an
   OpenAI-compatible Agent. Agent calls reserve and settle variable credits
   from the same wallet.

The default experience is task-first: **Use AI now** is dominant, **Connect my
Agent** is secondary, and **Developer API key** is advanced. A physical claim
is never an API key. Provider credentials stay on the server.

## What is in this repository

- Next.js 16 App Router application and responsive campaign UI
- five-language customer journey (English, Chinese, Spanish, French, and
  Russian) across redemption, wallet, tasks, results, history, sharing, auth,
  and customer-facing error states, with one persistent accessible language
  control
- a numbered **01 Claim / 02 Connect my Agent** first-viewport path with
  scoped GSAP timelines, ScrollTrigger reveals, fine-pointer depth, and a
  static reduced-motion path
- Supabase Auth/Postgres production adapter, RLS, and atomic ledger RPCs
- deterministic local demo mode with the receipt code `BOWL7K2A`
- fixed-endpoint OpenAI Chat Completions adapter plus deterministic demo provider
- personal one-time-display API keys and an OpenAI-compatible `/v1` demo
  gateway with wallet-wide limits, revocation, rotation, and idempotency
- manager-only batch, revocation, funnel, inventory, and cost operations
- safe user-triggered check-in cards plus four collectible Agent Pass fronts,
  shared backs, print PDFs, and private claim renderers
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
- an OpenAI API project with billing and project limits for live inference

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
It still requires explicit, independent task and Agent request fingerprint
secrets of at least 32 bytes. It is intentionally refused when
`NODE_ENV=production`.

```sh
export YGF_TASK_FINGERPRINT_SECRET="$(openssl rand -hex 32)"
export YGF_AGENT_REQUEST_FINGERPRINT_SECRET="$(openssl rand -hex 32)"
YGF_DEMO_MODE=true pnpm dev
```

Open `http://127.0.0.1:3000`, claim `BOWL7K2A`, and use the four workflows.
Demo authentication represents one local user and the demo provider returns
deterministic structured output through the same application contract as the
live provider. Visit `/connect/agent` to create a process-local personal key,
copy an OpenAI-compatible configuration, and run the bounded demo connection
test.

For a local phone acceptance test that keeps the in-memory demo wallet but
uses the real OpenAI provider, install `OPENAI_API_KEY` in the ignored
`.env.local` file and start with:

```sh
YGF_DEMO_MODE=true YGF_DEMO_PROVIDER=openai pnpm dev
```

The switch is explicit so ordinary demo and automated-test runs never create
provider charges unexpectedly. It applies only to the four browser task
workflows; the local Agent gateway remains deterministic. Demo mode remains
disabled in production.

To scan from a phone on the same trusted Wi-Fi, replace `<mac-lan-ip>` and
bind the development server explicitly:

```sh
YGF_DEMO_MODE=true \
YGF_DEMO_PROVIDER=openai \
YGF_PUBLIC_ORIGIN=http://<mac-lan-ip>:3100 \
NEXT_PUBLIC_APP_URL=http://<mac-lan-ip>:3100 \
pnpm exec next dev -H <mac-lan-ip> -p 3100
```

This is short-lived HTTP acceptance only. Do not enter sensitive prompts, and
stop the LAN server after testing because demo devices share one process-local
wallet. Binding the exact LAN IP also lets Next.js authorize that development
origin without opening its internal assets to every local interface. On this
insecure phone-testing origin, request IDs still come from Web Crypto and copy
buttons use a selection fallback when the secure Clipboard API is unavailable.

The selected language persists across customer routes and reloads. Reviewed
legal, privacy, creator, staff, and advanced Agent instructions remain in
English; non-English users receive an explicit availability notice, and the
English section is tagged for correct assistive-technology pronunciation.
Administrative routes remain English-only without overwriting the customer's
saved preference when they return to the campaign.

The in-memory state lasts only for the development server process. It is not a
deployment, data-migration, concurrency, or external-provider proof.

## Mode 2: local application with Supabase

Create a development Supabase project, then provide:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- independent 32-byte-or-longer values for
  `YGF_CLAIM_COOKIE_SECRET`, `YGF_ABUSE_SIGNAL_SECRET`, and
  `YGF_TASK_FINGERPRINT_SECRET`, plus the independent Agent secrets
  `YGF_AGENT_API_KEY_DIGEST_SECRET` and
  `YGF_AGENT_REQUEST_FINGERPRINT_SECRET`
- `NEXT_PUBLIC_APP_URL` and `YGF_PUBLIC_ORIGIN`
- a server-only `OPENAI_API_KEY`
- optionally `YGF_ADMIN_EMAIL_ALLOWLIST`

Leave `YGF_DEMO_MODE` unset. Apply the migration through the Supabase CLI:

```sh
supabase link --project-ref <development-project-ref>
supabase db push
pnpm dev
```

Enable Supabase anonymous sign-ins for the scan-first wallet. Configure the
approved Google and Apple providers, exact callback URLs, and manual identity
linking in the Supabase console. Magic link remains a manual fallback for a
non-anonymous account; it is intentionally hidden while upgrading an
anonymous wallet because it must not create a separate account.

Anonymous users receive Supabase’s `authenticated` database role and stay
inside the same user-bound wallet/task RLS policies. They are not custom guest
IDs. Until an identity is linked, clearing site data can permanently lose
access to that wallet. Anonymous-user cleanup is not automatic in this
repository. Supabase dashboard configuration, CAPTCHA/Turnstile, edge rate
limits, manual-linking behavior, anonymous cleanup, and a live upgrade test
are external state and are not completed merely by applying migrations.

## Mode 3: production

Production uses the same Supabase and provider variables as Mode 2, with an
approved HTTPS public origin. `YGF_DEMO_MODE=true` fails closed in production.
The public Agent provider path also fails closed unless
`YGF_AGENT_GATEWAY_ENABLED=true`; leave it false until the provider, domain,
retention, billing, and concurrency checks below are complete.
Deploy the application only after:

- applying the migration to the intended production project;
- verifying RLS and server-only service-role access with separate user/admin
  accounts;
- configuring auth callback origins and provider credentials;
- enabling and testing anonymous sign-in, manual identity linking,
  CAPTCHA/Turnstile, edge rate limiting, and anonymous-user cleanup;
- setting both independent Agent HMAC secrets and explicitly enabling the
  gateway only after one real provider request, refund, and cost-cap smoke;
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

## Personal Agent API

The gateway exposes a deliberately small, non-streaming OpenAI-compatible
surface:

- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /api/keys`, `GET /api/keys`
- `DELETE /api/keys/[id]`
- `POST /api/keys/[id]/rotate`

A created secret is shown once. Postgres stores only a versioned HMAC digest,
the safe prefix/last four, owner/wallet binding, scopes, limits, and lifecycle
timestamps. Keys expire at the earlier of 14 days or wallet expiry. Every call
rechecks key state, ownership, wallet expiry, the server model allowlist,
per-key RPM/concurrency, wallet concurrency, remaining credits, and the
wallet-wide $3.00 provider-cost ceiling. Provider failures refund user
Credits but conservatively commit the reserved provider ceiling, so a possibly
billed upstream attempt cannot evade the wallet cap; wallet-scoped idempotency
prevents multiple keys from charging the same request twice.

Anonymous wallet users can use the web tools, history, and safe check-in card,
but cannot create or rotate Agent keys. They must link Google or Apple to the
same Supabase user first. Listing or revoking an existing key remains safe.

```env
OPENAI_BASE_URL=https://<approved-production-origin>/v1
OPENAI_API_KEY=ygf_<personal-secret>
```

`POST /v1/chat/completions` requires a stable `Idempotency-Key` header for safe
transport retries. The server stores only a domain-separated HMAC digest of
that value; never use a personal key or eight-character claim as the header.
`/v1` rejects every query string. In production, create/rotate/models/chat
remain unavailable until `YGF_AGENT_GATEWAY_ENABLED=true`; existing keys can
still be listed or revoked.

For SDK calls, generate one opaque retry ID before the request and reuse it
only if that same request is retried (do not configure one constant default
header for all calls):

```ts
const retryId = crypto.randomUUID();
await client.chat.completions.create(
  { model: "fast", messages },
  { headers: { "Idempotency-Key": retryId } },
);
```

This is intentionally not drop-in for clients that cannot add request headers;
a real SDK/header/retry smoke remains a production gate.

Never put a personal key in a URL, QR code, public chat, GitHub repository,
analytics event, browser bundle, or frontend source. A redemption claim and an
API key are separate bearer credentials. Production inference goes directly
from the server to OpenAI’s fixed Chat Completions endpoint; neither a browser
nor a diner can choose or override that destination.

The server currently pins these OpenAI snapshots: `gpt-5.4-mini-2026-03-17`,
`gpt-5.4-nano-2026-03-17`, `gpt-4.1-mini-2025-04-14`, and
`gpt-5-mini-2025-08-07`. Pricing constants were checked against OpenAI’s
standard token prices on 2026-07-27 and must be rechecked before launch.
Displayed provider spend is an estimate from validated token usage and static
prices; uncertain failed attempts conservatively book their ceiling, so this
ledger is not the OpenAI invoice.
Requests set `store:false`; this prevents Chat Completions application-state
storage, but does not claim zero retention. OpenAI’s default abuse-monitoring
logs may retain content for up to 30 days. API data is not used for training
by default unless the account opts in. Zero Data Retention eligibility and
configuration remain an external production gate.

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

## Collectible Agent Pass artwork

Render and verify the public, credential-free four-theme system:

```sh
node scripts/render-agent-pass-assets.mts
node scripts/render-agent-pass-assets.mts --verify-only
```

Outputs include 85.6×54 mm Study, Coding, Career, and Pick My Bowl fronts, a
shared no-secret back, Letter/A4 imposition sheets, SVGs, PDFs, and raster
previews under `output/agent-pass/`. Every PDF page is a full-page, 300-DPI
DeviceRGB raster with no PDF font or text object; the SVGs remain the editable
source. The selected food image came from the user-provided `南加大图片.zip`;
its brand/public-print rights are not inferred and remain a launch gate
recorded in `docs/design/media-ledger.md`.

After an administrator has downloaded the one-time CSV into ignored
`private/`, generate protected per-row fronts/backs with:

```sh
chmod 600 private/<admin-download>.csv
node scripts/render-private-agent-pass-batch.mts \
  --input private/<admin-download>.csv \
  --out private/<agent-pass-batch>.html
```

For `N` rows, the renderer creates a custody HTML preview, one front and one
back SVG per Letter/A4 page, and one duplex PDF for each paper size. Each
portrait PDF is a 2×4, 100%-scale, long-edge bundle ordered
front-page-1/back-page-1, with the back positions reflected for physical
registration. The renderer accepts only direct ignored `private/` paths,
requires a 0700 private root and 0600 regular files, refuses overwrite, and
prints no claim to stdout or stderr. Each protected row pairs one
human-readable claim with a QR for `/redeem#code=<same-claim>`; blank slots
remain blank on both sides. The public back and public campaign QR never carry
a claim.

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
- Web presets spend exactly 120 credits. Agent requests instead convert
  server-verified provider micro-US dollars to credits (default 1,000 micro-USD
  per credit), reserve the model ceiling, and settle actual cost.
- Claim values travel in a URL fragment, are removed from visible history
  before submission, and are persisted only as hashes.
- Input is bounded to 12,000 text characters. Submitted prompt text is not
  retained by default; a generated output enters history only after an
  explicit save.
- Successful Agent response payloads are stored in Postgres for a logical
  15-minute replay window and may echo request text. The raw request prompt is
  not a separate column. Physical tombstoning is lazy; a reviewed indexed,
  bounded scheduled cleanup remains a launch gate.
- A check-in task label comes only from the server’s earliest successful task
  history. `/api/share-card` accepts only `{}` and records at most one
  generation signal per wallet.
- Pick My Bowl is general guidance only. Staff must confirm live price,
  availability, ingredients, nutrition, and allergens.
- The advanced path creates a YGF personal Agent key; no external partner
  account is promoted in the default product flow.
- The campaign is not sponsored, endorsed by, or administered by the
  University of Southern California.

See `docs/architecture.md` for transaction and trust boundaries and
`docs/operations/` for the staff and launch runbooks.
