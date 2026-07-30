"use client";

import Script from "next/script";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import type { SiteLocale } from "@/lib/i18n/site";

const TURNSTILE_SCRIPT_ID = "cloudflare-turnstile-explicit";
const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileLanguage = "en" | "es" | "fr" | "ru" | "zh-cn";

export const turnstileLanguage: Record<
  SiteLocale,
  TurnstileLanguage
> = {
  en: "en",
  es: "es",
  fr: "fr",
  ru: "ru",
  zh: "zh-cn",
};

interface TurnstileRenderOptions {
  action: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  language: string;
  sitekey: string;
  size: "flexible";
  theme: "auto";
  "timeout-callback": () => void;
}

interface TurnstileApi {
  remove(widgetId: string): void;
  render(
    container: HTMLElement,
    options: TurnstileRenderOptions,
  ): string;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileWidgetHandle {
  reset(): void;
}

interface TurnstileWidgetProps {
  label: string;
  locale: SiteLocale;
  onError: () => void;
  onReady: () => void;
  onTokenChange: (token: string | null) => void;
  siteKey: string;
}

export const TurnstileWidget = forwardRef<
  TurnstileWidgetHandle,
  TurnstileWidgetProps
>(function TurnstileWidget(
  { label, locale, onError, onReady, onTokenChange, siteKey },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  const onTokenChangeRef = useRef(onTokenChange);
  const [scriptStatus, setScriptStatus] = useState<
    "loading" | "ready" | "unavailable"
  >(
    () =>
      typeof window !== "undefined" &&
      typeof window.turnstile !== "undefined"
        ? "ready"
        : "loading",
  );

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        const widgetId = widgetIdRef.current;
        if (!widgetId) {
          return;
        }
        onTokenChangeRef.current(null);
        window.turnstile?.reset(widgetId);
      },
    }),
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    const turnstile = window.turnstile;
    if (scriptStatus !== "ready" || !container || !turnstile) {
      return;
    }

    let widgetId: string;
    try {
      widgetId = turnstile.render(container, {
        action: "redeem-code",
        callback: (token) => onTokenChangeRef.current(token),
        "error-callback": () => {
          setScriptStatus("unavailable");
          onTokenChangeRef.current(null);
          onErrorRef.current();
        },
        "expired-callback": () =>
          onTokenChangeRef.current(null),
        language: turnstileLanguage[locale],
        sitekey: siteKey,
        size: "flexible",
        theme: "auto",
        "timeout-callback": () =>
          onTokenChangeRef.current(null),
      });
      widgetIdRef.current = widgetId;
      onReadyRef.current();
    } catch {
      setScriptStatus("unavailable");
      onTokenChangeRef.current(null);
      onErrorRef.current();
      return;
    }

    return () => {
      onTokenChangeRef.current(null);
      turnstile.remove(widgetId);
      if (widgetIdRef.current === widgetId) {
        widgetIdRef.current = null;
      }
    };
  }, [locale, scriptStatus, siteKey]);

  function handleScriptReady() {
    if (typeof window.turnstile === "undefined") {
      setScriptStatus("unavailable");
      onTokenChangeRef.current(null);
      onErrorRef.current();
      return;
    }
    setScriptStatus("ready");
  }

  function handleScriptError() {
    setScriptStatus("unavailable");
    onTokenChangeRef.current(null);
    onErrorRef.current();
  }

  return (
    <>
      <Script
        id={TURNSTILE_SCRIPT_ID}
        onError={handleScriptError}
        onLoad={handleScriptReady}
        onReady={handleScriptReady}
        src={TURNSTILE_SCRIPT_URL}
        strategy="afterInteractive"
      />
      <div
        aria-busy={scriptStatus === "loading"}
        aria-label={label}
        className="redeem-form__turnstile"
        ref={containerRef}
      />
    </>
  );
});
