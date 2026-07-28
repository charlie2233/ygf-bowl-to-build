import { describe, expect, it } from "vitest";

import { isAgentGatewayReady } from "@/lib/agent/readiness";

describe("Agent gateway readiness", () => {
  it("requires both the production flag and a nonblank OpenAI key", () => {
    expect(
      isAgentGatewayReady(
        {
          OPENAI_API_KEY: "server-secret",
          YGF_AGENT_GATEWAY_ENABLED: "true",
        },
        "production",
      ),
    ).toBe(true);
    for (const environment of [
      {},
      { OPENAI_API_KEY: "server-secret" },
      { YGF_AGENT_GATEWAY_ENABLED: "true" },
      {
        OPENAI_API_KEY: "   ",
        YGF_AGENT_GATEWAY_ENABLED: "true",
      },
    ]) {
      expect(
        isAgentGatewayReady(environment, "production"),
      ).toBe(false);
    }
  });

  it("keeps local demo and test flows ready without an external key", () => {
    expect(isAgentGatewayReady({}, "development")).toBe(true);
    expect(isAgentGatewayReady({}, "test")).toBe(true);
  });
});
