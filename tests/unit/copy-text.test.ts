import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "@/lib/browser/copy-text";

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "execCommand");
  Reflect.deleteProperty(navigator, "clipboard");
  document.body.innerHTML = "";
});

describe("copyText", () => {
  it("uses the modern clipboard on secure origins", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await copyText("safe result");

    expect(writeText).toHaveBeenCalledWith("safe result");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to a temporary selection on private-LAN HTTP", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await copyText("LAN result");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back when an exposed clipboard rejects the write", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error("NotAllowedError");
        }),
      },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => true),
    });

    await expect(copyText("fallback result")).resolves.toBeUndefined();
  });

  it("removes its temporary field and restores focus when legacy copy throws", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => {
        throw new Error("Copy unavailable");
      }),
    });
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();

    await expect(copyText("cleanup result")).rejects.toThrow(
      "Copy unavailable",
    );

    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
