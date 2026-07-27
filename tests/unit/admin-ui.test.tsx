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
      "Revoke code",
    ]);
  });

  it("uses definition semantics for the complete dashboard summary", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <MetricSummary
        activeWalletCount={12}
        metrics={{
          activated: 36,
          connected: 7,
          distributed: 300,
          providerCostMicroUsd: 123_456,
          providerCostUsd: 0.123456,
          redeemed: 66,
          remainingCredits: 75_000,
          returned: 20,
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
    expect(document.body.querySelectorAll("dt")).toHaveLength(9);
    expect(document.body.textContent).toContain("Codes distributed");
    expect(document.body.textContent).toContain(
      "Build Credits remaining",
    );
    expect(document.body.textContent).toContain("Task error rate");
    expect(document.body.textContent).toContain("12.5%");
  });
});
