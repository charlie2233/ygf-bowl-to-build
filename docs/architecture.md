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

## Scan-first anonymous identity

The public claim is validated before any user is created. After a same-origin
eligibility response and accepted terms, a Supabase-mode browser with no
session calls `signInAnonymously()` and immediately confirms the already
secured, HttpOnly pending claim. Demo mode follows the same visible flow
without external auth. If anonymous sign-in is unavailable, the pending claim
remains intact and the UI exposes an explicit account-sign-in fallback.

Supabase anonymous users carry the `authenticated` database role. Existing
wallet, task, history, and event RLS therefore continue to bind rows to the
trusted JWT subject; the application does not invent a browser-controlled
guest identity. The server derives `isAnonymous` only from the trusted
`is_anonymous` claim. Anonymous users can redeem and use web AI, but key
creation/rotation and `/connect/agent` require an identity upgrade.
Google/Apple upgrades use `linkIdentity`, not a new OAuth sign-in that could
strand the wallet on a second user. Manual linking, anonymous sign-in,
CAPTCHA/Turnstile, edge limits, dynamic rendering, and anonymous-user cleanup
must still be configured and verified in the live Supabase project.

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
mutate repository state. The production Supabase adapter must run on the server
and map the same interface to the four schema RPCs:

- `redeem_campaign_code`
- `reserve_campaign_spend`
- `commit_campaign_spend`
- `refund_campaign_spend`

The spend RPCs derive identity from `auth.uid()`. Redemption is a stricter
boundary: `redeem_campaign_code` accepts a `p_user_id` that the server adapter
derives from the authenticated session and is executable only by
`service_role`. Browser Supabase clients must never receive that credential or
invoke the RPC. The route must authenticate, derive the short-lived HMAC abuse
signal, and call `admit_campaign_redemption_attempt` before the privileged
redemption call. Every RPC uses schema-qualified objects and a fixed
`search_path`, locks the authoritative row with `FOR UPDATE`, and writes the
wallet plus ledger transition in one database transaction. External provider
calls never occur inside an RPC.

The redemption RPC returns the code identifier, redemption timestamp, and the
complete wallet snapshot needed for `RedemptionResult` before that transaction
commits. Exact idempotent retries return the original grant-ledger balance
snapshot, even if later tasks changed the live wallet. The Supabase repository
maps that single RPC row directly and must not perform follow-up wallet or
ledger reads: a read failure after commit cannot be allowed to report a
successful grant as failed.

## Share-card integrity

`/share` is dynamically rendered and requires a current user plus a redeemed,
unexpired wallet; an anonymous wallet is sufficient. The optional task label
is selected only from the earliest successful completed task in trusted server
history. The browser cannot submit a task label to analytics:
`POST /api/share-card` accepts only `{}`, rechecks same origin, session, and
wallet, then calls the service-only `record_share_card_generation` RPC.
`share_card_generations` has forced RLS and one row per wallet/user. Its atomic
insert writes at most one fixed, secret-free event, while pre-migration
duplicate events remain untouched.

## Public-validation admission

The public validation route derives a `v1` HMAC envelope with the fixed
`validate-code` purpose before it asks the repository whether a claim is
eligible. Production admission is shared in Postgres rather than counted
independently in each application process. The service-role-only
`admit_campaign_public_validation` RPC accepts only the current five-minute
bucket with its exact bucket-end expiry, then takes a transaction advisory lock
for that signal and bucket. It admits the first thirty calls and records every
valid call, including denials, without storing the raw claim or request
fingerprint.

`public_validation_attempts` has forced RLS and no `anon` or `authenticated`
table grants. Rows expire at the end of their signed bucket. Each valid
admission also removes at most 500 expired rows, ordered by expiry, using
`FOR UPDATE SKIP LOCKED`; the bounded batch prevents cleanup work from growing
with table size while concurrent signal buckets continue safely. The memory
admission implementation mirrors the fixed limit and expiry behavior for local
development and tests, but is not the production cross-instance authority.

## Redemption-attempt admission

Redemption admission and finalization are server-only database boundaries. The
admission RPC accepts only the authenticated account UUID derived by the route
plus the validated `v1` HMAC envelope. Its bucket and expiry must match the
current five-minute server bucket; raw IP, device, and receipt values never
cross this boundary.

