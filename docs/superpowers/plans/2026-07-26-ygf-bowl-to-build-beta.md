# YGF Bowl-to-Build Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a validated, production-oriented YGF-owned beta that turns a qualifying purchase into one effortless QR-scan or code redemption, a 3,000-credit AI balance, four useful task shortcuts, and an optional OpenRouter-style model choice, while also shipping campaign operations, legal copy, analytics, and print assets.

**Architecture:** Use Next.js 16 App Router with a server-side campaign domain layer, interchangeable in-memory and Supabase repositories, Supabase SSR authentication, and an OpenAI-compatible provider adapter configured for OpenRouter or a gateway. Business rules live outside route handlers. Supabase RPCs provide transaction boundaries for redemption and spend/refund operations; development demo mode uses the same interfaces and deterministic fixtures.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules/global design tokens, Supabase Auth/Postgres, Zod, Lucide React, QRCode, Vitest, Testing Library, Playwright, axe-core, pnpm 11.

---

## Product decisions that resolve source ambiguity

1. The complete beta ships all four workflows. The report's "one task page" is treated as the first vertical slice, not the launch boundary.
2. Every successful redemption creates exactly 3,000 non-cash Build Credits that expire 14 days after redemption.
3. A task reserves 120 Build Credits before provider execution. Success commits the reservation; provider failure refunds it. The separate provider-cost ledger enforces a USD hard cap of $0.25 per user.
4. Beta claims are scratch-card or receipt-insert codes with the same single-use value printed as text and encoded in a QR URL fragment. Scanning pre-fills the claim without placing the code in requests, referrers, or retained browser history. Automated POS printing is outside this repository.
5. The public validation step checks syntax and generic eligibility before sign-in without revealing code state. Authenticated redemption performs the authoritative atomic check.
6. Development uses `BOWL7K2A` and an in-memory repository only when `YGF_DEMO_MODE=true`. Production refuses demo mode and requires Supabase configuration.
7. OpenRouter-compatible inference is the live beta adapter. `YGF_PROVIDER_BASE_URL` permits a compatible gateway URL. No key or secret is committed.
8. Pick My Bowl never claims live price, availability, ingredient, nutrition, or allergen accuracy. It uses manager-verifiable content and always tells users to confirm the final total and allergens with staff.
9. Prompt payloads are not retained by default. History stores task type, generated title, an optional user-saved result, usage, and timestamps. Users choose whether to save output.
10. Google, Apple, and magic-link UI is implemented through Supabase. Provider-console configuration remains an external launch gate.
11. OpenRouter connection promotion appears only after a completed task. OAuth execution is not enabled until partner credentials and approved partner terms exist.
12. Privacy-preserving abuse controls use HMAC-derived, short-lived network/device signals; raw IP addresses and full plaintext codes are never stored.
13. The first-use promise is `Eat → scan or enter code → choose a task → get a result`. A signed-in user who scans a valid receipt QR should need at most one confirmation tap before reaching the wallet; no profile setup is required.
14. The wallet behaves like a deliberately simpler OpenRouter: one visible AI balance can fund multiple allowlisted models, but task-first defaults hide model complexity. An `Advanced: choose a model` control is optional, uses friendly capability labels, and never exposes provider keys or billing setup.
15. The supplied `南加大杨国福` folder currently contains a cost workbook but no standalone or embedded photos. The generated bowl visual is the beta fallback; replacing it with a manager-supplied, rights-cleared YGF food photo is a named launch gate.

## Design lock

- Background: warm cream `#FFF8F1`; surfaces: true white; text: `#1F2937`; muted: `#6B7280`; primary: `#8B1E2D`; accent: `#F2B84B`; success: `#0F766E`.
- Typography: Geist/Inter/system sans, deliberate control typography, large editorial headings, restrained line height.
- Geometry: 18px primary radius, thin borders, restrained soft shadows, open layouts, one dominant media frame.
- Header: brand, essential links, one Redeem action. No hero eyebrow, badge, pill, fake metric, gradient, glow, USC mark, or implied university endorsement.
- Canonical hero copy: `Buy a bowl. Build with AI.` plus the source-provided subhead, actions, and non-affiliation line.
- Accepted concept inventory:
  - `docs/design/concepts/landing-first-viewport.png`
  - `docs/design/concepts/landing-downstream.png`
  - `docs/design/concepts/redeem.png`
  - `docs/design/concepts/wallet.png`
  - `docs/design/concepts/task-study-success.png`
  - `docs/design/concepts/poster-a.png`
