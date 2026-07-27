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
| Photography and print | Creative/brand owner | Supplies and approves a rights-cleared real YGF food photo and final print proof |
| External account configuration | Named account owners | Verify deployment, Supabase, AI provider, Formspree/email, analytics, and any partner account |

## Offer and creative gates

- [ ] Store manager verifies the current menu and prices at the participating
  location and signs off that **$16+ in one completed transaction** is
  operationally correct.
- [ ] Legal/communications owner approves the full promotional fine print,
  university disclaimer, terms, privacy notice, and creator disclosure.
- [ ] Replace `public/media/malatang-hero.png`, currently a generated beta
  fallback, with a **rights-cleared real YGF food photo**. Record source,
  permission, approver, and date in the media ledger.
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

## Product and security gates

- [ ] Production deployment is reachable over HTTPS and canonical links use
  the approved public origin.
- [ ] Database migrations and row-level access controls are applied in the
  production project, then verified with non-admin and admin accounts.
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
- [ ] Provider budgets, per-user limits, global kill switch, error alerts, and
  cost dashboard are set.
- [ ] Privacy owner approves a technically enforced retention/deletion
  schedule. “Credits expire after 14 days” is not a deletion schedule.

## External accounts and operations gates

- [ ] Each external account has a named YGF owner, least-privilege access,
  recovery method, and billing/usage alert. Do not put secrets in this
  checklist.
- [ ] Supabase production URL/keys, deployment environment variables, AI
  provider credentials/model, Formspree recipient, and analytics destination
  are verified from the production service.
- [ ] Any partner OAuth remains disabled until its privacy terms, scopes,
  callback, disconnect path, and owner are approved.
- [ ] Generate only the approved beta quantity. Count, secure, and reconcile
  printed claim rows without copying codes into an operations sheet.
- [ ] A manager creates a pending batch in the admin UI and saves its one-time
  CSV directly into ignored `private/`. Set the CSV to mode 0600, then run
  `node scripts/render-private-claims.mts --input
  private/<admin-download>.csv --out private/<batch>.claims.html`. Confirm the
  renderer did not overwrite an existing file, the CSV and HTML are both mode
  0600, and the rows match the pending inventory. Only then activate the batch
  in the admin UI and print at 100% with browser headers/footers disabled.
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

Trigger rollback for plaintext batch exposure, duplicate grants, auth/admin
bypass, uncontrolled provider spend, material privacy failure, broken claim
QRs, incorrect public terms/prices, or sustained redemption/task errors.

1. Remove or cover physical campaign assets and pause social distribution.
2. Disable new redemption and AI task execution with the approved server-side
   controls; keep a clear customer-safe status message.
3. Quarantine unused claim rows. Revoke a compromised batch through the
   audited manager workflow.
4. Preserve non-secret audit evidence; never paste codes or sensitive prompts
   into the incident record.
5. Notify the named campaign, engineering, store, and privacy owners.
6. Fix and re-run the soft-test matrix. Regenerate and re-proof assets if URL,
   copy, photo, or codes changed.
7. Resume only after the same owners issue a new go decision.