Admission takes transaction advisory locks for both the account/bucket and
signal/bucket. It sorts the two lock keys before acquiring them, so requests
that share either dimension serialize without reversing lock order. While
holding both locks it counts only prior non-throttled admissions. The fixed
limits are five admitted attempts per account/bucket and twenty per
signal/bucket.

Every valid admission call inserts exactly one `redemption_attempts` row. An
admitted request starts as `unavailable`, which is fail-closed if the route
dies before redemption; a denied request starts and remains `throttled`.
`finish_campaign_redemption_attempt` locks the admitted row and may finalize it
only as `accepted`, `invalid`, or `unavailable`. `finalized_at` makes exact
retries idempotent and prevents a terminal result from being rewritten.
`PUBLIC`, `anon`, and `authenticated` have no execution grant on either RPC;
only `service_role` may invoke them.

Idempotency keys are scoped by user and operation. The first result stores
balance snapshots in the ledger. An exact retry returns that first snapshot;
the reserve RPC returns the immutable `reserved` snapshot even after the
reservation row reaches `committed` or `refunded`. Reusing a key with different
input returns a typed conflict before new resource lookup, so a changed or
unknown replacement code cannot change the idempotency result. Commit and
refund are terminal and mutually exclusive for a reservation. Partial unique
indexes provide a second database-level defense against duplicate terminal
entries.

## Two separate ledgers

Build Credits are a promotional consumer balance, not money:

- redemption grants exactly 3,000 credits;
- expiry is exactly 14 days after redemption;
- every ready-made web task reserves exactly 120 credits;
- Agent calls reserve the allowlisted model cost ceiling and settle actual
  provider cost through the configured integer micro-USD-to-credit ratio;
  failed or invalid provider attempts refund Credits but conservatively commit
  the reserved provider-cost ceiling;
- commit consumes the reservation and refund restores it;
- credits are non-cash and never converted from provider prices.

Provider cost is separate operational accounting in integer micro-US dollars.
Committed plus reserved provider cost may never exceed `250000` micro-US
dollars ($0.25) for one wallet. Integer columns and functions are ledger
authority; floating-point dollar values are not accepted for limits or state
transitions.

## Distributed task execution

Production task idempotency and request admission are shared database state,
not an application-process cache. `task_executions` stores only an
HMAC-SHA-256 request fingerprint, selected task/model metadata, a short owner
lease, bounded replay output, terminal session/balance metadata, and expiry.
It never stores submitted prompt text.

`begin_campaign_task_execution` takes a per-user advisory lock and returns one
of five states:

- `owner`: this caller owns a 90-second execution lease;
- `running`: an exact request is already executing elsewhere;
- `completed` or `failed`: return the bounded terminal result without another
  provider call; or
- `throttled`: the account has already started eight tasks in the rolling
  minute.

Reusing an idempotency key with different task, model, cost ceiling, or request
fingerprint is a conflict. A stale pre-reservation running lease may be
reclaimed, while an unexpired lease may not. Once spend is reserved, a stale
lease is conservatively failed: its 120 Credits return to the wallet and its
full provider ceiling moves from reserved to committed. Each same-user
admission first drains up to eight such stale reservations with
`FOR UPDATE SKIP LOCKED`; if another stale reserved execution remains, the
current admission is throttled so a retry can drain the next bounded batch
before any new spend. After the external provider returns,
`terminalize_campaign_task_execution` accepts only the matching execution
owner and matching reservation. In one database transaction it commits the
actual bounded provider cost on success, or refunds Credits while committing
the reserved provider ceiling on a post-admission failure, inserts the
immutable task session, and stores the terminal execution result plus balance
snapshot for 15-minute replay. The legacy standalone commit/refund RPCs reject
reservations owned by a task execution, so a caller cannot split this terminal
transition back into partial writes.

The application reserves Build Credits before inference. The provider receives
the database execution identifier as an upstream idempotency key when
supported. Cross-instance retries are therefore safe at the database execution,
wallet, ledger, session, and replay boundaries. No database transaction can
include an external provider: a process failure after a provider accepts a
request but before terminalization is therefore charged conservatively rather
than redispatched. The request-time sweep only runs when that wallet sends
later traffic, so a scheduled bounded global cleanup for wallets with no later
traffic remains a production gate. Live concurrency, provider-idempotency,
global-cleanup, and failure-injection smoke against the chosen Supabase project
and provider remain deployment gates.