- Production beta hero asset: `public/media/malatang-hero.png`. Keep attribution/source metadata in `docs/design/media-ledger.md`; replace the generated fallback when a manager-supplied, rights-cleared YGF photo is available.

## File map

- `app/`: route composition, metadata, public pages, authenticated pages, and route handlers.
- `components/`: focused visual primitives and feature-level UI.
- `lib/auth/`: Supabase SSR clients, demo identity, route authorization.
- `lib/campaign/`: code, wallet, spend, rate-limit, and task-domain behavior.
- `lib/repositories/`: repository interfaces plus memory and Supabase implementations.
- `lib/providers/`: provider-neutral contract, deterministic demo provider, OpenRouter-compatible provider.
- `lib/content/`: canonical campaign, FAQ, legal, task-preset, and menu-safety content.
- `supabase/migrations/`: schema, indexes, RLS, RPCs, and seed-safe setup.
- `scripts/`: private code-batch generation and campaign-asset rendering.
- `docs/operations/`: staff SOP, recovery/reissue policy, launch checklist.
- `docs/design/`: accepted concepts, tokens, fidelity ledger, campaign source files.
- `tests/unit/`, `tests/integration/`, `tests/e2e/`: behavior, boundary, browser, responsive, and accessibility verification.

### Task 1: Bootstrap the application and lock the design system

**Files:**
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `app/layout.tsx`
- Create: `app/globals.css`
- Create: `components/ui/button.tsx`
- Create: `components/ui/icons.tsx`
- Create: `components/site-header.tsx`
- Create: `lib/content/campaign.ts`
- Create: `tests/unit/campaign-content.test.ts`
- Create: `docs/design/media-ledger.md`
- Copy: source reports, accepted concepts, poster concept, and `public/media/malatang-hero.png`

- [ ] **Step 1: Add a failing content-contract test**

```ts
import { describe, expect, it } from "vitest";
import { campaign } from "@/lib/content/campaign";

describe("campaign content", () => {
  it("uses the approved offer and non-affiliation language", () => {
    expect(campaign.hero).toBe("Buy a bowl. Build with AI.");
    expect(campaign.minimumPurchaseCents).toBe(1600);
    expect(campaign.initialCredits).toBe(3000);
    expect(campaign.creditLifetimeDays).toBe(14);
    expect(campaign.uscDisclaimer).toContain("not sponsored, endorsed by, or administered by");
    expect(JSON.stringify(campaign)).not.toMatch(/\btoken(s)?\b/i);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm vitest run tests/unit/campaign-content.test.ts`

Expected: FAIL because `@/lib/content/campaign` does not exist.

- [ ] **Step 3: Add the application configuration and minimal content implementation**

Use Next.js 16 App Router, React 19, direct imports, strict TypeScript, ESLint CLI, Vitest with jsdom, and Playwright with desktop plus iPhone projects. Define the immutable `campaign` object with the exact values asserted above. Add semantic button and icon primitives; do not add visual behavior beyond the accepted design.

- [ ] **Step 4: Add global tokens and the quiet shared header**

Implement the design lock as CSS custom properties, typography, focus-visible states, reduced-motion handling, and responsive containers. Keep the header to brand, How it works, FAQ, and Redeem on public pages.

- [ ] **Step 5: Copy and inspect project-bound design/source assets**

Copy both user-supplied reports to `docs/source/`, all accepted concepts to `docs/design/concepts/`, the poster concept to the same folder, and the generated food fallback to `public/media/malatang-hero.png`. Record the source, generated status, inspection result, and real-YGF-photo replacement gate in `docs/design/media-ledger.md`. Use `view_image` on the copied image and verify its aspect, crop, and lack of text/logos.

