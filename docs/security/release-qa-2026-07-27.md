# Tasks 1–8 release QA — July 27, 2026

This is a source-level, local release review for the Tasks 1–8 beta
checkpoint. It is not proof of a production deployment, live provider,
production Supabase policies, printer custody, or a physical QR scan.

## Scope and result

- Review mode: complete working-tree review, including untracked application,
  API, migration, admin, task, analytics, asset, private-print, and test files.
- Deterministic review worklist: 47/47 files completed.
- Validated candidates: four.
- Reportable findings: three low-severity findings.
- Defense-in-depth item: one local/operator-only private-path behavior.
- Remediation: all four items were fixed before the checkpoint.

The review concentrated on claim secrecy, mutation authorization, RLS and
service-role boundaries, horizontal access, idempotency and credit accounting,
provider boundaries, logging, and public/private artifact integrity.

## Remediations

### Provider request boundary

The provider adapter now sets `redirect: "error"` on the prompt-bearing
request. Redirect and network failures are normalized to the existing
`PROVIDER_UNAVAILABLE` response. A regression asserts both the redirect policy
and the safe error mapping.

### Public SVG and PDF identity

The campaign verification command now rebuilds the expected SVG and PDF bytes
from the reviewed origin, deterministic scene, fixed dimensions, and approved
hero input. It compares the existing artifacts exactly and remains read-only.
Regression tests reject both scanner-visible SVG module changes and a valid PDF
rendered for another origin.

### Private print filesystem

The private renderer accepts only direct `private/<file>` paths. The private
root must be a real directory with no group or other permissions; source files
must remain restrictive. Nested directories and symlink paths are rejected
before any external side effect. Valid output retains no-overwrite and mode
`0600` behavior.

## Verification evidence

| Gate | Result |
| --- | --- |
| Focused remediation tests | 38/38 pass |
| Unit and integration suite | 35 files, 250/250 pass |
| ESLint | Pass |
| TypeScript | Pass |
| Production build | Pass |
| Playwright | 41/41 pass across setup, desktop Chromium, and iPhone WebKit |
| Client output key-name scan | No server secret variable names found |
| Working-tree whitespace check | Pass |

## Controls confirmed in source

- Browser-supplied identity does not authorize redemption, wallet, task,
  history, event, or admin state.
- Redemption and task settlement use server-owned, idempotent database
  operations.
- Provider endpoint, model policy, provider-cost ceiling, and the beta wallet
  cap remain server-controlled.
- Failed provider work refunds the reservation; duplicate terminalization does
  not spend twice.
- Admin mutations recheck authority at the route and database boundary.
- Plaintext claim outputs are one-time, ignored under `private/`, and absent
  from public campaign assets.
- Raw prompts, full claims, raw network identifiers, and provider payloads are
  not used as analytics events.
- Public campaign QRs and private claim QRs are separate, and private QR text
  parity is decoder-tested.

## Remaining external gates

- Apply and test the migration in disposable and production Supabase projects,
  including RLS and concurrent redemption/spend behavior.
- Install real server credentials and test the approved provider with billing
  and retention controls.
- Deploy the verified SHA over the final HTTPS origin and repeat the public QR
  checks.
- Preserve or authenticate artifacts through the real deployment and print
  handoffs.
- Raster-decode every final digital asset and scan physical print proofs.
- Complete privacy/legal approval, staff training, inventory custody, and the
  10–20-person soft test.
