import { describe, expect, it } from "vitest";
import { campaign } from "@/lib/content/campaign";

describe("campaign content", () => {
  it("uses the approved offer and non-affiliation language", () => {
    expect(campaign.hero).toBe("Buy a bowl. Build with AI.");
    expect(campaign.minimumPurchaseCents).toBe(2500);
    expect(campaign.initialCredits).toBe(3000);
    expect(campaign.creditLifetimeDays).toBe(14);
    expect(campaign.uscDisclaimer).toContain(
      "not sponsored, endorsed by, or administered by",
    );
    expect(JSON.stringify(campaign)).not.toMatch(/\btoken(s)?\b/i);
  });
});
