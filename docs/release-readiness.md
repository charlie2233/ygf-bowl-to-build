# YGF Bowl-to-Build beta release readiness

This document is the engineering handoff for the repository release. It keeps
four different claims separate:

1. source and automated local verification;
2. rendered campaign artifact inspection;
3. external deployment/account/database proof; and
4. store launch approval.

A checked local row never implies the later rows are complete.

## Release identity

| Field | Evidence |
| --- | --- |
| Repository | `charlie2233/ygf-bowl-to-build` |
| Release branch | `codex/ygf-bowl-to-build-beta` |
| Release commit | Reported in the final handoff rather than embedded in its own commit |
| Runtime | Next.js 16 / React 19 / Node.js 22+ / pnpm 11 |
| Acceptance plan | `docs/superpowers/plans/2026-07-26-ygf-bowl-to-build-beta.md` |
| Source research | `docs/source/` |

## Local source and automated evidence

The final release operator records the exact date, command, result, and commit
for each row. Until that final run is recorded, the status remains pending.

| Gate | Required command or evidence | Status |
| --- | --- | --- |
| Lint | `pnpm lint` | Pass on July 28, 2026 |
| TypeScript | `pnpm typecheck` | Pass on July 28, 2026 |
| Unit/integration/security contracts | `pnpm test` | Pass on July 28, 2026: 54 files, 401 tests |
| Production compilation | `pnpm build` | Pass on July 28, 2026: optimized build, page generation, and dynamic route manifest |
| Production dependency audit | `pnpm audit --prod` | Pass on July 28, 2026: 0 known vulnerabilities |
| Browser test discovery | `pnpm exec playwright test --list` | Pass on July 28, 2026: 61 tests across setup, desktop Chromium, and iPhone WebKit projects |
| Desktop Chromium and axe | `pnpm exec playwright test --project=desktop-chromium` | Pass in the July 28 full matrix: 30 desktop checks; the shared setup passed once |
| Full Playwright matrix | `pnpm test:e2e` | Pass on July 28, 2026: 61/61 across the single setup, desktop Chromium, and iPhone 13/WebKit projects |
| iPhone WebKit and axe | `pnpm exec playwright test --project=iphone-webkit` | Pass in the July 28 full matrix: 30 WebKit checks after the shared setup |
| Plaintext/secret scan | reviewed tracked files and built client output | Pass on July 27, 2026; no server secret variable names found in client output |
| Complete working-tree release review | deterministic 47-file worklist and focused validation | Pass on July 27, 2026; three low findings and one defense-in-depth item remediated before checkpoint |
| Remote identity | local SHA equals GitHub branch SHA after push | Verified at the July 28 handoff; exact SHA is reported outside this self-referential file |

Required behavioral evidence:

- typed claim and receipt-fragment claim resolve to the same normalized code;
- the fragment disappears from the visible URL before any claim request;
- one confirmed redemption grants exactly 3,000 credits with 14-day expiry;
- a successful task deducts exactly 120 credits;
- a failed provider call refunds the reservation;
- exact task retries do not run the provider or spend twice;
- a personal `ygf_` key is shown once while persistence contains only its
  keyed digest and safe descriptor;
- valid/revoked/rotated/expired key behavior and the OpenAI-compatible demo
  request are covered;
- multiple keys share the wallet-wide cost/idempotency ceiling, provider
  failure refunds, and expired replay content cannot re-execute;
- ordinary redemption reaches a useful AI task without exposing API concepts,
  while the optional Agent page copies config and tests a bounded request;
- the user-triggered check-in card contains no claim, private QR, key, email,
  user ID, or exact remaining balance;
- all four task presets use a small server allowlist of models;
- saved history contains output only after explicit user action;
- duplicate, expired, revoked, blocked, throttled, and malformed states fail
  safely;
- admin APIs reject non-admins and same-origin violations;
- generated batches contain unique codes, persist only hashes, and expose
  plaintext only in the one-time private response;
- public and private QR pairs decode to their intended, different URLs.

The browser setup project is the only test that redeems a single-use demo
code and produces the first useful result. The dependent viewport projects
contain only reusable reads plus a cross-origin admin request that is rejected
before mutation. Core wallet, all four task routes, history, Agent setup,
terminal-error, and admin states receive axe and horizontal-overflow checks.
The desktop and configured iPhone 13/WebKit evidence are complete for this
local source state. Physical-device camera scanning, platform assistive
technology, and production-origin behavior remain external gates.

### Dependency security override record

The July 28 lockfile uses two package-manager overrides scoped only to
Next.js:

- `next>postcss=8.5.18`; and
- `next>sharp=0.35.3`.

These replace the vulnerable versions otherwise selected by Next.js 16.2.12.
They are intentional, tested security overrides, but both sit outside that
Next.js release's declared dependency ranges (`postcss` 8.4.31 and
`sharp` `^0.34.5`). The local proof is the exact locked install plus the
0-finding production audit, lint, typecheck, 401-test suite, production build,
61-test Playwright matrix, and a production-mode 200 response for an 828x552
WebP optimized through Next.js/Sharp. It is not an upstream compatibility
guarantee and does not prove the production platform will install or execute
the same native image path.

Any Next.js upgrade reopens this gate. Before changing Next.js, the engineering
owner must inspect its new declared PostCSS and Sharp ranges, review current
advisories, prefer upstream-supported patched versions, decide whether either
override is still required, regenerate the lockfile, and rerun the production
audit, lint, typecheck, complete Vitest suite, production build, full Playwright
matrix, and production-mode image-optimization smoke. Record that evidence
against the candidate release SHA before deployment.

