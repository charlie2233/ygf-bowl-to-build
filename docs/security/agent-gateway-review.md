# Agent gateway security review — July 27, 2026

This is a local source, contract-test, and artifact review of the Bowl-to-Build
Agent Pass enhancement. It does not claim a hosted security scan, live
Supabase execution, production-provider validation, deployment log review, or
physical-print proof.

## Review scope

- personal key generation, one-time disclosure, digest persistence, expiry,
  revocation, and rotation;
- authenticated browser key-management routes;
- bearer authentication and the OpenAI-compatible model/chat routes;
- per-key and wallet-wide admission, idempotency, credit/provider accounting,
  concurrency, stale leases, replay retention, and refunds;
- provider endpoint, redirects, response validation, model allowlist, and
  production enablement;
- production mutation pause switches, service-only scheduled maintenance, and
  canonical public-origin boundaries;
- horizontal access, RLS, service-role RPC grants, and client-bundle
  boundaries;
- analytics, check-in cards, collectible public cards, and private print
  tooling.

## Threats and controls

| Threat | Implemented control |
| --- | --- |
| Claim photographed or reused as an API credential | Eight-character claims are accepted only by redemption. `/v1` accepts only `ygf_` bearer keys. Public card faces and backs contain neither. |
| Plaintext key disclosure | 32 random bytes; full secret returned only on create/rotate; database contract stores HMAC digest, prefix, last four, binding, limits, and lifecycle only; no-store responses. |
| Key in URL, QR, log, analytics, or client bundle | Credential-shaped query parameters are rejected; configs use Authorization; analytics schema rejects secret-like keys; public/share renderers accept no key field; provider and digest secrets are server-only. |
| Horizontal key management | Browser identity comes from the authenticated session; RPCs receive that trusted user; revoke/rotate select by both user and key ID; list/create bind to the user's authoritative wallet. |
| Multiple-key quota bypass | Wallet-first row locking, wallet-scoped idempotency, shared remaining credits, wallet concurrency, and the 3,000,000 micro-USD ($3.00) committed-plus-reserved cap apply across every key and web task. |
| Retry or concurrent double charge | Unique `(wallet_id, idempotency_key)`, request fingerprint/model/ceiling comparison, owner token, short lease, immutable usage entries, and idempotent terminalization. |
| Concurrent keys make the response balance stale | Terminalization replaces `response.ygf.remaining_credits` with the locked post-settlement wallet value. The gateway canonicalizes JSON object keys, validates the persisted response semantically, and returns that persisted value for first response/replay parity. |
| Provider failure evades provider cap | Ceiling is reserved before provider work; provider/validation failures and stale reserved leases refund user Credits while conservatively committing the reserved provider ceiling. Later same-user task admission drains a bounded `SKIP LOCKED` batch first and throttles while any older reserved stale row remains. |
| Arbitrary model or provider request | Friendly server allowlist maps to four fixed OpenAI snapshots; bounded non-streaming message contract; redirects are rejected and response bytes/content/usage/cost are validated. |
| SSRF or credential forwarding | The only live destination is the fixed OpenAI Chat Completions HTTPS endpoint; no base-URL override exists; `redirect: "error"`, server-only Authorization, and fixed request fields prevent key forwarding. |
| Prompt or response over-retention | The raw request prompt is not a separate column. A successful response payload is stored in Postgres for a logical 15-minute replay window and can echo input. Admission tombstones at most 20 expired responses through a wallet-leading partial index; the service-role-only global maintenance branch uses a separate expiry-leading partial index plus `FOR UPDATE SKIP LOCKED` and caps replay cleanup at 100 rows per scheduled pass. |
| RLS or direct-client bypass | Agent tables have enabled and forced RLS, no public/anon/authenticated table grants, and explicit service-role-only function grants. |
| Production accidentally serves demo/provider traffic | Demo mode is refused in production; provider-backed Agent traffic also requires explicit `YGF_AGENT_GATEWAY_ENABLED=true` plus server credentials. |
| Unreviewed production change starts claim or web-provider work | Production redemption and web tasks each require an exact server-only enablement flag. A paused route returns before auth, reservation, or provider dispatch; neither flag enables the Agent gateway. |
| Idle stale reservations or short-lived data never receive customer traffic | A service-role-only, count-bounded maintenance RPC settles stale web/Agent requests with the normal accounting invariants, tombstones expired replays, and removes expired admissions/events. The scheduled route accepts only a constant-time checked `CRON_SECRET`. |
| Split-brain public origin weakens same-origin controls | `www` is permanently redirected to the apex origin and the homepage emits an apex canonical URL; deployed DNS/TLS/header behavior still needs verification. |
| Secret-bearing physical output escapes | Private renderer accepts only direct ignored `private/` files, verifies the ignore rule and restrictive directory/source permissions, refuses overwrite, emits mode 0600, and keeps claims out of stdout. |

## Privacy-safe operations

