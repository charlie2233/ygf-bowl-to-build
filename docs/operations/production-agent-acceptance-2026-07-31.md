# Production redemption and Agent API acceptance — 2026-07-31

> Historical receipt: this acceptance predates the GPT-5.6 Luna, Terra, and
> Sol selector. It proves the legacy `fast` alias and pinned GPT-5.4 provider
> snapshot only; it is not live GPT-5.6 model-matrix evidence.

This receipt intentionally omits plaintext claim codes, claim URLs, private QR
payloads, personal API-key material, provider credentials, user identifiers,
raw prompts, and raw IP addresses.

## Scope and production state

- Public origin: `https://malatangai.com`
- Vercel production deployment:
  `dpl_ArZu95yPbgdwNGENiLNt9asuXuSF`
- Deployed source: `33e916bd7561b6662a53f4827d7f0412ecd6c0cb`
- Agent gateway: enabled only after a direct `store:false` OpenAI provider
  preflight returned HTTP 200 from the pinned fast-model snapshot
- Web-task gateway: left disabled; it remains independent from `/v1`
- Controlled inventory reference: `YGF-2M4SGQS4-0500` from production batch
  `c0313939-a965-41a6-8e61-67ba37db0c2c`

## End-to-end acceptance

1. The batch began at 500 eligible and zero redeemed rows.
2. A fresh anonymous browser session opened the private claim URL. The
   human-readable code and URL payload matched, and the real production
   Turnstile widget supplied a token.
3. One accepted submission produced the success page, one 3,000-Credit
   wallet, one committed grant, and a 14-day wallet lifetime.
4. The batch settled at 499 eligible and one redeemed row.
5. The anonymous wallet was upgraded with an unused Google identity. The same
   wallet and grant remained authoritative, and the owner became
   non-anonymous.
6. The upgraded account created one personal `ygf_` API key. The UI displayed
   the secret once; Postgres stored a 43-character keyed digest plus bounded
   prefix/last-four metadata and no plaintext-key column.
7. The key inherited the expected scopes, 12 requests/minute, two concurrent
   requests per key, 14-day-or-wallet expiry, and the shared $3 provider-cost
   ceiling.
8. A real OpenAI-compatible `fast` request completed through
   `/v1/chat/completions`. It used the pinned
   `gpt-5.4-nano-2026-03-17` snapshot, recorded 14 input and 21 output tokens,
   settled 30 micro-USD of provider cost, charged one Credit, and returned
   2,999 Credits remaining.
9. The completed request had one reserve and one commit entry, zero remaining
   reservations, and a replayable response. Re-admission with the same
   wallet-scoped idempotency digest returned the same completed request and
   did not create another request, usage entry, or Credit debit.
10. A same-owner browser retry of the original claim returned the success
    path while retaining exactly one wallet, one grant, one redeemed row, and
    the 2,999-Credit post-API balance.
11. An unauthenticated `/v1/models` request returned HTTP 401
    `invalid_api_key`, confirming the enabled gateway still fails closed.
12. The production Agent page showed `Connection successful. 2,999 credits
    remain.` and produced no malatangai.com console warnings or errors in the
    checked browser session.

## Runtime defect found and repaired

The first real Agent request exposed a latent PostgreSQL runtime error:
`terminalize_agent_request` schema-qualified SQL syntax as
`pg_catalog.coalesce`. PostgreSQL accepted the function definition but raised
SQLSTATE `42883` when the branch executed.

The expired request was settled by the bounded maintenance RPC. All 25
reserved Credits were returned, reservations reached zero, and the full
25,000-micro-USD model ceiling remained committed to the safety budget because
the upstream provider might already have billed the request.

Forward migration
`202607310001_agent_terminalize_coalesce_runtime_fix.sql` repairs exactly the
two invalid occurrences and reasserts the service-role-only execute boundary.
Follow-up migration
`202607310002_agent_terminalize_definition_guard.sql` pins the exact repaired
SHA-256 definition plus its owner, `SECURITY DEFINER`, and `search_path`.
`202607310003_agent_terminalize_exact_acl_guard.sql` additionally requires the
complete catalog ACL to contain exactly the owner and `service_role` EXECUTE
entries, both without grant option. Production recorded all three forward
migrations, and the installed function contains zero `pg_catalog.coalesce`
occurrences.

The occurrence-based repair and the later guards are separate forward
migrations, not one atomic historical rewrite. This receipt therefore does
not claim that an already-committed `310001` repair would be rolled back if a
later guard rejected pre-existing same-count semantic drift. The post-repair
production definition and privilege state matched every
`310002`/`310003` postcondition when `310003` committed; applied migration
history remains immutable. As with any catalog guard, a later privileged DDL
change requires separate drift detection and is not prevented by the migration
itself.

Regression evidence:

- Agent terminalization runtime repair: 3/3 PGlite tests passed, covering
  successful settlement, provider-failure Credit refund, and post-repair
  definition/security drift plus unexpected EXECUTE-grantee rejection.
- Full disposable migration chain: 11/11 PGlite tests passed after adding the
  forward migration.
- Complete Vitest suite: 81/81 files and 612/612 tests passed in the final
  single-worker run with a normal process exit. Final lint and TypeScript
  checks also passed.

## Remaining gates

This is production software-flow proof, not physical-launch approval.

- Keep rate/concurrency exhaustion, multi-key $3-cap exhaustion, expired-key,
  rotation, revocation, and deliberate provider-outage drills in a controlled
  staging window; do not spend customer inventory or intentionally exhaust a
  production wallet for those tests.
- Confirm OpenAI project billing alerts and data-control eligibility. The
  application sends `store:false`, but that is not a Zero Data Retention
  guarantee.
- Obtain retained proof of the authorized scheduled maintenance HTTP route;
  this acceptance directly exercised the bounded database maintenance RPC.
- Monitor the settlement-function definition and ACL for later privileged DDL
  drift; the forward guards validate catalog state when they commit rather
  than making future catalog changes impossible.
- Complete the physical print proof, concealment, custody, store training,
  10–20 person soft test, and brand/legal approvals before distribution.
