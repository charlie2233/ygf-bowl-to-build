"use client";

import { useState, type FormEvent } from "react";

import { createAuthBrowserClient } from "@/lib/auth/client";

interface AuthPanelProps {
  initialError?: string;
  isAnonymous?: boolean;
  mode: "demo" | "supabase";
  nextPath: string;
}

function callbackUrl(nextPath: string) {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", nextPath);
  return url.toString();
}

export function AuthPanel({
  initialError,
  isAnonymous = false,
  mode,
  nextPath,
}: AuthPanelProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(
    initialError ?? null,
  );
  const [messageKind, setMessageKind] = useState<"error" | "status">(
    initialError ? "error" : "status",
  );
  const [busy, setBusy] = useState(false);

  async function signInWithProvider(provider: "apple" | "google") {
    setBusy(true);
    setMessage(null);
    setMessageKind("status");
    const client = createAuthBrowserClient();
    const { error } = isAnonymous
      ? await client.auth.linkIdentity({
          options: { redirectTo: callbackUrl(nextPath) },
          provider,
        })
      : await client.auth.signInWithOAuth({
          options: { redirectTo: callbackUrl(nextPath) },
          provider,
        });
    if (error) {
      setMessage("Sign-in could not start. Please try another option.");
      setMessageKind("error");
      setBusy(false);
    }
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
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
    setMessage(
      error
        ? "We couldn’t send the sign-in link. Check the email and try again."
        : "Check your email for a secure sign-in link.",
    );
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
        <h1>Continue to your Build Credits</h1>
        <p>
          Demo mode keeps the whole flow on this device—no account setup
          required.
        </p>
        {messageElement}
        <a className="button button--primary button--medium" href={nextPath}>
          Continue in demo
        </a>
      </div>
    );
  }

  if (isAnonymous) {
    return (
      <div className="auth-panel">
        <h1>Upgrade to connect an Agent</h1>
        <p>
          Your guest wallet already works for YGF web AI. Link a verified
          identity only for personal Agent keys, recovery, and cross-device
          access.
        </p>
        <p className="auth-panel__warning">
          Until you link an account, clearing this browser’s site data can
          permanently remove access to this guest wallet.
        </p>
        <div className="auth-panel__providers">
          <button
            className="button button--secondary button--medium"
            disabled={busy}
            onClick={() => void signInWithProvider("google")}
            type="button"
          >
            Link Google
          </button>
          <button
            className="button button--secondary button--medium"
            disabled={busy}
            onClick={() => void signInWithProvider("apple")}
            type="button"
          >
            Link Apple
          </button>
        </div>
        {messageElement}
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <h1>Sign in to recover your wallet</h1>
      <p>
        Normal receipt scans use a guest wallet without a login screen.
        Choose an account only for recovery or cross-device access.
      </p>
      <div className="auth-panel__providers">
        <button
          className="button button--secondary button--medium"
          disabled={busy}
          onClick={() => void signInWithProvider("google")}
          type="button"
        >
          Continue with Google
        </button>
        <button
          className="button button--secondary button--medium"
          disabled={busy}
          onClick={() => void signInWithProvider("apple")}
          type="button"
        >
          Continue with Apple
        </button>
      </div>
      <div aria-hidden="true" className="auth-panel__divider">
        <span />
        or
        <span />
      </div>
      <form onSubmit={sendMagicLink}>
        <label htmlFor="auth-email">Email</label>
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
          Email me a sign-in link
        </button>
      </form>
      {messageElement}
    </div>
  );
}
