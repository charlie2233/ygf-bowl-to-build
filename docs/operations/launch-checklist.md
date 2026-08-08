# Bowl-to-Build beta launch checklist

Generated files and green local tests are not launch approval. Every gate
below needs a named owner, evidence link or note, date, and explicit sign-off.

## Owners

| Area | Required owner | Decision |
| --- | --- | --- |
| Offer, menu and prices, staff policy | YGF store manager | Confirms the current **$25+** threshold and checkout language match the live register |
| Code inventory and exceptions | Campaign manager | Controls batches, manager-only revoke/reissue, and reconciliation |
| Optional Claude gifts | Campaign manager plus account owner | Buys and reconciles one official transferable gift per selected row without sharing accounts |
| Application, database, AI spend | Engineering owner | Verifies production configuration, migrations, alarms, and rollback |
| Privacy, terms, retention | YGF accountable owner | Approves data handling, deletion/retention, incident path, and public copy |
| Photography and print | Creative/brand owner | Confirms rights for the supplied YGF source photo, approves the disclosed AI-generated bowl treatment or a replacement, and approves final web/print proofs |
| External account configuration | Named account owners | Verify deployment, Supabase, AI provider, Formspree/email, analytics, and any partner account |

## Offer and creative gates

- [ ] Store manager verifies the current menu and prices at the participating
  location and signs off that **$25+ in one completed transaction** is
  operationally correct.
- [ ] Legal/communications owner approves the full promotional fine print,
  university disclaimer, terms, privacy notice, and creator disclosure.
- [ ] Approve the responsive static home-page hero:
  `public/media/ygf-authentic-hero-desktop-v2.jpg` (1672 × 941; 203,071 bytes)
  and `public/media/ygf-authentic-hero-mobile-v2.jpg` (1122 × 1402; 169,063
  bytes). Confirm rights for their user-supplied YGF ingredient-wall source
  and explicitly approve the AI-generated finished bowl treatment; do not
  represent either composite as unmodified documentary photography. Confirm
  both remain free of campaign text, USC marks, claim secrets, QR codes, API
  keys, and people. The superseded cinematic poster/WebM/MP4 is not approved
  or required for the current runtime.
  Obtain brand-owner approval for the supporting user-supplied
  `public/media/ygf-user-photo.png` and any retained real-photo derivative.
  Approve or replace `public/media/malatang-hero.png` anywhere it remains in
  wallet/share or generated collateral. Record source, permission, approver,
  and date in the media ledger.
- [ ] Regenerate all assets after the photo or copy changes:
  `node scripts/render-campaign-assets.mts`.
- [ ] For the final production origin, run the renderer and then the read-only
  exact deterministic verifier with the same reviewed `--origin` value:
  `node scripts/render-campaign-assets.mts --origin
  https://malatangai.com --verify-only`.
- [ ] Review the 24x36 poster, 11x17 poster, 5x7 counter card, feed, story, and
  horizontal asset at final size. No clipping, hidden text, unintended logo,
  or unsupported USC mark.
- [ ] Print PDFs at 100% scale. Confirm page dimensions are 24x36 inches and
  5x7 inches; do not silently “fit to page.”
- [ ] Decode every public campaign QR from a final printed proof. Confirm it
  opens HTTPS `/offer` with the asset's exact `utm_source` and contains no
  plaintext code.
- [ ] Decode sample private claim QRs from the actual claim-row printer. The
  decoded `/redeem#code=...` value must match the paired human-readable code,
  with an intact four-module quiet zone.
- [ ] Regenerate the credential-free static redemption-card pack with
  `node scripts/render-static-redemption-card.mts`. Confirm the committed
  front, back, duplex PDF, review image, and manifest contain only the fixed
  `SAMPLE ONLY` code; decode the static QR to exact HTTPS `/redeem` and confirm
  it contains no claim or query value.
- [ ] Creative/brand owner approves the static card's user-source/AI-composite
  food image, official-site logo use, Simplified Chinese and English copy,
  bleed, trim, color, and final proof. Public availability of an image or logo
  is not itself print permission.
