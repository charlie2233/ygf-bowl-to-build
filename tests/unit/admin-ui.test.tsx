import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CodeBatchForm } from "@/components/admin/code-batch-form";
import { MetricSummary } from "@/components/admin/metric-summary";

describe("admin campaign UI", () => {
  it("renders the one-time plaintext warning and accessible batch controls", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <CodeBatchForm />,
    );

    expect(document.body.textContent).toContain(
      "Plaintext appears once",
    );
    expect(
      document.body.querySelector('input[name="count"][min="1"][max="3000"]'),
    ).toBeTruthy();
    expect(
      document.body.querySelector('select[name="source"]'),
    ).toBeTruthy();
    expect(
      document.body.querySelector(
        'input[name="rowReference"][pattern^="YGF-"]',
      ),
    ).toBeTruthy();
    expect(
      document.body.querySelector(
        'input[name="rewardRevokeRowReference"][pattern^="YGF-"]',
      ),
    ).toBeTruthy();
    expect(document.body.textContent).toContain(
      "I confirm the private CSV is saved in approved storage.",
    );
    expect(
      document.body.querySelector(
        'button[type="button"][disabled]',
      )?.textContent,
    ).toBe("Activate saved batch");
    expect(document.body.textContent).toContain(
      "Pending batches cannot be redeemed.",
    );
    expect(
      Array.from(document.body.querySelectorAll("button")).map(
        (button) => button.textContent,
      ),
    ).toEqual([
      "Create and download CSV",
      "Activate saved batch",
      "Attach Claude gift",
      "Revoke Claude gift",
      "Revoke code",
    ]);
    expect(document.body.textContent).toContain(
      "cannot retract a bearer link that was already opened or provider-redeemed",
    );
  });

  it("uses definition semantics for the complete dashboard summary", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <MetricSummary
        activeWalletCount={12}
        metrics={{
          activated: 36,
          agentActivated: 4,
          agentActivationRate: 4 / 5,
          agentAnomalyCount: 1,
          agentErrorRate: 0.1,
          averageProviderCostPerRedeemedCardMicroUsd: 1870.545,
          connected: 7,
          distributed: 300,
          firstAiUseRate: 36 / 66,
          keyCreationRate: 5 / 66,
          keyCreators: 5,
          modelUsage: [{ calls: 4, model: "fast" }],
          providerCostMicroUsd: 123_456,
          providerCostUsd: 0.123456,
          redeemed: 66,
          redemptionRate: 66 / 300,
          remainingCredits: 75_000,
          returned: 20,
          sevenDayReturnRate: 18 / 60,
          sevenDayEligible: 60,
          sevenDayReturned: 18,
          shareCardCreators: 12,
          shareCardRate: 12 / 66,
          sourceAttribution: [],
          taskErrorRate: 0.125,
        }}
      />,
    );

    expect(
      document.body.querySelector(
        'dl[aria-label="Campaign metric summary"]',
      ),
    ).toBeTruthy();
    expect(document.body.querySelectorAll("dt")).toHaveLength(15);
    expect(document.body.textContent).not.toContain(
      "External handoff connected",
    );
    expect(document.body.textContent).toContain("Codes distributed");
    expect(document.body.textContent).toContain(
      "Build Credits remaining",
    );
    expect(document.body.textContent).toContain("Task error rate");
    expect(document.body.textContent).toContain("Agent first success");
    expect(document.body.textContent).toContain("7-day revisit");
    expect(document.body.textContent).toContain("18 / 60");
    expect(document.body.textContent).toContain("12.5%");
  });
});