## Local visual and artifact evidence

| Gate | Local evidence | What it does not prove |
| --- | --- | --- |
| Accepted product concepts | side-by-side desktop/mobile inspection and fidelity ledger | manager or legal approval |
| Poster PDF | 24x36 inch page, raster inspection, decoder contract | final printer stock/crop/scan |
| Counter PDF | 5x7 inch page, raster inspection, decoder contract | counter lighting and physical scan |
| SVG variants | deterministic copy, dimensions, quiet zones, URLs | social-platform preview |
| Food image | sanitized user-supplied real YGF home-page photo plus generated bowl media recorded in the ledger | brand-rights approval for the real photo and approval/replacement of remaining generated collateral |
| Agent Pass fronts/backs | four 85.6×54 mm themes, credential-free shared back, Letter/A4 SVG plus full-page 300-DPI raster-only PDF review | physical registration, scratch layer, or store scan |
| Private Agent Pass fixture | matching text/QR decoded from final PDF raster, ignored 0700/0600 no-overwrite renderer, reflected long-edge duplex sheets | real batch custody or physical fulfillment |
| Safe check-in card | explicit SVG download with fixed public fields only | automatic social-platform upload or account identity |

Any change to public origin, image, copy, font metrics, QR modules, quiet zone,
or page dimensions reopens the affected artifact gates.

## External engineering gates

These require live account state and are intentionally not satisfied by this
checkout:

- [ ] Deploy the verified commit over HTTPS at the approved canonical origin,
  `https://malatangai.com`.
- [ ] Install the verified lockfile on the production build platform and
  recheck the scoped PostCSS/Sharp override record above. Confirm the platform
  build and a real optimized image request succeed; local build proof alone
  does not satisfy this gate.
- [ ] Apply the migration to a disposable/staging Supabase project and run
  concurrent redemption, task lease, spend, refund, and replay smoke tests.
- [ ] Apply the reviewed migration to production and verify RLS with separate
  anonymous, user, admin, and service-role paths.
- [ ] Configure magic link, Google, and Apple callbacks in Supabase and test
  each approved provider.
- [ ] Enable Supabase anonymous sign-in and prove scan → anonymous wallet →
  first web AI result with no login screen. Verify the session receives the
  `authenticated` role and remains inside user-bound RLS.
- [ ] Enable manual identity linking and prove Google/Apple upgrades preserve
  the same wallet. Configure CAPTCHA/Turnstile, edge limits, and an approved
  anonymous-user cleanup policy; none is claimed as applied by this checkout.
- [ ] Schedule the service-role-only
  `tombstone_expired_agent_responses(500, null)` RPC and prove its indexed,
  bounded idle-time execution. Logical 15-minute expiry alone is not physical
  deletion proof; this checkout does not claim pg_cron/Supabase scheduling is
  installed. Use live `EXPLAIN` to verify the wallet branch uses the
  wallet-leading partial index and the global branch uses the expiry-leading
  partial index.
- [ ] Install independent production claim-cookie, abuse-signal, and task
  fingerprint secrets.
- [ ] Install independent Agent key-digest and request-fingerprint secrets;
  test rotation with the documented incident process.
- [ ] Install the server-only `OPENAI_API_KEY`; verify project billing/limits,
  all four pinned snapshots, current token prices, the fixed OpenAI endpoint,
  request timeout, safe error mapping, usage accounting, and billing alerts.
- [ ] Keep `YGF_AGENT_GATEWAY_ENABLED=false` until a staging key lifecycle,
  `/v1/models`, one completion, idempotent replay, provider failure refund,
  rate/concurrency limit, and wallet-wide $3.00 cap smoke all pass.
- [ ] Confirm production logs contain no plaintext claim, raw IP, submitted
  prompt, provider credential, service-role value, or full provider payload.
- [ ] Verify alerting and a server-side stop path for redemption and provider
  execution.
- [ ] Confirm the OpenAI API data controls for the production project.
  `store:false` is not zero retention: default abuse-monitoring logs may retain
  content for up to 30 days. Treat Zero Data Retention as a separate external
  eligibility/configuration gate.

## Store and campaign launch gates

These require named human owners:

- [ ] YGF manager verifies the participating location, current menu/prices,
  qualifying $25+ checkout rule, ingredient facts, and allergen escalation.
- [ ] Brand owner confirms rights for the selected user-provided YGF photo or
  supplies an approved replacement; regenerate all affected artifacts.
- [ ] Legal/privacy owner approves terms, privacy, university disclaimer,
  retention/deletion schedule, and incident path.
- [ ] Campaign owner renders every public QR with the live HTTPS origin and
  decodes final digital and physical proofs.
- [ ] Manager creates, secures, reconciles, and trains staff on the approved
  private claim batch.
- [ ] Printer produces 100%-scale poster/counter and 85.6×54 mm Agent Pass
  proofs with the approved scratch/fold/tear protection; staff scan them under
  real store conditions and verify front/back registration.
- [ ] The documented 10–20-person soft test closes every critical issue.
- [ ] Named owners complete the go/no-go record and rollback drill in
  `docs/operations/launch-checklist.md`.

## Honest release statement

When the local matrix and final push are recorded, the accurate claim is:

> The scoped GitHub branch contains a locally verified beta implementation and
> print-ready candidate artifacts.

It is not accurate to call the campaign deployed, live-provider verified,
production-database verified, physically proofed, store trained, soft-tested,
or approved for launch until the matching external rows above have evidence.