- [ ] Follow
  [the Avery 5260 label production runbook](./avery-5260-label-production.md).
  Render the checked-in fake-code sheet first. Then run the local-only live
  merge and `--verify-only` pass against the already-audited CSV. Confirm
  500/500 distinct labels across 17 Letter sheets, 20 labels on the final
  sheet, exact source commitment, no overwrite, and mode 0600 for both outputs.
  Never upload a source or output to a label or card vendor.
- [ ] Approve either a documented visible-code custody model or a concealment
  layer for the Avery label. Print the final static card and locally produced
  label at 100%, apply the label, verify trim/placement/adhesion and physical
  legibility, scan the static QR under store lighting, and manually enter only
  an approved synthetic or soft-test code.
- [ ] Regenerate and verify the four Agent Pass fronts, shared no-secret back,
  Letter/A4 sheets, SVG/PDF files, and raster previews with
  `node scripts/render-agent-pass-assets.mts` followed by `--verify-only`.
- [ ] Print the 85.6×54 mm Agent Pass at 100%, verify front/back registration,
  and approve a scratch, fold, or tear layer that fully covers both the human
  claim and private QR. The visible back says not to photograph after opening.
- [ ] Scan each protected print proof. Human claim and QR must match exactly;
  the public front/back, public check-in card, and public campaign QR must
  remain credential-free.

## Product and security gates

- [ ] Production deployment is reachable over HTTPS, canonical links use
  `https://malatangai.com`, and `www.malatangai.com` redirects permanently to
  the apex without losing path or query.
- [ ] The release SHA retains the reviewed `pnpm-workspace.yaml` overrides
  `next>postcss=8.5.18` and `next>sharp=0.35.3`, and a frozen production
  install, `pnpm audit --prod`, and `pnpm build` are recorded for that SHA.
  The audit must report 0 known vulnerabilities.
- [ ] Treat both dependency overrides as tested security exceptions outside
  Next.js 16.2.12's declared ranges, not as upstream compatibility proof.
  Verify an optimized image request on the deployment platform before launch.
- [ ] Any Next.js upgrade reopens the dependency gate: inspect the new declared
  PostCSS/Sharp ranges and current advisories, remove an override when the
  upstream release safely supports the patched version, regenerate the
  lockfile, and rerun audit, lint, typecheck, the complete Vitest and
  Playwright matrices, production build, and image-optimization smoke before
  deploying the upgrade.
- [ ] Database migrations and row-level access controls are applied in the
  production project, then verified with non-admin and admin accounts.
- [ ] For migration `202607270004_agent_request_admission.sql`, keep
  `YGF_AGENT_GATEWAY_ENABLED=false`, stop new `/v1` traffic, and drain or
  terminalize every running Agent request before applying it. Afterward,
  count—not select—the legacy rows that fail
  `idempotency_key ~ '^idem_[0-9a-f]{64}$'`. If any remain, stop rollout and
  perform an approved accounting-preserving credential remediation; never
  silently delete request or usage rows. Only with a zero count, validate via
  `alter table public.agent_requests validate constraint
  agent_requests_hashed_idempotency_key`, then confirm `convalidated=true`
  before enabling traffic.
- [x] Production Supabase Manual Linking is enabled and its redirect allowlist
  contains the exact `https://malatangai.com/auth/callback` entry, without a
  wildcard or `www` callback. This is retained configuration from the prior
  flow; the new merge path uses normal OAuth and does not depend on
  `linkIdentity`.
- [ ] Application callback behavior returns only to approved same-origin
  destinations in a live OAuth/account-merge round trip.
- [ ] Public validation and redemption limits work behind the production
  proxy with the reviewed five-minute ceilings (validation:
  network/session/code/account `300/12/20/10`; redemption:
  network/session/code/account `200/5/10/5`). Confirm canonical Vercel IP
  parsing, sorted advisory locks, zero-write denials, and bounded
  `Retry-After`; raw IP addresses and plaintext codes are not logged or stored.
