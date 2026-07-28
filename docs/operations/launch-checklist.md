# Bowl-to-Build beta launch checklist

Generated files and green local tests are not launch approval. Every gate
below needs a named owner, evidence link or note, date, and explicit sign-off.

## Owners

| Area | Required owner | Decision |
| --- | --- | --- |
| Offer, menu and prices, staff policy | YGF store manager | Confirms the current **$16+** threshold and checkout language match the live register |
| Code inventory and exceptions | Campaign manager | Controls batches, manager-only revoke/reissue, and reconciliation |
| Application, database, AI spend | Engineering owner | Verifies production configuration, migrations, alarms, and rollback |
| Privacy, terms, retention | YGF accountable owner | Approves data handling, deletion/retention, incident path, and public copy |
| Photography and print | Creative/brand owner | Confirms rights for the supplied YGF photo or approves a replacement and final print proof |
| External account configuration | Named account owners | Verify deployment, Supabase, AI provider, Formspree/email, analytics, and any partner account |

## Offer and creative gates

- [ ] Store manager verifies the current menu and prices at the participating
  location and signs off that **$16+ in one completed transaction** is
  operationally correct.
- [ ] Legal/communications owner approves the full promotional fine print,
  university disclaimer, terms, privacy notice, and creator disclosure.
- [ ] Obtain brand-owner approval for the user-supplied real YGF home-page
  photo represented by `public/media/ygf-hero-background.jpg` and its source
  `public/media/ygf-user-photo.png`. Approve or replace
  `public/media/malatang-hero.png` anywhere it remains in wallet/share or
  generated collateral. Record source, permission, approver, and date in the
  media ledger.
- [ ] Regenerate all assets after the photo or copy changes:
  `node scripts/render-campaign-assets.mts`.
- [ ] For the final production origin, run the renderer and then the read-only
  exact deterministic verifier with the same reviewed `--origin` value:
  `node scripts/render-campaign-assets.mts --origin
  https://<approved-production-origin> --verify-only`.
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

- [ ] Production deployment is reachable over HTTPS and canonical links use
  the approved public origin.
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
- [ ] Auth callback returns only to approved same-origin destinations.
- [ ] Public validation and redemption limits work behind the production
  proxy; raw IP addresses and plaintext codes are not logged or stored.
- [ ] Admin routes reject non-admin users. Batch download is one-time,
  manager-controlled, and plaintext outputs stay only in the ignored
  `private/` location with restricted permissions.
- [ ] Redeem success, invalid, already used, expired, and revoked states are
  tested. Repeat submission does not create a second wallet.
- [ ] Wallet expiry, credit ledger, first task, provider failure, and balance
  behavior are tested with production-like configuration.
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
- [ ] Provider budgets, per-user limits, global kill switch, error alerts, and
  cost dashboard are set.
- [ ] Privacy owner approves a technically enforced retention/deletion
  schedule. “Credits expire after 14 days” is not a deletion schedule.

## External accounts and operations gates

- [ ] Enable Supabase anonymous sign-ins and verify a valid receipt can reach
  a first web AI result without a Google/Apple/Magic Link screen.
- [ ] Enable and verify manual identity linking so Google/Apple upgrades keep
  the same anonymous user and wallet; do not substitute a second-account OAuth
  sign-in.
- [ ] Configure and test CAPTCHA/Turnstile plus edge rate limits for anonymous
  signup/claim traffic. The repository does not claim these dashboard controls
  are already applied.
- [ ] Approve and schedule anonymous-user cleanup. Deleting unlinked anonymous
  users is not automatic, and clearing browser data makes their wallets
  unrecoverable.
- [ ] Schedule the service-role-only
  `tombstone_expired_agent_responses(500, null)` Agent replay-tombstone RPC
  and prove its indexed, bounded execution while the gateway is idle. Run live
  `EXPLAIN` for both wallet and global branches and verify their respective
  partial indexes. The RPC is in the migration; the live pg_cron/Supabase
  schedule is not.

- [ ] Each external account has a named YGF owner, least-privilege access,
  recovery method, and billing/usage alert. Do not put secrets in this
  checklist.
- [ ] Supabase production URL/keys, deployment environment variables, AI
  provider credentials/model, Formspree recipient, and analytics destination
  are verified from the production service.
- [ ] Any partner OAuth remains disabled until its privacy terms, scopes,
  callback, disconnect path, and owner are approved. Do not advertise a
  provider partnership without a signed relationship.
- [ ] Generate only the approved beta quantity. Count, secure, and reconcile
  printed claim rows without copying codes into an operations sheet.
- [ ] A manager creates a pending batch in the admin UI and saves its one-time
  CSV directly into ignored `private/`. Set the CSV to mode 0600, then run
  `node scripts/render-private-claims.mts --input
  private/<admin-download>.csv --out private/<batch>.claims.html`. Confirm the
  renderer did not overwrite an existing file, the CSV and HTML are both mode
  0600, and the rows match the pending inventory. Only then activate the batch
  in the admin UI and print at 100% with browser headers/footers disabled.
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

Trigger rollback for plaintext batch or API-key exposure, duplicate grants,
auth/admin bypass, uncontrolled provider spend, material privacy failure,
broken claim QRs, incorrect public terms/prices, or sustained
redemption/task/Agent errors.

1. Remove or cover physical campaign assets and pause social distribution.
2. Disable new redemption and AI task execution with the approved server-side
   controls; keep a clear customer-safe status message.
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