- [ ] **Step 6: Verify and commit**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run tests/unit/campaign-content.test.ts`

Expected: all commands pass with one content test.

Commit: `chore: bootstrap YGF beta and design system`

### Task 2: Implement campaign domain rules and Supabase schema

**Files:**
- Create: `lib/campaign/types.ts`
- Create: `lib/campaign/code.ts`
- Create: `lib/campaign/claim-url.ts`
- Create: `lib/campaign/credits.ts`
- Create: `lib/campaign/rate-limit.ts`
- Create: `lib/repositories/campaign-repository.ts`
- Create: `lib/repositories/memory-campaign-repository.ts`
- Create: `supabase/migrations/202607260001_campaign.sql`
- Create: `tests/unit/code.test.ts`
- Create: `tests/unit/claim-url.test.ts`
- Create: `tests/unit/credits.test.ts`
- Create: `tests/integration/memory-repository.test.ts`
- Create: `docs/architecture.md`

- [ ] **Step 1: Write failing code and credit tests**

```ts
it("normalizes and hashes a code without retaining plaintext", async () => {
  expect(normalizeCode(" bowl-7k2a ")).toBe("BOWL7K2A");
  expect(await hashCode("BOWL7K2A")).toMatch(/^[a-f0-9]{64}$/);
  expect(await hashCode("BOWL7K2A")).not.toContain("BOWL7K2A");
});

it("round-trips a receipt claim through a URL fragment", () => {
  const url = buildClaimUrl("https://build.ygf.example", "BOWL7K2A");
  expect(url).toBe("https://build.ygf.example/redeem#code=BOWL7K2A");
  expect(parseClaimFragment(new URL(url).hash)).toBe("BOWL7K2A");
  expect(new URL(url).search).toBe("");
});

