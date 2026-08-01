# Account merge and multi-card security review

## Scope

This review covers the Google/Apple upgrade path for a guest wallet and the
multi-card account wallet introduced by
`202607310005_multi_grant_account_merge.sql`.

The external Google or Apple identity remains owned by exactly one Supabase
user. YGF does not copy or rewrite `auth.identities`. A verified guest wallet
is transferred to the Supabase user returned by OAuth, and distinct physical
cards then add independent 3,000-Credit grant rows to that one wallet.

## Trust boundaries

- The browser may choose only `google` or `apple`; it cannot choose source or
  destination user IDs.
- The merge-intent route derives the source user and `session_id` from verified
  Supabase claims. Intent creation and consumption also require that exact
  source session to remain present in `auth.sessions`.
- The OAuth callback verifies the destination with `getUser()` and requires the
  requested provider in the returned Supabase identities.
- The database stores only a SHA-256 digest of the 256-bit merge bearer. The
  bearer exists only in a 10-minute, HttpOnly, SameSite=Lax cookie scoped to
  `/auth`; it is not placed in a URL, response body, analytics event, or log.
- Merge and top-up RPCs are `security definer` functions with fixed
  `search_path`; PUBLIC, `anon`, and `authenticated` cannot execute them.

## Atomic merge invariants

The service-only merge transaction:

1. locks and validates a pending, unexpired, one-use intent;
2. matches the original anonymous `session_id`, chosen provider, and verified
   OAuth destination;
3. serializes source and destination profiles and wallets in deterministic
   order;
4. rejects running web/Agent requests, reserved Credits/provider cost,
   ownership collisions, or unexpected administrator-owned source data;
5. combines initial Credits and only unexpired remaining Credits without
   restoring spent or expired Credits, recording removed expired balance in an
   `expire` ledger row;
6. preserves the later already-earned wallet expiry without extending time,
   preserves lifetime provider spend, and revokes every source Agent key;
7. transfers user-owned rows, writes a source-account tombstone and cleanup
   outbox row, and completes the intent in the same transaction; and
8. returns the same stored result on an exact callback replay.

The destination session cookies are buffered during OAuth exchange and are
installed only after the database transaction commits. A failed exchange or
merge therefore leaves the guest session in the browser and does not strand
its wallet.

## Multi-card accounting

- One account still has exactly one wallet.
- Every distinct eligible code creates exactly one +3,000 grant.
- Replaying the same code or idempotency key never grants again and never
  extends expiry.
- A successful new-card top-up sets the aggregate wallet expiry to 14 days
  from that top-up. Remaining older Credits share the new wallet expiry; this
  MVP does not claim per-grant FIFO expiry.
- The bounded account maximum is 3,000,000 Credits (1,000 grants).
- The provider-cost allowance remains $3 per account, not per code or key.
  Historical guest-plus-destination committed cost is never reset or clamped.
  A combined committed total of exactly $3 may merge with zero reserved cost,
  after which every future provider reservation is denied. A combined total
  above $3 fails atomically before ownership changes, so the guest wallet stays
  recoverable instead of creating an over-cap destination account.

## Retired guest sessions

A successful distinct-user merge moves all wallet-owned data away from the
guest ID and writes `merged_account_tombstones`. A wallet trigger prevents any
old guest access token from creating or reclaiming a wallet. The cleanup
outbox records the source user for later Auth-admin revocation/deletion; no
external Auth call occurs inside the SQL transaction. The
CRON-secret-protected daily maintenance route atomically claims at most 25 rows
with `FOR UPDATE SKIP LOCKED` and a 10-minute worker lease, treats an
already-missing Auth user as an idempotent success, completes only rows owned by
that worker token, and returns aggregate counts only. An unrelated 404 remains
retryable, one failed row does not prevent later claimed rows from completing,
and an interrupted lease can be reclaimed safely by a later run. Partial
pending and processing-lease indexes keep completed history outside the claim
scan.

## Verification and remaining production gates

Automated coverage must prove top-up/replay/ownership rules, intent
forgery/expiry/session/provider rejection, exact RPC ACLs and RLS, failure-time
cookie buffering, tombstoned-source rejection, aggregate task/Agent balance
snapshots, source-key revocation, and provider-spend preservation.

Disposable PGlite tests prove schema behavior and rollback semantics but not
real multi-session PostgreSQL scheduling. Before release, apply the migration
before the web deployment, run separate-browser Google and Apple merge flows
against production, overlap redemption/merge/task/Agent operations in live
Supabase, verify the destination wallet and API key, deploy the bounded
`auth_cleanup_outbox` consumer, and record one authorized production run.
Until those steps pass, production account merge and Auth cleanup remain
explicit release gates.
