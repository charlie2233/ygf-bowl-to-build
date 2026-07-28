import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResultPanel } from "@/components/task/result-panel";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const output = {
  sections: [
    {
      heading: "Key ideas",
      items: ["Use a concrete example."],
    },
  ],
  title: "Your result",
};

describe("ResultPanel copy action", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Reflect.deleteProperty(document, "execCommand");
    Reflect.deleteProperty(navigator, "clipboard");
    vi.restoreAllMocks();
  });

  async function renderPanel() {
    await act(async () => {
      root.render(
        <ResultPanel
          onReset={vi.fn()}
          onSave={vi.fn(async () => undefined)}
          output={output}
        />,
      );
    });
  }

  it("copies a result on private-LAN HTTP with the selection fallback", async () => {
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    await renderPanel();

    const copyButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent === "Copy");
    await act(async () => {
      copyButton?.click();
      await Promise.resolve();
    });

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(copyButton?.textContent).toBe("Copied");
  });

  it("explains when both clipboard paths are unavailable", async () => {
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false),
    });
    await renderPanel();

    const copyButton = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent === "Copy");
    await act(async () => {
      copyButton?.click();
      await Promise.resolve();
    });

    expect(copyButton?.textContent).toBe("Copy failed");
  });
});
