"use client";

import { AlertTriangle, ArrowLeft, Clock3, Laptop } from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

import { useCampaignLanguage } from "@/components/campaign-language";
import {
  TurnstileWidget,
  type TurnstileWidgetHandle,
} from "@/components/turnstile-widget";
import { createAuthBrowserClient } from "@/lib/auth/client";
import { parseClaimFragment } from "@/lib/campaign/claim-url";
import { redeemCopy, type RedeemErrorKey } from "@/lib/i18n/redeem";

export interface RedeemFormSubmission {
  code: string;
  termsAccepted: true;
  turnstileToken?: string;
}

export interface RedeemFormProps {
  confirmPendingClaim?: () => Promise<void>;
  createAnonymousSession?: () => Promise<void>;
  pendingClaimReady?: boolean;
  submitClaim?: (submission: RedeemFormSubmission) => Promise<void>;
  turnstileRequired?: boolean;
  turnstileSiteKey?: string | null;
}

type TurnstileStatus =
  | "disabled"
  | "loading"
  | "ready"
  | "unavailable";

async function readOptionalJson<T extends object>(
  response: Response,
): Promise<Partial<T>> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object" ? (body as Partial<T>) : {};
  } catch {
    return {};
  }
}

async function defaultConfirmPendingClaim() {
  const redemption = await fetch("/api/redeem", {
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!redemption.ok) {
    const body = await readOptionalJson<{ error?: string }>(redemption);
    const destination = redemptionErrorDestination(body.error);
    if (destination) {
      window.location.assign(destination);
      return;
    }
    if (body.error === "REDEMPTION_PAUSED") {
      throw new Error("REDEMPTION_PAUSED");
    }
    if (body.error === "ACCOUNT_GRANT_LIMIT_REACHED") {
      throw new Error("ACCOUNT_GRANT_LIMIT_REACHED");
    }
    throw new Error("REDEMPTION_UNAVAILABLE");
  }
  window.location.assign("/redeem/success");
}

async function defaultCreateAnonymousSession() {
  const client = createAuthBrowserClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user || data.user.is_anonymous !== true) {
    throw new Error("ANONYMOUS_AUTH_UNAVAILABLE");
  }
}