- [ ] Admin routes reject non-admin users. Batch download is one-time,
  manager-controlled, and plaintext outputs stay only in the ignored
  `private/` location with restricted permissions.
- [x] Production has
  `202607300001_same_account_redemption_retry.sql` followed by
  `202607300002_same_account_redemption_retry_wallet_lock.sql`. A live
  same-owner retry returned the existing wallet and current balance without
  another grant, balance reset, or expiry extension; a different owner was
  rejected. A competing wallet update blocked while the retry transaction
  held its lock and succeeded after rollback. The RPC is `SECURITY DEFINER`,
  owned by `postgres`, fixes `search_path=pg_catalog`, and is executable only
  by `service_role`. This dated evidence predates and does not verify the new
  multi-card top-up migration.
- [ ] Pause and drain redemption, apply
  `202607310005_multi_grant_account_merge.sql` to production, refresh the
  schema cache, and verify the new/changed functions are owned by `postgres`,
  use a fixed `search_path`, and are executable only by `service_role`. Prove
  one identity can accumulate distinct 3,000-Credit cards in one wallet, every
  code grants once, a same-code retry neither regrants nor extends expiry, and
  a successful new-card top-up rolls the whole wallet expiry to 14 days later.
  This remains pending until deployment and live verification are recorded.
- [ ] Apply
  `202607300003_multidimensional_redemption_admission.sql` before deploying
  the corresponding route code. Before applying, set
  `YGF_REDEMPTION_ENABLED=false`, drain redemption traffic, and confirm both
  attempt tables have at most 10,000 rows; otherwise stop and plan a dedicated
  concurrent-index migration using a pinned and verified Supabase CLI.
  Verify v1 and v2 admission functions coexist for migration-first rollback,
  the app calls only v2, all functions are owned by `postgres` and executable
  only by `service_role`, a denied request performs no insert/update/delete,
  and a v2 admitted attempt remains finalizable through the next bucket.
  Confirm the exact shared v1/v2 user and signal advisory-lock formulas in the
  live catalog, then overlap multi-session v1/v2 calls at the fifth account
  attempt and prove no sixth admission. Only v2 has zero-write denial and no
  request-path cleanup; v1 retains its legacy behavior for rollback, so keep
  traffic paused/drained until every application instance calls v2.
  Keep v1 until live v2 verification, then remove it only in a later contract
  migration.
- [ ] Verify same-owner retries remain idempotent but rate-limited: attempts
  one through five in a five-minute bucket return the existing wallet without
  another grant, while attempt six returns 429.
- [ ] Inject an attempt-finalization failure after a committed redemption:
  the first response must be retryable 503 with the pending claim retained,
  and one retry must recover to success with one wallet and one grant.
- [ ] Complete the remaining live redemption matrix with two normal browser
  accounts plus invalid, expired, and revoked claims. Record only non-secret
  references and outcomes; do not place claim values in the evidence log.
- [ ] Ordinary claims remain credits-only. A special test claim atomically
  grants the normal wallet plus exactly one reward, and retries/concurrency do
  not reassign it.
- [ ] A dedicated production `YGF_REWARD_ENCRYPTION_KEY` is installed before
  any gift assignment. It is not reused for claims, Agent keys, task
  fingerprints, or abuse signals.
- [ ] Claude gift assignment accepts only an official exact-host HTTPS gift
  URL and future bounded expiry. Database rows, claim CSV/QR, HTML, client
  bundles, logs, analytics, and support evidence contain no plaintext gift
  URL.
- [ ] Staging verifies owner reveal plus non-owner, unauthenticated,
  cross-origin, expired, revoked, tampered-ciphertext, and disabled-inventory
  failures. Redirect headers are no-store/no-referrer and no automatic
  navigation occurs.
