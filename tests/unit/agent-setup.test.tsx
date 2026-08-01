import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentSetup } from "@/components/agent/agent-setup";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const API_KEY = `ygf_${"A".repeat(43)}`;
const KEY_ID = "00000000-0000-4000-8000-000000000099";
const KEY = {
  createdAt: "2026-07-27T20:00:00.000Z",
  expiresAt: "2026-08-10T20:00:00.000Z",
  id: KEY_ID,
  last4: API_KEY.slice(-4),
  lastUsedAt: null,
  limits: {
    maximumConcurrentRequests: 2,
    maximumRequestsPerMinute: 12,
  },
  ownerId: "demo-user",
  prefix: API_KEY.slice(0, 8),
  providerCommittedMicroUsd: 0,
  remainingCredits: 3000,
  revokedAt: null,
  rotatedAt: null,
  scopes: ["chat:completions", "models:read"],
  walletId: "00000000-0000-4000-8000-000000000098",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("AgentSetup", () => {
  let clipboardDescriptor: PropertyDescriptor | undefined;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-4000-8000-000000000100",
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    if (clipboardDescriptor) {
      Object.defineProperty(
        navigator,
        "clipboard",
        clipboardDescriptor,
      );
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps API access optional and leaves ordinary AI tools one click away", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ keys: [] })),
    );

    await act(async () => {
      root.render(
        <AgentSetup configuredOrigin="https://build.ygf.test" />,
      );
    });
    await settle();

    expect(container.textContent).toContain("Advanced");
    expect(container.textContent).toContain("Developer API key");
    expect(container.textContent).toContain(
      "normal Study, Coding, Career, and Pick My Bowl tools still work without one",
    );
    expect(container.textContent).not.toContain(API_KEY);
    expect(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.includes("Create personal key"),
      ),
    ).toBeTruthy();
  });

  it("renders bounded provider spend without revealing a stored secret", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          keys: [
            {
              ...KEY,
              providerCommittedMicroUsd: 12_345,
            },
          ],
        }),
      ),
    );

    await act(async () => {
      root.render(<AgentSetup />);
    });
    await settle();

    expect(container.textContent).toContain(
      "Estimated provider spend",
    );
    expect(container.textContent).toContain("$0.0123");
    expect(container.textContent).not.toContain(API_KEY);
  });

  it("finishes a successful usage refresh instead of leaving a busy status", async () => {
    let resolveRefresh: (response: Response) => void = () => {
      throw new Error("Refresh resolver was not initialized");
    };
    const pendingRefresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    let requestCount = 0;
    const fetchMock = vi.fn(() => {
      requestCount += 1;
      return requestCount === 1
        ? Promise.resolve(jsonResponse({ keys: [KEY] }))
        : pendingRefresh;
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<AgentSetup />);
    });
    await settle();

    const refresh = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Refresh"));
    await act(async () => {
      refresh?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Refreshing your keys…",
    );
    expect(refresh?.disabled).toBe(true);

    await act(async () => {
      resolveRefresh(
        jsonResponse({
          keys: [
            {
              ...KEY,
              lastUsedAt: "2026-07-31T20:00:00.000Z",
              providerCommittedMicroUsd: 12_345,
              remainingCredits: 2999,
            },
          ],
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("2,999");
    expect(container.textContent).toContain("$0.0123");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Your key list is up to date.",
    );
    expect(container.textContent).not.toContain("Refreshing your keys…");
    expect(refresh?.disabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reveals a new key once, copies configs, and runs a bounded connection check", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/keys" && !init?.method) {
        return jsonResponse({ keys: [] });
      }
      if (url === "/api/keys" && init?.method === "POST") {
        return jsonResponse(
          {
            apiKey: API_KEY,
            key: KEY,
            notice: "Copy this key now.",
          },
          201,
        );
      }
      if (
        url === "/v1/chat/completions" &&
        init?.method === "POST"
      ) {
        return jsonResponse({
          choices: [
            {
              message: {
                content: "Demo connection successful.",
                role: "assistant",
              },
            },
          ],
          ygf: { remaining_credits: 2990 },
        });
      }
      return jsonResponse({ error: "unexpected" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <AgentSetup configuredOrigin="https://attacker.example" />,
      );
    });
    await settle();

    const create = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Create personal key"),
    );
    await act(async () => {
      create?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain(API_KEY);
    expect(container.textContent).toContain("Shown once");
    expect(container.textContent).toContain("3,000");

    const copyEnv = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Copy .env"),
    );
    await act(async () => copyEnv?.click());
    expect(writeText).toHaveBeenCalledWith(
      `OPENAI_BASE_URL=${window.location.origin}/v1\nOPENAI_API_KEY=${API_KEY}`,
    );

    const copyBaseUrl = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Copy Base URL"));
    await act(async () => copyBaseUrl?.click());
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/v1`,
    );

    const copyJson = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Copy JSON"),
    );
    await act(async () => copyJson?.click());
    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify(
        {
          apiKey: API_KEY,
          baseURL: `${window.location.origin}/v1`,
          model: "fast",
        },
        null,
        2,
      ),
    );
    expect(writeText.mock.calls.flat().join("\n")).not.toContain(
      "attacker.example",
    );

    const testConnection = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Test connection"));
    await act(async () => {
      testConnection?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain(
      "Connection successful. 2,990 credits remain.",
    );
    const connectionCall = fetchMock.mock.calls.find(
      ([url]) =>
        String(url) ===
          "/v1/chat/completions",
    );
    expect(connectionCall?.[1]).toMatchObject({
      credentials: "omit",
      method: "POST",
    });
    expect(
      (connectionCall?.[1]?.headers as Record<string, string>)[
        "idempotency-key"
      ],
    ).toBe("abababab-abab-4bab-abab-abababababab");
    expect(
      (connectionCall?.[1]?.headers as Record<string, string>)
        .authorization,
    ).toBe(`Bearer ${API_KEY}`);
    expect(String(connectionCall?.[0])).not.toContain(API_KEY);
    expect(connectionCall?.[1]?.body).not.toContain(API_KEY);

    const refresh = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Refresh"));
    await act(async () => {
      refresh?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain(API_KEY);
    expect(container.textContent).toContain("Shown once");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Your key list is up to date.",
    );
    expect(
      Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("Copy API key"),
      ),
    ).toBeTruthy();
    expect(testConnection?.disabled).toBe(false);
  });
});