Agent product events contain only an allowlisted event name/source, trusted
user identifier, friendly model, bounded credits, outcome, and timestamp.
They never include a raw message, generated response, full key, key digest,
claim, QR value, email, provider payload, or raw network address. Dashboard
metrics are derived from distinct users and aggregate wallet totals.

The digital check-in generator receives only the server-derived earliest
successful task type and fixed public campaign copy. Its event endpoint accepts
only `{}` and records at most one signal per wallet. Its SVG does not expose a
user ID, email, claim,
private QR, API key, or exact remaining balance, and nothing is posted
automatically.

## Review remediations

The local review found and corrected these implementation issues before final
handoff:

1. key-list repository selection happened at module import and could read
   production configuration during tests; it now resolves only when a request
   needs it;
2. Supabase key lifecycle rows did not return the authoritative `wallet_id`;
   create/list/rotate now return it and the adapter fails closed on mismatch;
3. key creation timestamps relied on transaction defaults that could drift
   from `clock_timestamp()` expiry calculations; RPC inserts now set the same
   authoritative clock explicitly;
4. completed Agent response bodies could remain replayable after their
   advertised window; expired content is now replaced with a tombstone without
   allowing re-execution or another charge;
5. product analytics required a dedicated server-only writer; the writer
   reuses the strict event validator and records only fixed signals;
6. the OpenAI adapter fixes the official endpoint, rejects redirects, and
   bounds response size/content, preventing prompt-bearing requests or the
   credential from following an unexpected destination;
7. a concurrent key could change the wallet after an Agent worker projected
   its balance; terminalization now patches the persisted response with the
   locked wallet value, and the gateway validates canonical JSON before
   returning it.
8. provider cost accounting now uses validated prompt/cached/completion token
   counts with exact integer ceiling arithmetic; cached input changes cost
   without introducing a new prompt-retention column.
9. production operations lacked distinct stop controls and idle-time cleanup;
   redemption and web tasks now fail closed without their exact enablement
   flags, while a bounded service-only daily-maintenance contract handles idle
   stale reservations and expiry work without accepting a public batch size.

## Local evidence

Dedicated unit and integration contracts cover:

- a disposable PGlite/Postgres application of all current migrations with only
  Supabase role/auth stubs, followed by real task reserve, exact failure,
  replay, stale-reservation accounting transitions, and idempotent one-row
  share-card signal execution;
- at least 256-bit key material, HMAC descriptors, and secret-free
  serialization;
- creation/list/revoke/rotate, same-origin checks, owner isolation, and the
  active-key limit;
- valid demo model listing and chat completion plus invalid, URL-carried,
  revoked, expired, and rotated keys;
- model allowlist, per-key limits, wallet-wide provider cap, failure credit refund with conservative provider-cost settlement,
  concurrent/repeated idempotency, and expired replay behavior;
- forced RLS/service-only migration contracts and absence of a raw-prompt
  column;
- safe share-card schema and fixed server-owned generation analytics;
- public/private card separation, exact dimensions, restrictive private paths,
  no overwrite, QR/text parity, and decoder checks.
- production switch defaults, paused-route short circuit behavior,
  maintenance-route authentication/no-store responses, bounded result schema,
  service-role-only grants, stale reservation settlement, and expiry cleanup.

The final full-suite counts, build, E2E/axe results, artifact verification,
commit, and remote SHA are recorded in `docs/release-readiness.md` only after
the final commands complete.

## Remaining external gates

- Apply the migration to a disposable Supabase project; run real SQL syntax,
  RLS, ownership, concurrent multi-key, stale-worker, and failure-injection
  tests before production. PGlite is single-connection, so it validates SQL
  execution and accounting but cannot prove multi-session lock behavior.
- Enable and test Supabase anonymous sign-in, CAPTCHA/Turnstile, manual
  Google/Apple identity linking, and anonymous cleanup. Until linking, clearing
  browser data permanently loses access to the guest wallet.
- Apply the global-maintenance migration, install an independent host
  `CRON_SECRET`, and exercise the checked-in daily maintenance route while the
  gateway is idle. The source does not claim a live host schedule, an
  authorized production run, or production query-plan proof. Use live
  `EXPLAIN` to prove the wallet Agent replay branch selects
  `agent_requests_wallet_result_expiry_idx` and the global maintenance branches
  select their expiry/lease indexes.
- Install independent production HMAC secrets and exercise the documented
  global key-invalidation/rotation incident process.
- Keep the Agent gateway disabled until the OpenAI project billing/limits,
  retention/data controls, current snapshot availability/prices, approved
  HTTPS origin, and one real success/refund/idempotency smoke are proven.
  `store:false` is not Zero Data Retention: default abuse-monitoring logs may
  retain content for up to 30 days, while API data is not used for training by
  default unless the account opts in. ZDR remains an external account gate.
- Inspect production logs, analytics, error reporting, CDN/proxy behavior, and
  built client assets for credentials and prompt material.
- Confirm rights for the supplied food photo or replace it, then physically
  proof and scan the protected card stock under store custody.