Demo mode intentionally uses a bounded in-memory limiter/result cache behind
the same `runTask` contract. Production always selects the Supabase execution
RPCs; it does not treat the process-local cache as distributed authority.

## Personal Agent key and gateway boundary

The eight-character physical claim and the `ygf_` personal API key are
different bearer-credential namespaces. Claims only grant a wallet through
`/redeem`; they are never accepted by `/v1`. Personal keys use 32 random bytes,
are returned only by creation/rotation, and are represented in storage by a
versioned HMAC-SHA-256 digest plus an eight-character safe prefix and last four.
The digest key is independent from claim, abuse-signal, task-fingerprint, and
Agent-request-fingerprint secrets.

The browser key-management routes derive the authenticated user from the
session and require same-origin bounded mutations. They never accept a user or
wallet ID from the request body. Create/list/revoke/rotate RPCs are
`service_role`-only and bind each key to the authoritative wallet. A key
expires at the earlier of its 14-day maximum and wallet expiry; revocation and
rotation take row locks, and ownership is rechecked by user and key ID.
Plaintext cannot be listed or recovered.

`GET /v1/models` and the non-streaming MVP subset of
`POST /v1/chat/completions` accept only an Authorization bearer header.
Every query string is rejected. Chat requires a stable `Idempotency-Key`
header; a personal key or claim-shaped value is rejected, and all accepted
retry values become a domain-separated HMAC digest before a repository,
provider, or analytics path. The request parser allows only
bounded string messages, a small set of scalar OpenAI-compatible fields, and
friendly model IDs from the server catalog. It rejects tool calls, images,
streaming, arbitrary provider IDs, oversized bodies, control characters, and
unknown keys.

Production admission is wallet-first and atomic:

1. authenticate the HMAC digest and recheck key/wallet state and scope;
2. lock the wallet before the key so all keys share one ordering;
3. atomically admit every valid-key HTTP request (models, malformed chat, and
   valid chat) to a bounded per-key minute counter, then enforce concurrency,
   wallet-wide concurrency,
   remaining credits, per-key cost, and the wallet-wide 250,000 micro-USD cap;
4. reserve the model ceiling in credits and provider micro-US dollars;
5. call the provider without holding a database transaction;
6. terminalize only with the request owner token, committing actual bounded
   cost or refunding the full reservation, and overwrite
   `response.ygf.remaining_credits` with the locked post-settlement wallet
   balance before persistence.

Idempotency is unique by wallet plus key, not by individual API key. Multiple
keys therefore cannot spend the same idempotency key twice or bypass the
wallet cap. A reused key with another fingerprint/model/ceiling is a conflict.
Concurrent duplicates see the running owner and cannot call the provider.
Expired leases refund on the next wallet admission. Completed response content
is returned from the persisted terminal row, after canonical JSON validation,
so the first response and exact replay share the same authoritative balance.
The successful response payload is stored in Postgres and logically replayable
for 15 minutes. It can contain provider text that repeats submitted input.
After expiry it is lazily replaced with a generic tombstone; a reviewed
indexed, bounded scheduled cleanup remains required so idle traffic cannot
delay physical replacement. The idempotency and accounting proof remains.

Keys are limited to three active rows and ten creates/replacements per wallet
per rolling 24 hours. The RPM counter is a single row per key, so over-limit
traffic creates neither request/event rows nor provider calls.

Raw messages are used to compute an HMAC request fingerprint and make the
provider request. They are not stored as a separate request/prompt column or
in analytics; the short-lived successful response payload can echo them.
Analytics
uses fixed event names with friendly model, bounded credit count, outcome,
user ID, and timestamp only. Full keys, claims, request bodies, provider
payloads, email, and raw network identifiers are excluded.

The provider endpoint, redirect policy, API credential, model/provider mapping,
cost ceiling, timeout, and response bounds are server-owned. Demo mode returns
a deterministic connection response. In production the Agent provider path
fails closed until `YGF_AGENT_GATEWAY_ENABLED=true` and a server provider key
are both present. OpenAI compatibility and possible use of OpenRouter are
technical choices; no provider partnership is asserted.

## Admin batch boundary

