"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useState,
  type FormEvent,
} from "react";

import { parseClaimFragment } from "@/lib/campaign/claim-url";

export interface RedeemFormSubmission {
  code: string;
  termsAccepted: true;
}

export interface RedeemFormProps {
  confirmPendingClaim?: () => Promise<void>;
  pendingClaimReady?: boolean;
  submitClaim?: (submission: RedeemFormSubmission) => Promise<void>;
}

async function defaultConfirmPendingClaim() {
  const redemption = await fetch("/api/redeem", {
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!redemption.ok) {
    const body = (await redemption.json()) as { error?: string };
    const destination = redemptionErrorDestination(body.error);
    if (destination) {
      window.location.assign(destination);
      return;
    }
    throw new Error("REDEMPTION_UNAVAILABLE");
  }
  window.location.assign("/redeem/success");
}

async function defaultSubmitClaim(submission: RedeemFormSubmission) {
  const validation = await fetch("/api/code/validate", {
    body: JSON.stringify(submission),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const validationBody = (await validation.json()) as {
    eligible?: boolean;
    next?: string;
  };

  if (validation.status === 429) {
    throw new Error("VALIDATION_THROTTLED");
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

  await defaultConfirmPendingClaim();
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

function userFacingError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "CODE_INVALID") {
      return "That code is invalid or unavailable. Check it and try again.";
    }
    if (error.message === "VALIDATION_THROTTLED") {
      return "Too many checks were made. Wait a few minutes, then try again.";
    }
    if (
      error.message === "SERVICE_UNAVAILABLE" ||
      error.message === "REDEMPTION_UNAVAILABLE"
    ) {
      return "Claims are temporarily unavailable. Your saved claim is safe—try again shortly.";
    }
  }
  return "We couldn’t complete the claim. Please try again.";
}

export function RedeemForm({
  confirmPendingClaim = defaultConfirmPendingClaim,
  pendingClaimReady = false,
  submitClaim = defaultSubmitClaim,
}: RedeemFormProps) {
  const codeId = useId();
  const termsId = useId();
  const [code, setCode] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    function consumeClaimFragment() {
      const fragment = window.location.hash;
      if (!fragment) {
        return;
      }
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );

      try {
        const parsedCode = parseClaimFragment(fragment);
        queueMicrotask(() => {
          if (active) {
            setCode(parsedCode);
          }
        });
      } catch {
        queueMicrotask(() => {
          if (active) {
            setError(
              "That receipt QR is not valid. Enter the printed code instead.",
            );
          }
        });
      }
    }

    consumeClaimFragment();
    window.addEventListener("hashchange", consumeClaimFragment);

    return () => {
      active = false;
      window.removeEventListener("hashchange", consumeClaimFragment);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (pendingClaimReady) {
      setIsSubmitting(true);
      try {
        await confirmPendingClaim();
      } catch (submissionError) {
        setError(userFacingError(submissionError));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!termsAccepted) {
      setError("Agree to the promotional terms and privacy notice.");
      return;
    }
    if (!code) {
      setError("Enter the 8-character receipt code.");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitClaim({
        code,
        termsAccepted: true,
      });
    } catch (submissionError) {
      setError(userFacingError(submissionError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="redeem-form" noValidate onSubmit={handleSubmit}>
      {pendingClaimReady ? (
        <div className="redeem-form__pending" role="status">
          <span>Receipt claim secured</span>
          <strong>Ready to add your Build Credits</strong>
          <small>
            Your code stayed in a short-lived secure cookie during sign-in.
          </small>
        </div>
      ) : (
        <div className="redeem-form__field">
          <label htmlFor={codeId}>Receipt code</label>
          <input
            aria-label="Receipt code"
            autoCapitalize="characters"
            autoComplete="off"
            id={codeId}
            inputMode="text"
            maxLength={16}
            name="code"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="BOWL7K2A"
            spellCheck={false}
            value={code}
          />
        </div>
      )}

      <button
        className="button button--primary button--medium redeem-form__submit"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting
          ? pendingClaimReady
            ? "Adding credits…"
            : "Checking…"
          : pendingClaimReady
            ? "Confirm and add credits"
            : "Continue"}
      </button>

      <p aria-live="polite" className="redeem-form__message">
        {error ??
          (pendingClaimReady
            ? "One confirmation finishes your claim."
            : "Invalid, used, or expired codes will show an error here.")}
      </p>

      <p className="redeem-form__rule">
        One redemption per person. Credits expire 14 days after redemption.
      </p>

      {pendingClaimReady ? null : (
        <label className="redeem-form__consent" htmlFor={termsId}>
          <input
            checked={termsAccepted}
            id={termsId}
            name="termsAccepted"
            onChange={(event) => setTermsAccepted(event.target.checked)}
            type="checkbox"
          />
          <span>
            I agree to the <Link href="/terms">promotional terms</Link> and{" "}
            <Link href="/privacy">privacy notice</Link>.
          </span>
        </label>
      )}
    </form>
  );
}
