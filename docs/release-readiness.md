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
for each row. The July 29 rows below are the current pre-commit release
candidate evidence; the immutable GitHub SHA is reported in the final handoff
after this document is committed.

| Gate | Required command or evidence | Status |
| --- | --- | --- |
| Lint | `pnpm lint` | Pass on July 29, 2026 |
| TypeScript | `pnpm typecheck` | Pass on July 29, 2026 |
| Unit/integration/security contracts | each discovered Vitest file in a fresh `pnpm vitest run <file>` process | Pass on July 29, 2026: 74/74 files and 543/543 tests, including 68 non-PGlite files (528 tests) and 6 PGlite files (15 tests), with every process exiting 0 |
| Production compilation | `pnpm build` | Pass on July 29, 2026: optimized build, page generation, and dynamic route manifest |
| Production dependency audit | `pnpm audit --prod` | Pass on July 29, 2026: 0 known vulnerabilities |
| Browser test discovery | final `pnpm test:e2e` runner manifest | Pass on July 29, 2026: 83 tests across setup, desktop Chromium, and iPhone WebKit projects |
| Desktop Chromium and axe | final `pnpm test:e2e` matrix | Pass on July 29, 2026: 41 desktop checks; the shared setup passed once |
| Full Playwright matrix | `pnpm test:e2e` | Pass on July 29, 2026: 83/83 across the single setup, desktop Chromium, and iPhone 13/WebKit projects |
| iPhone WebKit and axe | final `pnpm test:e2e` matrix | Pass on July 29, 2026: 41 WebKit checks after the shared setup |
| Plaintext/secret scan | reviewed tracked files and built client output | Pass on July 29, 2026; no OpenAI, personal Agent, or JWT-shaped secret values found in built client output. The public `OPENAI_API_KEY` field label remains intentionally present in the Agent configuration UI |
| Complete working-tree release review | full scoped diff plus independent maintenance/security and product/QA review | Pass on July 29, 2026; all medium-or-higher review findings remediated and independently rechecked before checkpoint |
| Remote identity | local SHA equals GitHub branch SHA after push | Pending for this pre-commit candidate; the final handoff records the exact local/upstream/`ls-remote`/Vercel SHA comparison without embedding a commit's own identity here |

Required behavioral evidence:

- typed claim and receipt-fragment claim resolve to the same normalized code;
- the fragment disappears from the visible URL before any claim request;
- one confirmed redemption grants exactly 3,000 credits with 14-day expiry;
- the same account retrying that same code receives its current wallet without
  another grant, balance reset, or expiry extension, while a different account
  remains rejected;
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
0-finding production audit, lint, typecheck, 537-test suite, production build,
83-test Playwright matrix, and a production-mode 200 response for an 828x552
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
| Food media | 203,071-byte desktop and 169,063-byte mobile static hero JPEGs derived from the real YGF ingredient-wall source, plus the sanitized supporting photo; exact provenance and the generated-bowl disclosure are recorded in the media ledger, and the old cinematic WebM/MP4/poster set is unused | brand-rights approval for the user-supplied source, creative approval of the AI-generated bowl and final composites, and deployed responsive-selection/visual review |
| Agent Pass fronts/backs | four 85.6×54 mm themes, credential-free shared back, Letter/A4 SVG plus full-page 300-DPI raster-only PDF review | physical registration, scratch layer, or store scan |
| Private Agent Pass fixture | matching text/QR decoded from final PDF raster, ignored 0700/0600 no-overwrite renderer, reflected long-edge duplex sheets | real batch custody or physical fulfillment |
| Production claim batch `c0313939-a965-41a6-8e61-67ba37db0c2c` | 500 active eligible rows; exact database hash parity; 500/500 HTML and final 63-page Letter-PDF raster QR decode; mode-0700/0600 ignored custody; idempotent create/activate replay; zero admin profiles at rest | commercial-printer approval, credential-concealing finish, brand rights, CMYK/bleed/duplex proof, physical scans, staff training, soft test, or distribution authorization |
| Safe check-in card | explicit SVG download with fixed public fields only | automatic social-platform upload or account identity |

Any change to public origin, image, copy, font metrics, QR modules, quiet zone,
or page dimensions reopens the affected artifact gates.

## External engineering gates

The checked production-hosting items were satisfied on July 29, 2026. The
remaining items still require live account or operator state and are not
satisfied by this checkout.

- [x] Deploy code-bearing SHA
  `a782560380579378e087f8d1b5f200e2c2d18909` over HTTPS at
  `https://malatangai.com` as Vercel production deployment
  `dpl_9tLeXnwsDJF9uiMWMyXWWamojh8W`. The deployment reported `READY`;
  `www.malatangai.com` returned a permanent redirect to the apex with
  path/query preserved; and the deployed HTML declared the apex canonical
  URL.
- [x] Install the verified lockfile on the production build platform and
  recheck the scoped PostCSS/Sharp override record above. Confirm the platform
  build and a real optimized image request succeed. Vercel installed with
  `pnpm install --frozen-lockfile`, completed the Next.js production build,
  and returned a successful 1280 × 720 optimized image response.