Only an authorized campaign administrator may create, activate, or revoke
inventory.
Admin identity comes from exact `app_metadata.role=admin` claims or a
server-only exact email allowlist. Every mutation enforces same-origin
requests, bounded JSON, no-store responses, and a server-derived operator.

Batch generation uses cryptographic randomness, returns plaintext exactly once
as a private download, and inserts only SHA-256 claim digests plus non-secret
row references. A service-role-only `SECURITY DEFINER` RPC verifies the
operator against `profiles.campaign_role`, then atomically creates the pending
batch, pending code rows, and idempotency record. Pending claims are
indistinguishable from unknown claims at redemption.

After the manager confirms the private file is safely stored, a second
idempotent RPC atomically marks every pending code eligible, activates the
batch, and records the single distribution event. Revocation accepts only a
row reference and atomically updates the claim plus its mutation audit. Direct
authenticated writes to batch and code tables are not granted. Live migration
execution, concurrent request replay, and interruption testing against the
chosen Supabase project remain deployment gates.

Private offline files must resolve under ignored `private/`, reject symlinks
and overwrite, and use restricted permissions. Public campaign QRs contain no
claim. Private claim artwork pairs the same normalized human-readable value
with `/redeem#code=<same-value>`.

## Database authorization

Every campaign table has RLS enabled and forced. Authenticated users receive
read access only to their own profile, wallet, ledger, sessions, events, and
partner-connection rows. Active provider policy is readable for model
selection. Direct wallet and ledger writes are not granted. Spend mutations use
identity-checking RPCs. The redemption mutation is granted only to
`service_role` and requires the server-derived account UUID as an explicit
argument, so `anon` and `authenticated` clients cannot bypass route-level
attempt controls by calling it directly.

Campaign administrators are identified by the database-owned
`profiles.campaign_role`, evaluated through a fixed-search-path
`SECURITY DEFINER` helper. A normal user can update only the `display_name`
column, so RLS cannot be used to self-promote. Batch, code, policy, attempts, and
cross-user dashboard access remains behind admin policies. The Postgres
`anon` role receives no campaign table or mutation grants. A Supabase
anonymous user is different: after sign-in its JWT uses the `authenticated`
role and all user-owned RLS predicates still apply.

The migration includes foreign-key indexes, active/terminal partial indexes,
check constraints, updated-at triggers, explicit function revokes/grants, and
row-locking RPCs. The repository tests inspect this contract statically. That
does not prove the migration applies or behaves correctly on a live Supabase
project; a disposable-project migration and concurrent RPC smoke remain a
deployment gate.

## Privacy and retention

The database has no plaintext-claim column, request-text column, raw network
identifier, plaintext Agent API key, provider credential, or external access
token. Abuse signals are
HMAC-derived with a server-only secret, version, purpose, and five-minute time
bucket. Empty or oversized values and secrets shorter than 32 bytes are
rejected. Persisted signals have an explicit expiry and can be deleted by a
retention job without retaining the originating value.

Agent request rows retain a successful response payload for a logical
15-minute idempotent replay window; the payload may echo submitted input.
Physical tombstoning is lazy, and the repository does not claim a scheduled
bounded cleanup is already installed. That job and an approved broader
retention/deletion schedule are production gates.

History stores task type, title, model, usage, status, provider-cost integer,
and timestamps. Submitted task text is not part of the repository interface.
Generated output appears only when the caller explicitly supplies
`savedOutput`; otherwise it is absent. Events use allowlisted names and sources
plus per-event metadata keys. Metadata accepts only bounded enums, booleans, or
safe integers; arbitrary text, nested JSON, arrays, unknown keys, claim-like
strings, and network-address-shaped values are rejected before persistence.
The memory validator and the database check function enforce the same
controlled schema. Events default to a 90-day retention deadline, and
short-lived redemption signals carry their own expiry.

## Demo and production refusal

`MemoryCampaignRepository` has no seed by default. The deterministic
development claim is added only when constructed with `demoMode: true`.
Repository selection must additionally require `YGF_DEMO_MODE=true` in a
non-production runtime. If production detects demo mode, missing Supabase
configuration, or an attempt to select the memory adapter, startup must fail
closed. The production selection guard belongs in the later server repository
factory; it must not silently fall back to the demo adapter.
