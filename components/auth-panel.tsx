"use client";

import { useState, type FormEvent } from "react";

import { useCampaignLanguage } from "@/components/campaign-language";
import { createAuthBrowserClient } from "@/lib/auth/client";
import { isIdentityAlreadyExistsError } from "@/lib/auth/errors";
import type { OAuthProviderAvailability } from "@/lib/auth/provider-availability";
import { safeAuthNextPath } from "@/lib/auth/redirect";
import {
  customerPagesCopy,
  type AuthMessageKey,
} from "@/lib/i18n/customer-pages";

interface AuthPanelProps {
  initialMessageKey?: AuthMessageKey;
  isAnonymous?: boolean;
  mode: "demo" | "supabase";
  nextPath: string;
  providerAvailability?: OAuthProviderAvailability;
}

const NO_OAUTH_PROVIDERS: OAuthProviderAvailability = {
  apple: false,
  google: false,
};

function callbackUrl(nextPath: string) {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", safeAuthNextPath(nextPath));
  return url.toString();
}

export function AuthPanel({
  initialMessageKey,
  isAnonymous = false,
  mode,
  nextPath,
  providerAvailability = NO_OAUTH_PROVIDERS,
}: AuthPanelProps) {
  const { locale } = useCampaignLanguage();
  const copy = customerPagesCopy[locale].auth;
  const [email, setEmail] = useState("");
  const [messageKey, setMessageKey] = useState<AuthMessageKey | null>(
    initialMessageKey ?? null,
  );
  const [messageKind, setMessageKind] = useState<"error" | "status">(
    initialMessageKey ? "error" : "status",
  );
  const [busy, setBusy] = useState(false);
  const message = messageKey ? copy.messages[messageKey] : null;
  const unavailableProviderKey =
    !providerAvailability.google && !providerAvailability.apple
      ? "both"
      : !providerAvailability.google
        ? "google"
        : !providerAvailability.apple
          ? "apple"
          : null;
  const providerStatus = unavailableProviderKey
    ? copy.providerAvailability[
        isAnonymous ? "anonymous" : "recovery"
      ][unavailableProviderKey]
    : null;
  const providerStatusId = providerStatus
    ? "auth-provider-availability"
    : undefined;

  async function signInWithProvider(provider: "apple" | "google") {
    if (!providerAvailability[provider]) {
      return;
    }
    setBusy(true);
    setMessageKey(null);
    setMessageKind("status");
    try {
      const client = createAuthBrowserClient();
      const { data, error } = isAnonymous
        ? await client.auth.linkIdentity({
            options: { redirectTo: callbackUrl(nextPath) },
            provider,
          })
        : await client.auth.signInWithOAuth({
            options: { redirectTo: callbackUrl(nextPath) },
            provider,
          });
      if (error || !data.url) {
        throw error ?? new Error("OAUTH_REDIRECT_UNAVAILABLE");
      }
    } catch (error) {
      setMessageKey(
        isIdentityAlreadyExistsError(error)
          ? "identityAlreadyExists"
          : "providerError",
      );
      setMessageKind("error");
      setBusy(false);
    }
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessageKey(null);
    setMessageKind("status");
    const client = createAuthBrowserClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl(nextPath),
      },
    });
    setBusy(false);
    setMessageKind(error ? "error" : "status");
    setMessageKey(error ? "magicLinkError" : "magicLinkSent");
  }

  const messageElement = (
    <p
      aria-live={messageKind === "error" ? "assertive" : "polite"}
      className={`auth-panel__message${
        messageKind === "error" ? " auth-panel__message--error" : ""
      }`}
      role={
        message
          ? messageKind === "error"
            ? "alert"
            : "status"
          : undefined
      }
    >
      {message}
    </p>
  );

  if (mode === "demo") {
    return (
      <div className="auth-panel">
        <h1>{copy.demo.title}</h1>
        <p>{copy.demo.description}</p>
        {messageElement}
        <a className="button button--primary button--medium" href={nextPath}>
          {copy.demo.continue}
        </a>
      </div>
    );
  }

  if (isAnonymous) {
    return (
      <div className="auth-panel">
        <h1>{copy.anonymous.title}</h1>
        <p>{copy.anonymous.description}</p>
        <p className="auth-panel__warning">
          {copy.anonymous.warning}
        </p>
        <div className="auth-panel__providers">
          <button
            aria-describedby={
              providerAvailability.google
                ? undefined
                : providerStatusId
            }
            className="button button--secondary button--medium"
            disabled={busy || !providerAvailability.google}
            onClick={() => void signInWithProvider("google")}
            type="button"
          >
            {copy.anonymous.google}
          </button>
          <button
            aria-describedby={
              providerAvailability.apple
                ? undefined
                : providerStatusId
            }
            className="button button--secondary button--medium"
            disabled={busy || !providerAvailability.apple}
            onClick={() => void signInWithProvider("apple")}
            type="button"
          >
            {copy.anonymous.apple}
          </button>
        </div>
        {providerStatus ? (
          <p
            aria-live="polite"
            className="auth-panel__provider-status"
            id={providerStatusId}
            role="status"
          >
            {providerStatus}
          </p>
        ) : null}
        {messageElement}
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <h1>{copy.recovery.title}</h1>
      <p>{copy.recovery.description}</p>
      <div className="auth-panel__providers">
        <button
          aria-describedby={
            providerAvailability.google ? undefined : providerStatusId
          }
          className="button button--secondary button--medium"
          disabled={busy || !providerAvailability.google}
          onClick={() => void signInWithProvider("google")}
          type="button"
        >
          {copy.recovery.google}
        </button>
        <button
          aria-describedby={
            providerAvailability.apple ? undefined : providerStatusId
          }
          className="button button--secondary button--medium"
          disabled={busy || !providerAvailability.apple}
          onClick={() => void signInWithProvider("apple")}
          type="button"
        >
          {copy.recovery.apple}
        </button>
      </div>
      {providerStatus ? (
        <p
          aria-live="polite"
          className="auth-panel__provider-status"
          id={providerStatusId}
          role="status"
        >
          {providerStatus}
        </p>
      ) : null}
      <div aria-hidden="true" className="auth-panel__divider">
        <span />
        {copy.recovery.or}
        <span />
      </div>
      <form onSubmit={sendMagicLink}>
        <label htmlFor="auth-email">{copy.recovery.emailLabel}</label>
        <input
          autoComplete="email"
          id="auth-email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        <button
          className="button button--primary button--medium"
          disabled={busy}
          type="submit"
        >
          {copy.recovery.emailSubmit}
        </button>
      </form>
      {messageElement}
    </div>
  );
}