- [ ] A manager can revoke a selected gift only with its non-secret row
  reference. Verify database-admin authorization, assigned/revealed-to-revoked
  and already-expired idempotence, and that no route/result exposes an
  envelope. Record that revocation prevents future YGF opens but cannot recall
  a bearer URL already opened or provider-redeemed.
- [ ] Wallet expiry, credit ledger, first task, provider failure, and balance
  behavior are tested with production-like configuration, including older
  remaining Credits sharing the 14-day expiry rolled by a successful new-card
  top-up.
- [ ] Independent Agent key-digest and request-fingerprint secrets are
  installed; no value is reused for claims, task fingerprints, or abuse
  signals.
- [ ] Personal key create/list/revoke/rotate, wallet expiry, generic invalid
  key errors, per-key RPM/concurrency, wallet concurrency, allowlist rejection,
  idempotent retry, and multi-key wallet-cap behavior pass in staging.
- [ ] Keep `YGF_AGENT_GATEWAY_ENABLED=false` until one real staging completion
  settles variable credits, a forced provider failure refunds, and logs/client
  bundles are confirmed free of prompts and full keys.
- [ ] The safe check-in image downloads only after an explicit user action and
  contains no claim, private QR, API key, email, user ID, or exact balance.
- [ ] Dashboard issued/redemption/first-use/key/Agent/7-day/share rates, model
  distribution, provider cost per redeemed card, errors, and anomalies are
  reviewed without raw prompts, claims, keys, or IPs.
- [ ] The $3 provider budget remains enforced per Google or Apple identity
  across its combined wallet and all keys; distinct cards and account merges
  do not reset it. Per-user limits, global kill switch, error alerts, and cost
  dashboard are set.
- [ ] Install and rehearse the three distinct server-only operational states:
  `YGF_REDEMPTION_ENABLED=true` only after private inventory is ready,
  `YGF_WEB_TASKS_ENABLED=false` until a real web-provider staging smoke, and
  `YGF_AGENT_GATEWAY_ENABLED=false` until its separate Agent smoke. Verify a
  switch set to `false` returns a safe unavailable response before auth,
  ledger mutation, or provider work.
- [ ] Privacy owner approves a technically enforced retention/deletion
  schedule. “Credits expire after 14 days” is not a deletion schedule.

## External accounts and operations gates

- [ ] Enable Supabase anonymous sign-ins and verify a valid receipt can reach
  a first web AI result without a Google/Apple/Magic Link screen.
- [x] Enable Supabase Manual Linking and register the exact production callback
  `https://malatangai.com/auth/callback`. The setting is historical and is not
  evidence that the new account-merge path works.
- [x] Install and enable the production Google provider, publish the external
  Google Auth Platform app, and verify both normal OAuth and anonymous
  `linkIdentity`. The July 31, 2026 live round trips preserved and restored the
  same 3,000-Credit wallet. Preserve this as historical evidence for the
  superseded linking path; it does not pass the new merge gate.
- [x] Install and enable Apple using Services ID
  `com.malatangai.web.login`, the exact Supabase Apple callback, and a
  mode-`0600` ignored signing key. Verify the production UI reaches Apple's
  authorization endpoint without exposing the client secret.
- [ ] After the migration deploy, complete a live Google
  anonymous-to-existing-account merge. Verify the 10-minute one-use
  digest-backed intent, buffered destination cookies, service-only atomic
  merge/tombstone, partial-balance preservation, distinct-card top-up, rolling
  expiry, same-code no-regrant, account recovery, and unchanged $3 identity
  budget. The historical `linkIdentity` receipt is insufficient.
- [ ] Complete the same live merge matrix with a human Apple account. The
  enabled provider and successful outbound redirect are not end-to-end
  acceptance.
- [x] Verify Google `linkIdentity` keeps the same anonymous user and wallet and
  returns to the authenticated Agent page. This is a dated receipt for the
  superseded flow, not a substitute for the pending normal-OAuth merge test.
  Agent key creation remains separately governed by the gateway production
  gate.
