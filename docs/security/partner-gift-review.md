# Partner gift security review — July 28, 2026

This review covers the optional code-bound Claude subscription gift path. It
does not prove a production Supabase migration, a live gift redemption,
Anthropic eligibility, inventory custody, deployment logging, or a provider
relationship.

## Trust boundaries

- A manager supplies one already-purchased official gift and selects a
  non-secret claim row reference.
- The admin route authenticates authorization and same origin, validates exact
  input shape, official HTTPS host/path, and bounded future expiry, then
  encrypts before persistence.
- The database binds the gift to the code first and to the authenticated
  redeemer only inside the redemption transaction.
- A manager revokes only by the non-secret row reference; the service-only
  RPC verifies the database admin, locks the code/reward pair, and returns
  lifecycle metadata without an envelope.
- Customer pages receive only safe metadata. An owner-initiated same-origin
  POST triggers the server-only reveal and external redirect.

## Reviewed controls

| Threat | Control |
| --- | --- |
| Link leaks through claim inventory | Gift data is separate from batch CSV, human claim, and QR contracts. |
| Database disclosure exposes usable gift | AES-256-GCM envelope with independent server key; plaintext is not a column. |
| Malicious redirect or SSRF | Exact `https://claude.ai/gift...` validation; browser redirect only; no server fetch. |
| Horizontal access | Auth-derived user plus database owner check; no caller-supplied user identity. |
| Public enumeration of premium codes | Public validation returns generic eligibility and no reward metadata. |
| Retry loses or duplicates a gift | One reward per code, transactional owner binding, and idempotent reveal. |
| Revoked or expired gift opens | Database state/expiry checked before envelope return and again mapped to a generic customer error. |
| Manager pastes a bearer link or reward UUID to revoke | Admin UI and route accept only the row reference; the RPC resolves and locks the authoritative rows itself. |
| Revocation promises to undo an exposed URL | Operations/UI say it blocks future YGF opens only; provider redemption and a URL already opened remain external. |
| Browser or intermediary retains destination | Explicit POST, `303`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, noindex, and restrictive CSP. |
| Logs or analytics capture the bearer URL | Route responses expose only metadata until redirect; no reward event accepts URL metadata. Operational policy forbids link copying. |
| Misleading provider relationship | UI/docs state that Anthropic is a third party and no sponsorship, endorsement, or affiliation is claimed. |

## Remaining production gates

- Generate and install a dedicated production encryption key through the
  deployment secret manager, then document rotation/recovery ownership without
  recording the key.
- Apply the migration to a disposable Supabase project and execute live
  concurrent redeem, owner/non-owner reveal, rollback, and RLS/service-role
  tests.
- Purchase real official transferable gifts, confirm terms, eligibility,
  region, expiration, and support handling, then reconcile one gift to each
  selected row.
- Inspect production CDN, application, database, analytics, and error logs
  after a controlled reveal to confirm no destination token is retained.
- Run a real end-to-end recipient redemption. Local tests and a successful
  redirect do not prove the provider accepted the gift.
- Exercise manager revocation by row reference before and after owner reveal,
  confirm future YGF opens are blocked, and record the provider/support
  limitation for any URL that has already left YGF.

Do not launch this reward inventory while any gate above lacks a named owner
and evidence.