- [ ] Apply all migrations, including
  `202607300001_same_account_redemption_retry.sql` followed by
  `202607300002_same_account_redemption_retry_wallet_lock.sql`, to a
  disposable/staging Supabase project. Prove the second migration serializes
  the retry with wallet spend/settlement and returns the authoritative current
  wallet without adding or resetting credits, different accounts remain
  rejected, then run concurrent task lease, spend, refund, and replay smokes.
- [x] Production has
  `202607300001_same_account_redemption_retry.sql` and
  `202607300002_same_account_redemption_retry_wallet_lock.sql`. A live
  same-owner retry returned the existing wallet/current balance without a new
  grant, reset, or expiry extension; a different owner was rejected; and a
  competing wallet update blocked until the retry transaction rolled back.
  The production RPC is `SECURITY DEFINER`, owned by `postgres`, fixes
  `search_path=pg_catalog`, and grants execution only to `service_role`.
- [ ] Complete browser-session and RLS proof with separate anonymous, linked
  user, admin, and service-role paths, including a two-account cross-owner
  claim attempt. The database service-role probe above does not replace that
  browser evidence.
- [x] Production Supabase Manual Linking is enabled and the redirect allowlist
  contains the exact `https://malatangai.com/auth/callback` entry. It contains
  no required wildcard or `www` callback.
- [ ] Install Google and Apple provider client IDs/secrets in Supabase and test
  each normal OAuth and anonymous `linkIdentity` round trip. Both providers
  remain externally blocked until those credentials exist.
- [ ] Test the approved magic-link recovery callback for a non-anonymous
  account.
- [ ] Enable Supabase anonymous sign-in and prove scan → anonymous wallet →
  first web AI result with no login screen. Verify the session receives the
  `authenticated` role and remains inside user-bound RLS.
- [ ] After provider credentials are installed, prove Google/Apple linking
  preserves the same anonymous user and wallet, changes the account to
  non-anonymous, and only then unlocks Agent key creation/rotation. Configure
  CAPTCHA/Turnstile, edge limits, and an approved anonymous-user cleanup
  policy; none is claimed as applied by this checkout.
- [x] Install the managed, `malatangai.com`-restricted Turnstile widget and all
  three Vercel Production variables, then deploy the enabled boundary.
  Production deployment `dpl_CWKRz8EvJ6ZhSLreyZ17T7fM66WC` showed a real
  Safari `Success!` widget; missing and deliberately invalid tokens failed
  closed with HTTP 403, with no application errors in the checked runtime-log
  window.
- [ ] Complete the human valid-token/invalid-code submission receipt and the
  expired/duplicate, outage, and analytics checks. Supabase leaked-password
  protection is also pending an explicit Pro-or-higher plan decision after the
  Management API returned HTTP 402 on 2026-07-30. Keep the 11 anonymous-access
  warnings as reviewed scan-first/RLS design signals rather than disabling
  anonymous redemption, and keep Supabase Auth CAPTCHA off until its second
  challenge-token flow exists.
- [ ] Apply `20260729060005_global_bounded_maintenance.sql`, install an
  independent host `CRON_SECRET`, and deploy the checked-in daily
  `/api/internal/maintenance` schedule. Prove an authorized run returns only
  bounded count fields and an unauthenticated request returns no data. This
  source does not claim the host schedule is installed or exercised.
- [ ] Use live `EXPLAIN` to verify the wallet Agent replay branch uses the
  wallet-leading partial index and the global maintenance branches use their
  expiry/lease indexes. Logical expiry alone is not physical deletion proof.
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
- [ ] Verify alerting and the server-side stop paths: production requires
  exact `true` for `YGF_REDEMPTION_ENABLED` and `YGF_WEB_TASKS_ENABLED`, and
  keeps `YGF_AGENT_GATEWAY_ENABLED=false` until its own staging proof. Rehearse
  setting each relevant value to `false` and rolling it out without a wallet
  mutation or provider call. The July 29 production smoke confirmed
  `REDEMPTION_PAUSED`, `WEB_TASKS_PAUSED`, and `gateway_not_enabled`; alerting
  and the controlled rollout rehearsal remain open.
- [ ] Confirm the OpenAI API data controls for the production project.
  `store:false` is not zero retention: default abuse-monitoring logs may retain
  content for up to 30 days. Treat Zero Data Retention as a separate external
  eligibility/configuration gate.

## Store and campaign launch gates

These require named human owners:

- [ ] YGF manager verifies the participating location, current menu/prices,
  qualifying $25+ checkout rule, ingredient facts, and allergen escalation.
- [ ] Brand owner confirms rights for the selected user-provided YGF
  ingredient-wall source and approves the disclosed AI-generated bowl in
  `ygf-authentic-hero-desktop-v2.jpg` and
  `ygf-authentic-hero-mobile-v2.jpg`, or supplies approved replacements;
  repeat responsive browser checks and regenerate all affected artifacts.
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
