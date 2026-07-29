import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HeroVideo,
  shouldAnimateHero,
} from "@/components/marketing/hero-video";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("cinematic hero video preferences", () => {
  it("enables motion for a standard connection", () => {
    expect(
      shouldAnimateHero({
        effectiveType: "4g",
        reduceMotion: false,
        saveData: false,
      }),
    ).toBe(true);
  });

  it("keeps the poster for reduced motion, data saver, and slow networks", () => {
    expect(
      shouldAnimateHero({
        effectiveType: "4g",
        reduceMotion: true,
        saveData: false,
      }),
    ).toBe(false);
    expect(
      shouldAnimateHero({
        effectiveType: "4g",
        reduceMotion: false,
        saveData: true,
      }),
    ).toBe(false);
    expect(
      shouldAnimateHero({
        effectiveType: "2g",
        reduceMotion: false,
        saveData: false,
      }),
    ).toBe(false);
  });
});

describe("cinematic hero video connection gating", () => {
  let connectionDescriptor: PropertyDescriptor | undefined;
  let container: HTMLDivElement;
  let matchMediaDescriptor: PropertyDescriptor | undefined;
  let root: Root;

  beforeEach(() => {
    connectionDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "connection",
    );
    matchMediaDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "matchMedia",
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        removeEventListener: vi.fn(),
      })),
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();

    if (connectionDescriptor) {
      Object.defineProperty(navigator, "connection", connectionDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "connection");
    }
    if (matchMediaDescriptor) {
      Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
    vi.restoreAllMocks();
  });

  it.each([
    {
      connection: { effectiveType: "4g", saveData: true },
      label: "data saver",
    },
    {
      connection: { effectiveType: "2g", saveData: false },
      label: "a 2g connection",
    },
  ])("does not insert video sources for $label", async ({ connection }) => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: connection,
    });

    await act(async () => {
      root.render(
        createElement(HeroVideo, {
          imageAlt: "A bowl of malatang",
          pauseLabel: "Pause motion",
          playLabel: "Play motion",
        }),
      );
    });

    const video = container.querySelector("video");

    expect(video).not.toBeNull();
    expect(video?.querySelectorAll("source")).toHaveLength(0);
    expect(video?.autoplay).toBe(false);
    expect(video?.preload).toBe("none");
  });
});
