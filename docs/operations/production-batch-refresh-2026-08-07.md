# Production claim batch refresh receipt — 2026-08-07

This receipt contains no plaintext claim, claim URL, QR payload, individual
code hash, API credential, or user identifier.

## Safe refresh outcome

The completed test inventory was not reset or reused. Previously issued bearer
credentials remain immutable:

- Retired batch: `c0313939-a965-41a6-8e61-67ba37db0c2c`
- Retired-batch final state: 497 `revoked`, 3 `redeemed`, zero `eligible`
- Retirement audit: 497 distinct `revoke` mutations through
  `revoke_campaign_admin_code`
- Preserved history: 3 wallets, 3 grant-ledger entries, 1 active Agent key,
  2 terminal Agent requests, and 4 Agent usage entries
- Preserved accounting: 25,030 committed micro-USD and zero reserved micro-USD

No wallet, ledger entry, Agent request, Agent usage entry, event, Auth user, or
profile was deleted or reset. The three redeemed rows remain redeemed.

## New production inventory

- Batch ID: `929c4026-7cfc-4a5e-bf3b-420d26e01ae2`
- Batch name: `YGF production scratch cards 500 — 2026-08-07`
- Approved quantity: 500
- Source: `scratch-card`
- Activated at: `2026-08-07T22:25:46.335642+00:00`
- Final state: 500 `eligible`, zero pending, redeemed, or revoked rows
- Uniqueness: 500 distinct row references and 500 distinct code digests
- Separation: zero code-ID, digest, or row-reference overlap with the retired
  batch
- Audit evidence: exactly one idempotent `create` mutation and one idempotent
  `activate` mutation after replaying both phases
- Operator boundary: the login-disabled audit principal was elevated only
  around audited manager RPCs and returned to `campaign_role=user`; production
  had zero admin profiles at rest

The live `wallets_provider_cost_cap_3usd_check` constraint still enforces
committed plus reserved provider cost at no more than 3,000,000 micro-USD
($3) per wallet. Refreshing claim inventory did not reset any wallet's spend.

## Private custody artifacts

Credential-bearing files remain ignored under the local mode-0700 `private/`
directory. Every listed file is mode 0600:

- `private/ygf-production-500-20260807.csv`
- `private/ygf-production-500-20260807.claims.html`
- `private/ygf-production-500-20260807.claims.pdf`
- immutable intent, operator, pending, active, retirement-intent, and retirement
  receipts with the same stem

A task-specific Supabase secret key was created for this operation, deleted at
the provider after verification, and removed from the local machine. The
temporary Vercel environment download was also removed. No plaintext inventory
entered Git, chat, provider logs, application logs, analytics, or the database.

## Verification evidence

- Canonical CSV count and uniqueness: 500/500.
- Pending and active database row-reference/SHA-256 parity: 500/500.
- Private HTML text/row-reference pairing and QR decode: 500/500.
- Final PDF: 63 Letter pages at 612×792 pt, unencrypted under protected local
  custody, with four occupied positions on the final page.
- QR decode from the final PDF raster: 500/500.
- Create, activate, and retirement replays returned the same verified state.
- Retired/new database aggregate: 497 revoked plus 3 redeemed preserved; 500
  new eligible; zero identity overlap; zero admin profiles at rest.
- Stable application suite: 86/86 test files and 693/693 tests passed.
- ESLint and TypeScript typecheck passed. The disposable malformed
  `.next/dev` validator was removed and route types were regenerated before the
  successful typecheck.
- Two Vercel production builds passed. Redemption first returned the expected
  paused HTTP 503 before inventory mutation, then the restored deployment
  `dpl_5YzDiVitjoJDnY8GP3C468usJM2X` reached normal validation handling and
  served the homepage with HTTP 200.

## Release boundary

These 500 credentials are digitally eligible in production. That does not
authorize printing or distribution. A manager must still approve image and
brand rights, conceal both bearer credential forms, resolve bleed/color/stock
and duplex requirements, print at 100%, scan every physical imposition
position under store lighting, complete staff training and the 10–20 person
soft test, and reconcile physical custody before release.

## 2026-08-08 read-only inventory and Avery proof addendum

At `2026-08-08 00:31 PDT`, a new aggregate-only production read confirmed the
provider project was healthy and made no database, Auth, or provider mutation:

- current batch: 500 `eligible`, zero redeemed/revoked/pending/expired, 500
  distinct code IDs, digests, and row references, and no downstream grant,
  wallet, user, key, request, usage, reward, task, or merge record;
- retired batch: 497 `revoked` plus 3 `redeemed`, with the redeemed rows still
  reconciling exactly to 3 grants, 3 wallets, 3 retained users/profiles, 1
  active Agent key, 2 terminal requests, and 4 usage rows; and
- separation: zero code-ID, digest, or row-reference overlap between batches.

Both `promo_batches` records still report batch-level `active`. The retired
inventory remains nonredeemable because every old code is individually revoked
or redeemed and the redemption function checks code state. This metadata
mismatch is documented only; no unreviewed batch-status mutation was made.

The existing private CSV was reused to create the first local-only Avery 5260
bundle. No credential was generated or changed, and no file was uploaded:

- `private/ygf-production-500-20260807.avery-5260-labels.html` — mode 0600,
  187,219 bytes, SHA-256
  `d69f7521b9c5ca6a569d2c9b3736830ad70e04e76dfebeaccaa272d8e0033648`;
- `private/ygf-production-500-20260807.avery-5260-labels.pdf` — mode 0600,
  337,351 bytes, SHA-256
  `42b4341e48fe063c42c7db17861c8d22c91cdbd7c0190aac8a48345d7256cfb5`;
- read-only parity: 500/500 unique canonical labels across 17 Letter sheets,
  with 20 labels on the final sheet and every code/row-reference token found
  exactly once; and
- source CSV SHA-256 remained
  `94934b3c7a52de5e13eb0ef5c74e9d8f1a68b34c716785d01201a89e496e5353`.

These are digital custody artifacts, not a physical-print approval. Brand,
visible-code custody or concealment, exact-stock printing, label application,
store-lighting scan, soft test, training, and inventory handoff remain open.