it("reserves 120 credits and refuses an overdraw", () => {
  expect(reserveCredits({ remaining: 3000, amount: 120 }).remaining).toBe(2880);
  expect(() => reserveCredits({ remaining: 100, amount: 120 })).toThrow("INSUFFICIENT_CREDITS");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run tests/unit/code.test.ts tests/unit/claim-url.test.ts tests/unit/credits.test.ts`

Expected: FAIL because campaign modules do not exist.

- [ ] **Step 3: Implement pure domain functions**

Implement eight-character uppercase code normalization, SHA-256 hashing, HMAC abuse-signal hashing, constant-time comparisons where applicable, receipt claim URL construction/parsing, 120-credit reservations, refunds, expiry checks, and the $0.25 per-user provider-cost ceiling. Claim URLs put the normalized code only in `#code=`, reject unexpected origins/paths/keys, and never send it as a query parameter. Keep provider dollars separate from consumer Build Credits.

- [ ] **Step 4: Define repository interfaces and the memory adapter**

The interface must atomically expose `validateCode`, `redeemCode`, `getWallet`, `reserveSpend`, `commitSpend`, `refundSpend`, `recordSession`, `listHistory`, `recordEvent`, `getDashboard`, `createBatch`, and `revokeCode`. Seed only `BOWL7K2A` in demo mode.

- [ ] **Step 5: Create the Postgres migration**

Create `profiles`, `promo_batches`, `promo_codes`, `wallets`, `ledger_entries`, `task_sessions`, `events`, `redemption_attempts`, `partner_connections`, and `provider_policies`. Add foreign keys, checks, unique constraints, partial indexes, timestamps, RLS, admin-role helpers, and `security definer` RPCs for atomic redemption and spend/refund. RPCs must use row locks and idempotency keys.

- [ ] **Step 6: Verify schema and repository behavior**

Run: `pnpm vitest run tests/unit/code.test.ts tests/unit/claim-url.test.ts tests/unit/credits.test.ts tests/integration/memory-repository.test.ts`

Expected: valid code redeems once, duplicate redemption returns `CODE_ALREADY_REDEEMED`, expired and revoked codes return their states, spend/refund is idempotent, and no plaintext code appears in serialized repository state.

Commit: `feat: add secure campaign ledger domain`

### Task 3: Build the public campaign experience

**Files:**
- Create: `app/(marketing)/page.tsx`
- Create: `app/(marketing)/offer/page.tsx`
- Create: `app/(marketing)/faq/page.tsx`
- Create: `app/(marketing)/terms/page.tsx`
- Create: `app/(marketing)/privacy/page.tsx`
- Create: `app/(marketing)/creator-kit/page.tsx`
- Create: `app/(marketing)/staff/page.tsx`
- Create: `components/marketing/hero.tsx`
- Create: `components/marketing/use-cases.tsx`
- Create: `components/marketing/how-it-works.tsx`
- Create: `components/marketing/faq-list.tsx`
- Create: `components/site-footer.tsx`
- Create: `lib/content/legal.ts`
- Create: `tests/unit/public-pages.test.tsx`

- [ ] **Step 1: Write a failing public-page test**

```tsx
render(<HomePage />);
expect(screen.getByRole("heading", { level: 1, name: "Buy a bowl. Build with AI." })).toBeVisible();
expect(screen.getByRole("link", { name: "Claim Build Credits" })).toHaveAttribute("href", "/redeem");
expect(screen.getByText(/not affiliated with or endorsed by USC/i)).toBeVisible();
expect(screen.getByRole("img", { name: /malatang bowl/i })).toBeVisible();
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm vitest run tests/unit/public-pages.test.tsx`

Expected: FAIL because public pages and components do not exist.

- [ ] **Step 3: Implement the accepted first viewport**

Match `landing-first-viewport.png`: exact header, hero copy, CTAs, image crop, phone/wallet treatment, next-section preview, colors, spacing, type scale, icon metaphors, and responsive behavior. Use `next/image` for the generated food photo and code-native UI for the phone.

- [ ] **Step 4: Implement downstream content and legal pages**

Match `landing-downstream.png` for the three-step rail, red busy-week band, FAQ list, and footer. Use only source-approved copy. Implement complete FAQ, promotional terms, privacy notice, creator disclosure guidance, and staff help content with the supplied disclaimers and sensitive-data warnings.

- [ ] **Step 5: Verify public rendering**

Run: `pnpm vitest run tests/unit/public-pages.test.tsx && pnpm lint && pnpm typecheck`

Expected: tests pass; no missing alt text, duplicate H1, or consumer-facing token language.

Commit: `feat: build public Bowl-to-Build campaign`

### Task 4: Implement authentication, redemption, and wallet

**Files:**
- Create: `lib/auth/client.ts`
- Create: `lib/auth/server.ts`
- Create: `lib/auth/user.ts`
- Create: `lib/repositories/index.ts`
- Create: `proxy.ts`
- Create: `app/auth/page.tsx`
- Create: `app/auth/callback/route.ts`
- Create: `app/redeem/page.tsx`
- Create: `app/redeem/success/page.tsx`
- Create: `app/wallet/page.tsx`
- Create: `app/expired/page.tsx`
- Create: `app/already-used/page.tsx`
- Create: `app/blocked/page.tsx`
- Create: `app/api/code/validate/route.ts`
- Create: `app/api/redeem/route.ts`
- Create: `app/api/balance/route.ts`
- Create: `components/redeem-form.tsx`
- Create: `components/wallet-balance.tsx`
- Create: `components/task-launcher.tsx`
- Create: `tests/integration/redemption-api.test.ts`
- Create: `tests/unit/redeem-form.test.tsx`

- [ ] **Step 1: Write failing route and form tests**

```ts
it("redeems once and initializes a 14-day wallet", async () => {
  const response = await redeemForTest({ code: "BOWL7K2A", userId: "demo-user" });
  expect(response.status).toBe(200);
  expect(response.body.wallet.remainingBalance).toBe(3000);
  expect(daysBetween(response.body.wallet.createdAt, response.body.wallet.expiresAt)).toBe(14);
  expect((await redeemForTest({ code: "BOWL7K2A", userId: "second-user" })).status).toBe(409);
});

it("pre-fills a scanned receipt claim and removes it from browser history", async () => {
  renderRedeemAt("/redeem#code=BOWL7K2A");
  expect(await screen.findByLabelText("Receipt code")).toHaveValue("BOWL7K2A");
  expect(window.location.hash).toBe("");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run tests/integration/redemption-api.test.ts tests/unit/redeem-form.test.tsx`

Expected: FAIL because routes, auth helpers, and components do not exist.

- [ ] **Step 3: Implement Supabase SSR and safe demo identity**

Use `@supabase/ssr` browser/server clients and Next.js 16 `proxy.ts` cookie refresh. Production must reject missing Supabase config. Demo identity is available only in development when `YGF_DEMO_MODE=true`.

- [ ] **Step 4: Implement validation and atomic redemption**

On first client render, parse an allowed `#code=` claim, pre-fill the form, and immediately remove the fragment with `history.replaceState`. Validate format and generic eligibility before auth, then redirect through auth with the code stored in a short-lived signed, httpOnly cookie. Derive user identity server-side, enforce rate limits, call the repository transaction, clear the cookie, and return typed errors without exposing code hashes or database details. A returning signed-in user with an accepted scanned claim proceeds with one confirmation tap and no profile form.

- [ ] **Step 5: Implement UI fidelity**

Match `redeem.png` and `wallet.png` at desktop and mobile sizes. Wallet leads with `Your AI balance`, remaining credits, dynamic expiry, mathematically correct usage, and four large task shortcuts. Add a collapsed `Advanced: choose a model` control with `Best for this task` selected by default. Do not show partner promotion before a successful task.

- [ ] **Step 6: Verify**

Run: `pnpm vitest run tests/integration/redemption-api.test.ts tests/unit/redeem-form.test.tsx`

Expected: success, invalid, used, expired, revoked, blocked, unauthenticated, and throttled states pass.

Commit: `feat: add atomic redemption and wallet`

### Task 5: Implement four AI workflows, provider controls, and history

**Files:**
- Create: `lib/content/tasks.ts`
- Create: `lib/content/menu.ts`
- Create: `lib/providers/provider.ts`
- Create: `lib/providers/model-catalog.ts`
- Create: `lib/providers/demo-provider.ts`
- Create: `lib/providers/openrouter-provider.ts`
- Create: `lib/providers/index.ts`
- Create: `lib/campaign/run-task.ts`
- Create: `app/task/[type]/page.tsx`
- Create: `app/history/page.tsx`
- Create: `app/connect/openrouter/page.tsx`
- Create: `app/api/tasks/route.ts`
- Create: `app/api/history/route.ts`
- Create: `components/task/task-shell.tsx`
- Create: `components/task/preset-list.tsx`
- Create: `components/task/result-panel.tsx`
- Create: `components/task/partner-cta.tsx`
- Create: `tests/unit/task-presets.test.ts`
- Create: `tests/unit/model-catalog.test.ts`
- Create: `tests/integration/run-task.test.ts`
- Create: `tests/unit/task-shell.test.tsx`

- [ ] **Step 1: Write failing workflow tests**

```ts
it.each(["study", "coding", "career", "pick-my-bowl"] as const)(
  "runs %s with one reservation and a completed session",
  async (taskType) => {
    const result = await runTaskForTest({ taskType, input: validInput(taskType), idempotencyKey: `key-${taskType}` });
    expect(result.status).toBe("completed");
    expect(result.remainingCredits).toBe(2880);
    expect(result.output.title.length).toBeGreaterThan(0);
  },
);

it("refunds credits when the provider fails", async () => {
  const result = await runFailingTaskForTest();
  expect(result.error).toBe("PROVIDER_UNAVAILABLE");
  expect(result.remainingCredits).toBe(3000);
});

it("defaults to the task-recommended model and rejects models outside the allowlist", async () => {
  expect(recommendedModel("study").id).toBeTruthy();
  await expect(runTaskForTest({ model: "unlisted/provider-model" })).rejects.toThrow("MODEL_NOT_ALLOWED");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run tests/unit/task-presets.test.ts tests/unit/model-catalog.test.ts tests/integration/run-task.test.ts tests/unit/task-shell.test.tsx`

Expected: FAIL because task modules do not exist.

- [ ] **Step 3: Implement task content and safety**

Provide four exact preset sets from the report. Enforce 1–12,000 character text-only input. Include accuracy review language on every task, the food/allergen confirmation warning for Pick My Bowl, and no current-price promise.

- [ ] **Step 4: Implement providers and spend orchestration**

The provider interface returns output, input/output token use, request ID, model, and optional USD estimate. Define a small server-owned model catalog with friendly capability labels, per-task defaults, and exact provider IDs; do not fetch or expose an unbounded provider catalog. The demo provider returns deterministic useful structured output. The OpenRouter-compatible adapter uses server-only credentials, timeout/abort, no debug echo, attribution headers, safe error mapping, and model allowlisting.

- [ ] **Step 5: Implement reserve-call-commit/refund**

Derive the user server-side, apply per-user request and USD limits, reserve 120 credits with an idempotency key, call the provider once, then commit or refund. Never store raw input unless the user explicitly saves the result. Duplicate idempotency keys return the first result.

- [ ] **Step 6: Implement task and history UI**

Match `task-study-success.png` with a two-column desktop workspace and one-column mobile flow. Keep the default generation path model-free; the optional advanced selector uses friendly labels and explains that all choices spend the same 120 beta credits. Partner CTA renders only when at least one session completed. History lists metadata and only explicitly saved outputs.

- [ ] **Step 7: Verify**

Run: `pnpm vitest run tests/unit/task-presets.test.ts tests/unit/model-catalog.test.ts tests/integration/run-task.test.ts tests/unit/task-shell.test.tsx`

Expected: all four workflows, insufficient balance, expired wallet, provider failure/refund, duplicate idempotency, provider-cost cap, and CTA gating pass.

Commit: `feat: add four credit-backed AI workflows`

### Task 6: Add admin operations, analytics, and private code generation

**Files:**
- Create: `lib/auth/admin.ts`
- Create: `lib/analytics/metrics.ts`
- Create: `app/admin/codes/page.tsx`
- Create: `app/admin/dashboard/page.tsx`
- Create: `app/api/admin/codes/route.ts`
- Create: `app/api/admin/codes/[id]/revoke/route.ts`
- Create: `app/api/events/route.ts`
- Create: `components/admin/metric-summary.tsx`
- Create: `components/admin/code-batch-form.tsx`
- Create: `scripts/generate-codes.mts`
- Create: `tests/unit/metrics.test.ts`
- Create: `tests/integration/admin-api.test.ts`
- Create: `tests/integration/generate-codes.test.ts`

- [ ] **Step 1: Write failing authorization and metrics tests**

```ts
it("rejects a non-admin code-batch request", async () => {
  expect((await createBatchForTest({ role: "user", count: 300 })).status).toBe(403);
});

it("computes the beta funnel from distinct users", () => {
  expect(computeMetrics(betaEvents)).toMatchObject({
    distributed: 300,
    redeemed: 66,
    activated: 36,
    returned: 20,
    connected: 7,
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run tests/unit/metrics.test.ts tests/integration/admin-api.test.ts tests/integration/generate-codes.test.ts`

Expected: FAIL because admin and analytics modules do not exist.

- [ ] **Step 3: Implement admin authorization and APIs**

Require `app_metadata.role=admin` or an exact server-side allowlist. Batch creation accepts 1–3,000 codes, returns plaintext exactly once to a private CSV download, stores only hashes, records operator and batch source, and supports revocation with an audit event.

- [ ] **Step 4: Implement the generator**

Generate cryptographically random unambiguous eight-character codes, reject duplicates, write CSV only under an explicit `--out private/...` path, and print only the destination/count—not codes—to stdout.

- [ ] **Step 5: Implement dashboard metrics**

Report distributed, redeemed, first-task activated, returned, partner-connected, remaining credits, provider cost, error rate, and source attribution. Use accessible tables and summary values; do not invent a chart where a number/table is clearer.

- [ ] **Step 6: Verify**

Run: `pnpm vitest run tests/unit/metrics.test.ts tests/integration/admin-api.test.ts tests/integration/generate-codes.test.ts`

Expected: role enforcement, 300 unique code hashes, one-time plaintext export, revocation, and metric calculations pass.

Commit: `feat: add campaign admin and analytics`

### Task 7: Produce campaign assets and operating documentation

**Files:**
- Create: `scripts/render-campaign-assets.mts`
- Create: `public/campaign/poster-24x36.svg`
- Create: `public/campaign/poster-11x17.svg`
- Create: `public/campaign/counter-card-5x7.svg`
- Create: `public/campaign/social-feed-1080x1350.svg`
- Create: `public/campaign/social-story-1080x1920.svg`
- Create: `public/campaign/social-horizontal-1200x628.svg`
- Create: `output/pdf/ygf-poster-24x36.pdf`
- Create: `output/pdf/ygf-counter-card-5x7.pdf`
- Create: `docs/operations/staff-sop.md`
- Create: `docs/operations/code-recovery-and-reissue.md`
- Create: `docs/operations/launch-checklist.md`
- Create: `docs/operations/soft-test-script.md`
- Create: `docs/design/design-system.md`
- Create: `docs/design/fidelity-ledger.md`
- Create: `tests/integration/campaign-assets.test.ts`

- [ ] **Step 1: Write a failing asset-contract test**

```ts
it.each([
  ["poster-24x36.svg", "24in", "36in"],
  ["counter-card-5x7.svg", "5in", "7in"],
])("renders %s at the required size", async (name, width, height) => {
  const svg = await readCampaignAsset(name);
  expect(svg).toContain(`width="${width}"`);
  expect(svg).toContain(`height="${height}"`);
  expect(svg).toContain("Buy a bowl. Build with AI.");
  expect(svg).toContain("not affiliated with or endorsed by USC");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm vitest run tests/integration/campaign-assets.test.ts`

Expected: FAIL because campaign outputs do not exist.

- [ ] **Step 3: Implement deterministic vector assets**

Rebuild Poster Concept A with the generated beta bowl image, code-native/vector text, line icons, and a real public campaign QR that resolves to `/offer?utm_source=<asset>`. Separately, make the private code-batch generator emit print-ready claim rows containing both the human-readable code and a QR resolving to `/redeem#code=<same-code>`; plaintext claim outputs remain ignored under `private/` and are never committed. Preserve required quiet zones and add the complete fine print. Derive the specified poster, counter, feed, story, and horizontal sizes from one tokenized renderer.

- [ ] **Step 4: Render and visually inspect PDFs**

Render the 24x36 poster and 5x7 card to PDF, then use `pdftoppm` and `view_image` to verify scannability, crop, hierarchy, fine-print legibility, and absence of clipping or black squares. Use an actual QR decoder in the test to confirm the URL.

- [ ] **Step 5: Write complete operations docs**

Document checkout qualification, paired text-code/claim-QR handoff, the difference between public campaign and private receipt QRs, invalid/used/expired handling, manager-only revocation and reissue, privacy-safe escalation, 10–20-person soft-test cases, launch gates, rollback, and who must verify menu/prices, the replacement YGF photo, and external account configuration.

- [ ] **Step 6: Verify**

Run: `pnpm vitest run tests/integration/campaign-assets.test.ts`

Expected: every size exists, copy is correct, all QR codes decode to the correct source URL, and the two PDFs render cleanly.

Commit: `feat: ship campaign assets and operations pack`

### Task 8: End-to-end browser, accessibility, security, and release verification

**Files:**
- Create: `tests/e2e/happy-path.spec.ts`
- Create: `tests/e2e/error-states.spec.ts`
- Create: `tests/e2e/responsive-a11y.spec.ts`
- Create: `tests/e2e/admin.spec.ts`
- Create: `README.md`
- Create: `.env.example`
- Create: `docs/release-readiness.md`
- Update: `docs/design/fidelity-ledger.md`

- [ ] **Step 1: Write failing browser tests**

```ts
test("offer to first useful result", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Claim Build Credits" }).click();
  await page.getByLabel("Receipt code").fill("BOWL7K2A");
  await page.getByLabel(/promotional terms/i).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "What will you build first?" })).toBeVisible();
  await page.getByRole("link", { name: /Study/ }).click();
  await page.getByLabel("What are you working on?").fill("Explain active recall and create five flashcards.");
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByRole("heading", { name: "Your study guide" })).toBeVisible();
  await expect(page.getByText("2,880")).toBeVisible();
});

test("receipt QR pre-fills the same claim without retaining it in the URL", async ({ page }) => {
  await page.goto("/redeem#code=BOWL7K2A");
  await expect(page.getByLabel("Receipt code")).toHaveValue("BOWL7K2A");
  await expect(page).toHaveURL(/\/redeem$/);
});
```

- [ ] **Step 2: Run Playwright and verify RED**

Run: `pnpm test:e2e`

Expected: FAIL until demo server wiring and browser fixtures are complete.

- [ ] **Step 3: Complete release documentation**

`README.md` must distinguish demo, local Supabase, and production modes; include setup, migrations, auth-provider configuration, provider configuration, code generation, test commands, deployment, and secret handling. `.env.example` contains names and safe descriptions only, never sample secrets.

- [ ] **Step 4: Verify the complete matrix**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Expected: all pass with no warnings that indicate broken behavior.

- [ ] **Step 5: Browser/IAB fidelity QA**

Use the built-in browser first. Verify `/`, `/offer`, typed-code and receipt-QR `/redeem` entry, `/wallet`, the default task-first path, the optional model chooser, all four task routes, `/history`, error states, legal pages, staff page, admin pages, and post-success partner gating. Capture desktop at 1536×1024 and mobile at 390×844. Use `view_image` on accepted concepts and latest screenshots in the same pass.

- [ ] **Step 6: Close the fidelity ledger**

Record at least five concrete comparisons for copy, first-viewport composition, typography, palette, media treatment, container model, controls/icons, mobile behavior, and task state. Fix every material mismatch. Run an above-the-fold copy diff and record any external-only launch gates.

- [ ] **Step 7: Final security review**

Confirm no secrets, plaintext promo batches, raw IPs, sensitive prompts, debug provider payloads, or service-role code reach client bundles/logs. Confirm authorization on every mutation and admin route, RLS on every user table, idempotency on redemption/spend, rate limits, input limits, and safe provider error mapping.

- [ ] **Step 8: Commit**

Commit: `test: verify YGF beta release readiness`

## Final acceptance gates

- All local quality commands pass.
- Browser happy path reaches a useful result and deducts exactly 120 credits.
- A receipt QR and its printed code redeem the same single-use claim; scanning pre-fills it and removes the fragment from the visible URL/history before network submission.
- The default path requires no model knowledge, while an advanced user can select only a friendly, server-allowlisted model.
- Duplicate, expired, revoked, blocked, throttled, provider-failure, and refund behavior is proven.
- Public legal/safety/disclaimer copy is visible and consistent.
- All four workflows work in demo mode and use the same provider contract in live mode.
- Supabase migration contains indexes, RLS, atomic RPCs, and admin separation.
- Admin operations generate 300 unique single-use codes without logging or committing plaintext.
- Poster and counter-card PDFs render cleanly and QR codes decode.
- Desktop/mobile screenshots match the accepted concepts with no material visual mismatch.
- Git history contains scoped commits; remote branch and repository commit are verified after push.
- External launch gates are named honestly: provider/auth console credentials, a manager-supplied rights-cleared YGF photo, manager-verified menu/prices/allergens, printed materials, staff training, soft-test completion, live deployment, and university/provider policy re-verification.
