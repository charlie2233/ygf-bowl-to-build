# Campaign domain architecture

## Scope and trust boundaries

The campaign domain owns receipt-code normalization, redemption, Build Credit
accounting, provider-cost limits, history metadata, and privacy-safe abuse
signals. Route handlers and UI components are adapters around this domain; they
must not reimplement its balances, expiry rules, or code-state decisions.

There are four relevant trust boundaries:

1. The browser is untrusted. It may prefill a claim and display a wallet, but it
   never decides eligibility, user identity, balance, or provider spend.
2. Server route handlers derive the authenticated user, validate bounded input,
   hash normalized claims, and invoke a `CampaignRepository`. They do not accept
   a caller-supplied user identity as authority.
3. The repository is the transaction boundary. The memory adapter is for an
   explicitly enabled development demo; production uses the Supabase contract
   and its atomic RPCs.
4. Provider execution is outside the credit transaction. A task reserves
   capacity first, performs the external call without holding a database lock,
   then commits or refunds the reservation.

## Receipt fragment handling

A qualifying receipt has one eight-character uppercase alphanumeric claim. The
same normalized value is printed as text and encoded as:

```text
https://<allowed-origin>/redeem#code=<same-normalized-code>
```

The URL fragment is a browser-local value: it is not part of an HTTP request and
is therefore absent from ordinary request logs and referrer headers. On the
redeem page, the client must parse the fragment, prefill the input, and
immediately call `history.replaceState` to remove it before any submission or
navigation. It then sends the claim only in a protected request body.

`buildClaimUrl` accepts an origin, not an arbitrary base URL. It rejects
credentials, paths, query strings, and non-HTTPS production origins.
`parseClaimFragment` accepts only the literal `#code=` key with one already
normalized value. Its full-URL form also requires the exact `/redeem` path, no
query, HTTPS, and an exact configured origin allowlist when supplied. Lowercase,
separators, duplicate keys, extra keys, percent-encoded variants, and
query-carried claims are rejected. Local HTTP is limited to `localhost`,
`127.0.0.1`, or `[::1]` and requires the explicit
`allowInsecureLocalhost: true` development policy.

Human entry is more forgiving than a receipt URL: `normalizeCode` removes spaces
and hyphens and folds ASCII casing before enforcing exactly eight
alphanumeric characters. Only its SHA-256 digest crosses the repository
boundary. Plaintext batch output is generated privately outside the database
and must remain ignored from version control.

## Repository parity and atomicity

`CampaignRepository` is the shared behavioral contract for:

- code validation and authenticated redemption;
- wallet lookup;
- spend reservation, commit, and refund;
- session/history metadata and events;
- campaign dashboards, batch registration, and revocation.

Public validation returns generic eligibility and does not reveal whether a
claim is unknown, used, expired, or revoked. Authenticated redemption returns
typed domain errors for those states. Both the memory adapter and the Supabase
RPCs enforce one wallet per user and one redemption per claim.

The memory adapter performs every state transition in one synchronous critical
section after hashing input. It returns defensive copies so callers cannot
mutate repository state. The Supabase implementation must map the same
interface to the four schema RPCs:

- `redeem_campaign_code`
- `reserve_campaign_spend`
- `commit_campaign_spend`
- `refund_campaign_spend`

Each RPC derives identity from `auth.uid()`, uses schema-qualified objects and a
fixed `search_path`, locks the authoritative row with `FOR UPDATE`, and writes
the wallet plus ledger transition in one database transaction. External
provider calls never occur inside an RPC.

Idempotency keys are scoped by user and operation. The first result stores
balance snapshots in the ledger. An exact retry returns that first snapshot;
reusing a key with different input returns a typed conflict. Commit and refund
are terminal and mutually exclusive for a reservation. Partial unique indexes
provide a second database-level defense against duplicate terminal entries.

## Two separate ledgers

Build Credits are a promotional consumer balance, not money:

- redemption grants exactly 3,000 credits;
- expiry is exactly 14 days after redemption;
- every task reserves exactly 120 credits;
- commit consumes the reservation and refund restores it;
- credits are non-cash and never converted from provider prices.

Provider cost is separate operational accounting in integer micro-US dollars.
Committed plus reserved provider cost may never exceed `250000` micro-US
dollars ($0.25) for one wallet. Integer columns and functions are ledger
authority; floating-point dollar values are not accepted for limits or state
transitions.

## Database authorization

Every campaign table has RLS enabled and forced. Authenticated users receive
read access only to their own profile, wallet, ledger, sessions, events, and
partner-connection rows. Active provider policy is readable for model
selection. Direct wallet and ledger writes are not granted; only the
identity-checking RPCs mutate those tables.

Campaign administrators are identified by the database-owned
`profiles.campaign_role`, evaluated through a fixed-search-path
`SECURITY DEFINER` helper. A normal user can update only the `display_name`
column, so RLS cannot be used to self-promote. Batch, code, policy, attempts, and
cross-user dashboard access remains behind admin policies. The anonymous role
receives no campaign table or mutation grants.

The migration includes foreign-key indexes, active/terminal partial indexes,
check constraints, updated-at triggers, explicit function revokes/grants, and
row-locking RPCs. The repository tests inspect this contract statically. That
does not prove the migration applies or behaves correctly on a live Supabase
project; a disposable-project migration and concurrent RPC smoke remain a
deployment gate.

## Privacy and retention

The database has no plaintext-claim column, request-text column, raw network
identifier, provider credential, or partner access token. Abuse signals are
HMAC-derived with a server-only secret, version, purpose, and five-minute time
bucket. Empty or oversized values and secrets shorter than 32 bytes are
rejected. Persisted signals have an explicit expiry and can be deleted by a
retention job without retaining the originating value.

History stores task type, title, model, usage, status, provider-cost integer,
and timestamps. Submitted task text is not part of the repository interface.
Generated output appears only when the caller explicitly supplies
`savedOutput`; otherwise it is absent. Event metadata rejects sensitive key
classes and is bounded to small scalar values. Events default to a 90-day
retention deadline, and short-lived redemption signals carry their own expiry.

## Demo and production refusal

`MemoryCampaignRepository` has no seed by default. The deterministic
development claim is added only when constructed with `demoMode: true`.
Repository selection must additionally require `YGF_DEMO_MODE=true` in a
non-production runtime. If production detects demo mode, missing Supabase
configuration, or an attempt to select the memory adapter, startup must fail
closed. The production selection guard belongs in the later server repository
factory; it must not silently fall back to the demo adapter.