async function defaultSubmitClaim(
  submission: RedeemFormSubmission,
  createAnonymousSession: () => Promise<void>,
  confirmPendingClaim: () => Promise<void>,
) {
  const validation = await fetch("/api/code/validate", {
    body: JSON.stringify(submission),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const validationBody = await readOptionalJson<{
    eligible?: boolean;
    error?: string;
    next?: string;
    requiresAnonymousSession?: boolean;
  }>(validation);

  if (validation.status === 429) {
    throw new Error("VALIDATION_THROTTLED");
  }
  if (validationBody.error === "TURNSTILE_REQUIRED") {
    throw new Error("TURNSTILE_REQUIRED");
  }
  if (validationBody.error === "TURNSTILE_UNAVAILABLE") {
    throw new Error("TURNSTILE_UNAVAILABLE");
  }
  if (validation.status === 403) {
    throw new Error("REQUEST_REJECTED");
  }
  if (
    validation.status === 503 &&
    validationBody.error === "REDEMPTION_PAUSED"
  ) {
    throw new Error("REDEMPTION_PAUSED");
  }
  if (validation.status >= 500) {
    throw new Error("SERVICE_UNAVAILABLE");
  }
  if (!validation.ok || !validationBody.eligible) {
    throw new Error("CODE_INVALID");
  }
  if (validationBody.next) {
    window.location.assign(validationBody.next);
    return;
  }

  if (validationBody.requiresAnonymousSession) {
    await createAnonymousSession();
  }
  await confirmPendingClaim();
}

export function redemptionErrorDestination(error: string | undefined) {
  switch (error) {
    case "ACCOUNT_ALREADY_REDEEMED":
    case "CODE_ALREADY_REDEEMED":
      return "/already-used";
    case "CODE_EXPIRED":
      return "/expired";
    case "CODE_REVOKED":
      return "/revoked";
    case "REDEMPTION_THROTTLED":
      return "/blocked";
    case "AUTHENTICATION_REQUIRED":
      return "/auth?next=/redeem";
    default:
      return null;
  }
}

function userFacingErrorKey(error: unknown): RedeemErrorKey {
  if (error instanceof Error) {
    if (error.message === "CODE_INVALID") {
      return "codeUnavailable";
    }
    if (error.message === "VALIDATION_THROTTLED") {
      return "validationThrottled";
    }
    if (error.message === "TURNSTILE_REQUIRED") {
      return "verificationRequired";
    }
    if (error.message === "TURNSTILE_UNAVAILABLE") {
      return "verificationUnavailable";
    }
    if (
      error.message === "SERVICE_UNAVAILABLE" ||
      error.message === "REDEMPTION_UNAVAILABLE"
    ) {
      return "serviceUnavailable";
    }
    if (error.message === "REDEMPTION_PAUSED") {
      return "redemptionPaused";
    }
    if (error.message === "ACCOUNT_GRANT_LIMIT_REACHED") {
      return "accountGrantLimitReached";
    }
    if (error.message === "ANONYMOUS_AUTH_UNAVAILABLE") {
      return "anonymousUnavailable";
    }
  }
  return "generic";
}

function normalizedCardCode(value: string) {
  return value.replace(/[\s-]/gu, "").toUpperCase();
}

function isValidCardCode(value: string) {
  return /^[A-Z0-9]{8}$/u.test(normalizedCardCode(value));
}

function subscribeToHydration() {
  return () => undefined;
}

function getHydratedSnapshot() {
  return true;
}

function getServerHydratedSnapshot() {
  return false;
}

export function RedeemForm({
  confirmPendingClaim = defaultConfirmPendingClaim,
  createAnonymousSession = defaultCreateAnonymousSession,
  pendingClaimReady = false,
  submitClaim,
  turnstileRequired = false,
  turnstileSiteKey = null,
}: RedeemFormProps) {
  const { locale } = useCampaignLanguage();
  const copy = redeemCopy[locale].form;
  const codeId = useId();
  const codeHintId = useId();
  const errorId = useId();
  const scannedStatusId = useId();
  const termsId = useId();
  const codeInputRef = useRef<HTMLInputElement>(null);
  const submissionInFlightRef = useRef(false);
  const termsInputRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const [code, setCode] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errorField, setErrorField] = useState<
    "code" | "terms" | null
  >(null);
  const [errorKey, setErrorKey] = useState<RedeemErrorKey | null>(
    null,
  );
  const [showManualAuthFallback, setShowManualAuthFallback] =
    useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(
    null,
  );
  const turnstileNeeded = turnstileRequired && !pendingClaimReady;
  const initialTurnstileStatus: TurnstileStatus =
    !turnstileNeeded
      ? "disabled"
      : turnstileSiteKey
        ? "loading"
        : "unavailable";
  const [turnstileStatus, setTurnstileStatus] =
    useState<TurnstileStatus>(initialTurnstileStatus);
  const turnstileStatusRef = useRef<TurnstileStatus>(
    initialTurnstileStatus,
  );
  const turnstileConfigurationRef = useRef({
    needed: turnstileNeeded,
    siteKey: turnstileSiteKey,
  });
  const [wasScanned, setWasScanned] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );
  const errorMessage = errorKey ? (
    <div
      aria-atomic="true"
      className={[
        "redeem-form__message",
        "redeem-form__message--error",
        errorField === "terms"
          ? "redeem-form__message--terms-popout"
          : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={
        errorField === "terms" ? "terms-consent-error" : undefined
      }
      id={errorId}
      role="alert"
    >
      {errorField === "terms" ? (
        <AlertTriangle aria-hidden="true" />
      ) : null}
      <span>{copy.errors[errorKey]}</span>
    </div>
  ) : null;

  const updateTurnstileStatus = useCallback(
    (status: TurnstileStatus) => {
      turnstileStatusRef.current = status;
      setTurnstileStatus(status);
    },
    [],
  );

  const markTurnstileUnavailable = useCallback(() => {
    updateTurnstileStatus("unavailable");
    setTurnstileToken(null);
    setErrorField(null);
    setErrorKey("verificationUnavailable");
  }, [updateTurnstileStatus]);

  function handleTurnstileTokenChange(token: string | null) {
    if (turnstileStatusRef.current === "unavailable") {
      return;
    }
    setTurnstileToken(token);
    if (token) {
      setErrorKey((current) =>
        current === "verificationRequired" ? null : current,
      );
    }
  }

  useEffect(() => {
    if (
      turnstileConfigurationRef.current.needed === turnstileNeeded &&
      turnstileConfigurationRef.current.siteKey === turnstileSiteKey
    ) {
      return;
    }
    turnstileConfigurationRef.current = {
      needed: turnstileNeeded,
      siteKey: turnstileSiteKey,
    };
    setTurnstileToken(null);
    updateTurnstileStatus(
      !turnstileNeeded
        ? "disabled"
        : turnstileSiteKey
          ? "loading"
          : "unavailable",
    );
  }, [
    turnstileNeeded,
    turnstileSiteKey,
    updateTurnstileStatus,
  ]);

  useEffect(() => {
    let active = true;

    function consumeClaimFromUrl() {
      const url = new URL(window.location.href);
      const fragment = url.hash;
      const hasLegacySensitiveQuery =
        url.searchParams.has("code") ||
        url.searchParams.has("termsAccepted");
      url.searchParams.delete("code");
      url.searchParams.delete("termsAccepted");
      if (fragment || hasLegacySensitiveQuery) {
        const safeSearch = url.searchParams.toString();
        window.history.replaceState(
          window.history.state,
          "",
          `${url.pathname}${safeSearch ? `?${safeSearch}` : ""}`,
        );
      }

      if (!fragment) {
        return;
      }

      try {
        const parsedCode = parseClaimFragment(fragment);
        if (!isValidCardCode(parsedCode)) {
          throw new Error("CLAIM_URL_INVALID");
        }
        queueMicrotask(() => {
          if (active) {
            setCode(parsedCode);
            setErrorField(null);
            setErrorKey(null);
            setWasScanned(true);
          }
        });
      } catch {
        queueMicrotask(() => {
          if (active) {
            setErrorField("code");
            setErrorKey("qrInvalid");
            setWasScanned(false);
            codeInputRef.current?.focus();
          }
        });
      }
    }

    consumeClaimFromUrl();
    window.addEventListener("hashchange", consumeClaimFromUrl);

    return () => {
      active = false;
      window.removeEventListener("hashchange", consumeClaimFromUrl);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInFlightRef.current) {
      return;
    }
    setErrorField(null);
    setErrorKey(null);
    setShowManualAuthFallback(false);

    if (pendingClaimReady) {
      submissionInFlightRef.current = true;
      setIsSubmitting(true);
      try {
        await confirmPendingClaim();
      } catch (submissionError) {
        setErrorKey(userFacingErrorKey(submissionError));
      } finally {
        submissionInFlightRef.current = false;
        setIsSubmitting(false);
      }
      return;
    }

    if (!isValidCardCode(code)) {
      setErrorField("code");
      setErrorKey("codeInvalid");
      codeInputRef.current?.focus();
      return;
    }
    if (!termsAccepted) {
      setErrorField("terms");
      setErrorKey("termsRequired");
      termsInputRef.current?.focus();
      return;
    }
    if (turnstileRequired && !turnstileSiteKey) {
      setErrorKey("verificationUnavailable");
      return;
    }

    const currentTurnstileStatus = turnstileStatusRef.current;
    if (turnstileNeeded && currentTurnstileStatus !== "ready") {
      setErrorKey(
        currentTurnstileStatus === "unavailable"
          ? "verificationUnavailable"
          : "verificationRequired",
      );
      return;
    }

    if (
      turnstileNeeded &&
      (typeof turnstileToken !== "string" ||
        turnstileToken.length === 0 ||
        turnstileToken.length > 2_048)
    ) {
      setErrorKey("verificationRequired");
      return;
    }

    submissionInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const submission = {
        code: normalizedCardCode(code),
        termsAccepted: true as const,
        ...(typeof turnstileToken === "string"
          ? { turnstileToken }
          : {}),
      };
      if (submitClaim) {
        await submitClaim(submission);
      } else {
        await defaultSubmitClaim(
          submission,
          createAnonymousSession,
          confirmPendingClaim,
        );
      }
    } catch (submissionError) {
      const nextErrorKey = userFacingErrorKey(submissionError);
      if (nextErrorKey === "verificationUnavailable") {
        markTurnstileUnavailable();
      }
      if (turnstileRequired) {
        turnstileRef.current?.reset();
      }
      setShowManualAuthFallback(
        submissionError instanceof Error &&
          submissionError.message === "ANONYMOUS_AUTH_UNAVAILABLE",
      );
      setErrorKey(nextErrorKey);
      if (nextErrorKey === "codeUnavailable") {
        setErrorField("code");
        codeInputRef.current?.focus();
      }
    } finally {
      submissionInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form className="redeem-form" noValidate onSubmit={handleSubmit}>
      {pendingClaimReady ? (
        <div className="redeem-form__pending" role="status">
          <span>{copy.pendingEyebrow}</span>
          <strong>{copy.pendingTitle}</strong>
          <small>{copy.pendingDescription}</small>
        </div>
      ) : (
        <div className="redeem-form__field">
          <label htmlFor={codeId}>{copy.codeLabel}</label>
          <input
            aria-describedby={[
              codeHintId,
              wasScanned ? scannedStatusId : null,
              errorField === "code" && errorKey ? errorId : null,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-invalid={
              errorField === "code" && errorKey ? true : undefined
            }
            aria-label={copy.codeLabel}
            autoCapitalize="characters"
            autoComplete="off"
            disabled={!mounted}
            id={codeId}
            inputMode="text"
            maxLength={16}
            name="code"
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              setWasScanned(false);
              if (errorField === "code") {
                setErrorField(null);
                setErrorKey(null);
              }
            }}
            placeholder="BOWL7K2A"
            readOnly={isSubmitting}
            ref={codeInputRef}
            spellCheck={false}
            value={code}
          />
          <small className="redeem-form__hint" id={codeHintId}>
            {copy.codeHint}
          </small>
        </div>
      )}

      {wasScanned && !pendingClaimReady ? (
        <p
          className="redeem-form__scanned"
          id={scannedStatusId}
          role="status"
        >
          {copy.scannedStatus}
        </p>
      ) : null}

      {pendingClaimReady ? null : (
        <label className="redeem-form__consent" htmlFor={termsId}>
          <input
            aria-describedby={
              errorField === "terms" && errorKey ? errorId : undefined
            }
            aria-invalid={
              errorField === "terms" && errorKey ? true : undefined
            }
            checked={termsAccepted}
            disabled={!mounted || isSubmitting}
            id={termsId}
            name="termsAccepted"
            onChange={(event) => {
              setTermsAccepted(event.target.checked);
              if (errorField === "terms") {
                setErrorField(null);
                setErrorKey(null);
              }
            }}
            ref={termsInputRef}
            type="checkbox"
          />
          <span>
            {copy.consentPrefix}{" "}
            <Link
              href="/terms"
              rel="noopener noreferrer"
              target="_blank"
            >
              {copy.termsLabel}
            </Link>{" "}
            {copy.consentAnd}{" "}
            <Link
              href="/privacy"
              rel="noopener noreferrer"
              target="_blank"
            >
              {copy.privacyLabel}
            </Link>
            .{" "}
            <small className="redeem-form__new-tab">
              ({copy.opensInNewTab})
            </small>
          </span>
        </label>
      )}

      {!pendingClaimReady && turnstileRequired ? (
        turnstileSiteKey ? (
          <TurnstileWidget
            label={copy.verificationLabel}
            locale={locale}
            onError={markTurnstileUnavailable}
            onReady={() => {
              updateTurnstileStatus("ready");
              setErrorKey((current) =>
                current === "verificationRequired" ||
                current === "verificationUnavailable"
                  ? null
                  : current,
              );
            }}
            onTokenChange={handleTurnstileTokenChange}
            ref={turnstileRef}
            siteKey={turnstileSiteKey}
          />
        ) : (
          <p className="redeem-form__verification-unavailable" role="alert">
            {copy.errors.verificationUnavailable}
          </p>
        )
      ) : null}

      <button
        className="button button--primary button--medium redeem-form__submit"
        disabled={
          !mounted ||
          isSubmitting ||
          (turnstileNeeded && turnstileStatus !== "ready")
        }
        type="submit"
      >
        {isSubmitting
          ? pendingClaimReady
            ? copy.pendingSubmitting
            : copy.submitting
          : pendingClaimReady
            ? copy.pendingSubmit
            : copy.submit}
      </button>

      {errorMessage && errorField === "terms" && mounted
        ? createPortal(errorMessage, document.body)
        : errorMessage}
      {showManualAuthFallback ? (
        <p className="redeem-form__fallback">
          <Link href="/auth?next=/redeem&error=anonymous">
            {copy.fallbackSignIn}
          </Link>
        </p>
      ) : null}

      <p className="redeem-form__rule">
        {pendingClaimReady ? copy.pendingHint : copy.rule}
      </p>
    </form>
  );
}

export function RedeemPageContent({
  pendingClaimReady = false,
  turnstileRequired = false,
  turnstileSiteKey = null,
}: Readonly<{
  pendingClaimReady?: boolean;
  turnstileRequired?: boolean;
  turnstileSiteKey?: string | null;
}>) {
  const { locale } = useCampaignLanguage();
  const copy = redeemCopy[locale];

  return (
    <section className="redeem-page">
      <div className="redeem-page__inner container">
        <Link className="redeem-page__back" href="/offer">
          <ArrowLeft aria-hidden="true" />
          {copy.backToOffer}
        </Link>

        <div className="redeem-page__grid">
          <div className="redeem-card">
            <h1>{copy.title}</h1>
            <p>{copy.intro}</p>
            <RedeemForm
              pendingClaimReady={pendingClaimReady}
              turnstileRequired={turnstileRequired}
              turnstileSiteKey={turnstileSiteKey}
            />
          </div>

          <aside className="redeem-page__aside">
            <div
              aria-label={copy.preview.ariaLabel}
              className="redeem-receipt"
              role="img"
            >
              <strong>{copy.preview.title}</strong>
              <span>{copy.preview.privateSide}</span>
              <dl>
                <div>
                  <dt>{copy.preview.reward}</dt>
                  <dd>3,000 Credits</dd>
                </div>
                <div>
                  <dt>{copy.preview.cardCode}</dt>
                  <dd>A7K3B9Q2</dd>
                </div>
              </dl>
              <small>
                <Clock3 aria-hidden="true" />
                {copy.preview.example}
              </small>
            </div>
            <div className="redeem-next">
              <Laptop aria-hidden="true" />
              <h2>{copy.next.title}</h2>
              <p>{copy.next.description}</p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