- [x] Create a managed Cloudflare Turnstile widget restricted to
  `malatangai.com`, install its public site key and server-only secret in
  Vercel Production, set `YGF_TURNSTILE_ENABLED=true`, and redeploy. Production
  deployment `dpl_CWKRz8EvJ6ZhSLreyZ17T7fM66WC` rendered the real widget as
  `Success!` in Safari; missing and deliberately invalid tokens returned HTTP
  403, and the checked runtime window contained no application errors or token
  values.
- [ ] Record one human-submitted valid-token/invalid-code receipt to prove the
  exact `redeem-code` action and `malatangai.com` hostname through Siteverify,
  then verify expired-or-duplicate rejection, five-second outage behavior, and
  Turnstile analytics. Automated clients must not solve the challenge. Keep the
  existing production-key rejection tests, exact widget reset/removal, five
  languages, and no-token-in-logs assertions in the release suite.
- [ ] Enable Supabase leaked-password protection after an explicit Pro-or-higher
  plan decision. The 2026-07-30 Management API attempt returned HTTP 402, so
  the advisor warning remains. Do not disable anonymous sign-in to silence its
  11 design warnings: scan-first wallets require authenticated anonymous users
  constrained by user-bound/admin-guarded RLS. Do not enable Supabase Auth
  CAPTCHA until a separate client challenge token is implemented.
- [ ] Configure hosting-edge limits and redact `code`, `claim`, and `token`
  query values from access logs. The application redirects legacy query
  claims without consuming them and declares `no-referrer`, but cannot erase a
  query already received by the CDN on the first hop.
- [ ] Approve and schedule anonymous-user cleanup. Deleting unlinked anonymous
  users is not automatic, and clearing browser data makes their wallets
  unrecoverable.
- [ ] Apply `20260729060005_global_bounded_maintenance.sql`, set an
  independent `CRON_SECRET`, and deploy the host's daily
  `/api/internal/maintenance` schedule. Confirm an unauthorized request is
  rejected without detail, an authorized run emits count-only bounded results,
  and the route cannot receive a caller-controlled batch size. Run live
  `EXPLAIN` for the wallet and global maintenance branches; the source config
  is not proof that the host schedule is active.

- [ ] Each external account has a named YGF owner, least-privilege access,
  recovery method, and billing/usage alert. Do not put secrets in this
  checklist.
- [ ] Supabase production URL/keys, deployment environment variables, AI
  provider credentials/model, Formspree recipient, and analytics destination
  are verified from the production service.
- [ ] Any partner OAuth remains disabled until its privacy terms, scopes,
  callback, disconnect path, and owner are approved. Do not advertise a
  provider partnership without a signed relationship.
- [ ] For every selected Claude reward row, the named owner purchases and
  records custody of one official transferable gift, verifies recipient
  eligibility/region and provider expiry, and attaches it through the admin
  workflow. Do not resell access, share an account, or claim Anthropic
  sponsorship/endorsement.
- [ ] Reconcile purchased, assigned, redeemed, expired, and revoked gifts
  without copying bearer links into an operations sheet. The external
  provider redemption and customer-support path have named owners. Use the
  YGF admin gift-revocation form with the row reference; never paste a gift
  URL or reward UUID as a manager selector.
- [x] Generate the explicitly approved 500-credential production quantity.
  Batch `929c4026-7cfc-4a5e-bf3b-420d26e01ae2` is active with 500 eligible
  rows. Its create and activate phases used persisted request IDs, were
  replayed idempotently, and left zero admin profiles at rest. The previous
  batch has 497 audited revocations and 3 preserved redemptions, with zero
  identity overlap. The plaintext CSV, 63-page Letter HTML/PDF, and immutable
  receipts remain ignored under a 0700 `private/` root with 0600 files.
  Database hash parity, HTML QR decode, and final-PDF raster QR decode each
  passed 500/500. See
  [the non-secret refresh receipt](./production-batch-refresh-2026-08-07.md).
