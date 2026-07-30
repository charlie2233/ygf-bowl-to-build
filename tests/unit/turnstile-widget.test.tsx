import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scriptCallbacks = vi.hoisted(() => ({
  onError: undefined as (() => void) | undefined,
  onLoad: undefined as (() => void) | undefined,
  onReady: undefined as (() => void) | undefined,
}));

vi.mock("next/script", () => ({
  default: ({
    onError,
    onLoad,
    onReady,
    src,
  }: {
    onError: () => void;
    onLoad: () => void;
    onReady: () => void;
    src: string;
  }) => {
    scriptCallbacks.onError = onError;
    scriptCallbacks.onLoad = onLoad;
    scriptCallbacks.onReady = onReady;
    return <div data-src={src} data-testid="turnstile-script" />;
  },
}));

import {
  TurnstileWidget,
  type TurnstileWidgetHandle,
  turnstileLanguage,
} from "@/components/turnstile-widget";
import type { SiteLocale } from "@/lib/i18n/site";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type RenderOptions = Parameters<
  NonNullable<Window["turnstile"]>["render"]
>[1];

describe("explicit Turnstile widget", () => {
  let container: HTMLDivElement;
  let root: Root;
  let renderWidget: ReturnType<
    typeof vi.fn<(container: HTMLElement, options: RenderOptions) => string>
  >;
  let removeWidget: ReturnType<typeof vi.fn<(widgetId: string) => void>>;
  let resetWidget: ReturnType<typeof vi.fn<(widgetId: string) => void>>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    scriptCallbacks.onError = undefined;
    scriptCallbacks.onLoad = undefined;
    scriptCallbacks.onReady = undefined;
    let sequence = 0;
    renderWidget = vi.fn(() => `widget-${++sequence}`);
    removeWidget = vi.fn();
    resetWidget = vi.fn();
    window.turnstile = {
      remove: removeWidget,
      render: renderWidget,
      reset: resetWidget,
    };
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete window.turnstile;
    vi.restoreAllMocks();
  });

  it("renders explicitly, resets its exact ID, removes it, and remounts with an already-loaded script", async () => {
    const handle = createRef<TurnstileWidgetHandle>();
    const onError = vi.fn();
    const onReady = vi.fn();
    const onTokenChange = vi.fn();

    await act(async () => {
      root.render(
        <TurnstileWidget
          label="Security check"
          locale="en"
          onError={onError}
          onReady={onReady}
          onTokenChange={onTokenChange}
          ref={handle}
          siteKey="site-key"
        />,
      );
    });

    expect(renderWidget).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledOnce();
    const firstOptions = renderWidget.mock.calls[0]![1];
    expect(firstOptions).toMatchObject({
      action: "redeem-code",
      language: "en",
      sitekey: "site-key",
      size: "flexible",
      theme: "auto",
    });
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="turnstile-script"]',
      )?.dataset.src,
    ).toContain("api.js?render=explicit");

    await act(async () => firstOptions.callback("single-use-token"));
    expect(onTokenChange).toHaveBeenLastCalledWith("single-use-token");

    await act(async () => handle.current?.reset());
    expect(resetWidget).toHaveBeenCalledWith("widget-1");
    expect(onTokenChange).toHaveBeenLastCalledWith(null);

    await act(async () => root.unmount());
    expect(removeWidget).toHaveBeenCalledWith("widget-1");

    root = createRoot(container);
    await act(async () => {
      root.render(
        <TurnstileWidget
          label="Security check"
          locale="en"
          onError={onError}
          onReady={onReady}
          onTokenChange={onTokenChange}
          siteKey="site-key"
        />,
      );
    });
    expect(renderWidget).toHaveBeenCalledTimes(2);
    expect(onReady).toHaveBeenCalledTimes(2);
    expect(renderWidget.mock.results[1]?.value).toBe("widget-2");
  });

  it("waits for a non-preloaded API and becomes ready through the script callbacks", async () => {
    delete window.turnstile;
    const onError = vi.fn();
    const onReady = vi.fn();

    await act(async () => {
      root.render(
        <TurnstileWidget
          label="Security check"
          locale="en"
          onError={onError}
          onReady={onReady}
          onTokenChange={vi.fn()}
          siteKey="site-key"
        />,
      );
    });

    expect(renderWidget).not.toHaveBeenCalled();
    expect(
      container
        .querySelector(".redeem-form__turnstile")
        ?.getAttribute("aria-busy"),
    ).toBe("true");

    window.turnstile = {
      remove: removeWidget,
      render: renderWidget,
      reset: resetWidget,
    };
    await act(async () => scriptCallbacks.onLoad?.());

    expect(renderWidget).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(
      container
        .querySelector(".redeem-form__turnstile")
        ?.getAttribute("aria-busy"),
    ).toBe("false");

    await act(async () => scriptCallbacks.onReady?.());
    expect(renderWidget).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("removes and re-renders the widget with every supported campaign language", async () => {
    const locales: SiteLocale[] = ["en", "zh", "es", "fr", "ru"];
    expect(turnstileLanguage.zh).toBe("zh-cn");

    for (const locale of locales) {
      await act(async () => {
        root.render(
          <TurnstileWidget
            label="Security check"
            locale={locale}
            onError={vi.fn()}
            onReady={vi.fn()}
            onTokenChange={vi.fn()}
            siteKey="site-key"
          />,
        );
      });

      const latestOptions = renderWidget.mock.calls.at(-1)?.[1];
      expect(latestOptions?.language).toBe(turnstileLanguage[locale]);
    }

    expect(renderWidget).toHaveBeenCalledTimes(5);
    expect(removeWidget.mock.calls.map(([widgetId]) => widgetId)).toEqual([
      "widget-1",
      "widget-2",
      "widget-3",
      "widget-4",
    ]);
  });

  it("clears expired and timed-out tokens and reports widget errors", async () => {
    const onError = vi.fn();
    const onTokenChange = vi.fn();

    await act(async () => {
      root.render(
        <TurnstileWidget
          label="Security check"
          locale="zh"
          onError={onError}
          onReady={vi.fn()}
          onTokenChange={onTokenChange}
          siteKey="site-key"
        />,
      );
    });

    const options = renderWidget.mock.calls[0]![1];
    await act(async () => options["expired-callback"]());
    await act(async () => options["timeout-callback"]());
    await act(async () => options["error-callback"]());
    await act(async () => scriptCallbacks.onError?.());

    expect(onTokenChange).toHaveBeenCalledWith(null);
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