- [ ] Reuse that exact 2026-08-07 batch for the static-QR/Avery-label format;
  do not reset, reactivate, or regenerate its credentials. Before printing,
  reconcile exactly 500 distinct label rows to the batch's non-secret row
  references and prove that no live code appears in public artwork, Git, chat,
  logs, tickets, or vendor systems.
- [ ] Keep a manager-controlled label handoff record using non-secret row
  references only. Record source, printed, applied, spoiled, quarantined,
  issued, unused, and manager-revoked lifecycle totals, and balance
  non-overlapping counts to the same 500 references at each checkpoint. Never
  use plaintext codes as the operating ledger selector.
- [ ] Do not print or distribute that active inventory until a manager approves
  the physical release. For legacy claim rows, conceal both credential forms.
  For static cards, the QR is credential-free but the Avery code label is a
  bearer credential: conceal it or operate under the explicitly approved
  visible-code custody model. Print at 100%, scan every physical imposition
  position, reconcile by non-secret row reference, and close the printer,
  rights, soft-test, training, and custody gates in the production receipt.
- [ ] For future batches, use the named-manager admin workflow to create a
  pending durable batch and save its one-time CSV directly into ignored
  `private/`. Set the CSV to mode 0600, render and verify the matching private
  artifact, and activate only after exact database/CSV/QR reconciliation.
- [ ] For collectible cards, run
  `node scripts/render-private-agent-pass-batch.mts --input
  private/<admin-download>.csv --out private/<agent-pass-batch>.html` under the
  same custody. Confirm the exact HTML, per-page Letter/A4 front/back SVG, and
  Letter/A4 duplex-PDF bundle; direct ignored paths; a 0700 private root; 0600
  files; refusal to overwrite; secret-free stdout/stderr; QR/text parity; and
  reconciliation before activation. Print the portrait 2×4 PDFs at 100% with
  long-edge duplexing and confirm the reflected backs register to their fronts.
- [ ] Train all counter staff using the staff SOP. Managers rehearse the
  privacy-safe escalation and manager-only recovery workflow.
- [ ] Run the documented **10-20 person** soft test and close every launch
  blocker.
- [ ] Put the current staff help URL and manager contact where staff can reach
  them without exposing an admin link to customers.
- [ ] Confirm the static/Avery documentation caused no artwork or inventory
  upload, vendor order, payment, or distribution. Those are separate explicit
  manager actions after all gates close.

## Go/no-go review

The campaign manager records:

- final asset hashes or release identifier;
- deployment identifier and tested production origin;
- code batch identifier and approved quantity;
- soft-test summary and unresolved issues;
- owner sign-offs; and
- planned launch/stop window.

Launch only when every critical checkbox has evidence. An unchecked critical
gate is a no-go, not an item to finish after customers arrive.

## Rollback

Trigger rollback for plaintext batch, gift-link, or API-key exposure, duplicate grants,
auth/admin bypass, uncontrolled provider spend, material privacy failure,
broken claim QRs, incorrect public terms/prices, or sustained
redemption/task/Agent errors.

1. Remove or cover physical campaign assets and pause social distribution.
2. Set `YGF_REDEMPTION_ENABLED=false` and/or
   `YGF_WEB_TASKS_ENABLED=false` in the server environment, roll out the
   changed configuration, and verify the localized customer-safe unavailable
   state. Keep `YGF_AGENT_GATEWAY_ENABLED=false` unless an approved incident
   procedure requires a separate Agent stop.
3. Quarantine unused claim rows. Revoke a compromised batch through the
   audited manager workflow. Revoke affected personal keys; rotate the
   server-side Agent digest secret only through the approved global incident
   procedure because doing so invalidates every active personal key.
4. Preserve non-secret audit evidence; never paste codes or sensitive prompts
   into the incident record.
5. Notify the named campaign, engineering, store, and privacy owners.
6. Fix and re-run the soft-test matrix. Regenerate and re-proof assets if URL,
   copy, photo, or codes changed.
7. Resume only after the same owners issue a new go decision.
