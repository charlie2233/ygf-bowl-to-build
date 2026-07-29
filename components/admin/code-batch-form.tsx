"use client";

import {
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { browserRandomUuid } from "@/lib/browser/uuid";

const ADMIN_BATCH_SOURCES = [
  "receipt-insert",
  "scratch-card",
  "counter-card",
  "poster",
  "creator",
  "staff",
  "soft-test",
] as const;
type AdminBatchSource = (typeof ADMIN_BATCH_SOURCES)[number];

const SOURCE_LABELS: Readonly<Record<AdminBatchSource, string>> = {
  "counter-card": "Counter card",
  creator: "Creator handout",
  poster: "Poster",
  "receipt-insert": "Receipt insert",
  "scratch-card": "Scratch card",
  "soft-test": "Soft test",
  staff: "Staff handout",
};

function downloadFilename(response: Response): string {
  const disposition =
    response.headers.get("content-disposition") ?? "";
  const match = /filename="([A-Za-z0-9._-]+)"/.exec(disposition);
  return match?.[1] ?? "ygf-private-codes.csv";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROW_REFERENCE_PATTERN =
  /^YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}$/;

function newRequestId(): string {
  const requestId = browserRandomUuid();
  if (!UUID_PATTERN.test(requestId)) {
    throw new Error("REQUEST_ID_UNAVAILABLE");
  }
  return requestId;
}

export function CodeBatchForm() {
  const [batchStatus, setBatchStatus] = useState<
    { kind: "error" | "success"; message: string } | undefined
  >();
  const [revokeStatus, setRevokeStatus] = useState<
    { kind: "error" | "success"; message: string } | undefined
  >();
  const [rewardStatus, setRewardStatus] = useState<
    { kind: "error" | "success"; message: string } | undefined
  >();
  const [rewardRevokeStatus, setRewardRevokeStatus] = useState<
    { kind: "error" | "success"; message: string } | undefined
  >();
  const [creating, setCreating] = useState(false);
  const [activating, setActivating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [assigningReward, setAssigningReward] = useState(false);
  const [revokingReward, setRevokingReward] = useState(false);
  const [fileSaved, setFileSaved] = useState(false);
  const [pendingBatch, setPendingBatch] = useState<
    { id: string; name: string } | undefined
  >();
  const batchFormRef = useRef<HTMLFormElement>(null);
  const activationRequestRef = useRef<
    { batchId: string; requestId: string } | undefined
  >(undefined);
  const revokeRequestRef = useRef<
    { requestId: string; rowReference: string } | undefined
  >(undefined);
  const rewardRequestRef = useRef<
    {
      expiresAt: string;
      requestId: string;
      rowReference: string;
    } | undefined
  >(undefined);

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBatchStatus(undefined);
    setCreating(true);
    const form = new FormData(formElement);
    const expiresAt = String(form.get("expiresAt") ?? "").trim();

    try {
      const payload = {
        count: Number(form.get("count")),
        ...(expiresAt
          ? { expiresAt: new Date(expiresAt).toISOString() }
          : {}),
        name: String(form.get("name") ?? ""),
        requestId: newRequestId(),
        source: String(form.get("source") ?? ""),
      };
      const response = await fetch("/api/admin/codes", {
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("BATCH_REQUEST_FAILED");
      }
      const batchId = (
        response.headers.get("x-ygf-batch-id") ?? ""
      ).toLowerCase();
      if (
        !UUID_PATTERN.test(batchId) ||
        response.headers.get("x-ygf-batch-status") !== "pending"
      ) {
        throw new Error("BATCH_RESPONSE_INVALID");
      }

      const csv = await response.blob();
      const downloadUrl = URL.createObjectURL(csv);
      const link = document.createElement("a");
      link.download = downloadFilename(response);
      link.href = downloadUrl;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      setPendingBatch({
        id: batchId,
        name: String(form.get("name") ?? "").trim(),
      });
      setFileSaved(false);
      activationRequestRef.current = undefined;
      setBatchStatus({
        kind: "success",
        message:
          "Private CSV download started. This batch is still pending and every claim remains unusable until you confirm the file is saved and activate it.",
      });
    } catch {
      setBatchStatus({
        kind: "error",
        message:
          "The batch was not delivered. No plaintext codes are available from this attempt.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function activateBatch() {
    if (!pendingBatch || !fileSaved) {
      return;
    }
    setBatchStatus(undefined);
    setActivating(true);
    try {
      if (
        activationRequestRef.current?.batchId !==
        pendingBatch.id
      ) {
        activationRequestRef.current = {
          batchId: pendingBatch.id,
          requestId: newRequestId(),
        };
      }
      const response = await fetch(
        `/api/admin/codes/${encodeURIComponent(pendingBatch.id)}/activate`,
        {
          body: JSON.stringify({
            requestId:
              activationRequestRef.current.requestId,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      if (!response.ok) {
        throw new Error("ACTIVATION_FAILED");
      }
      const result: unknown = await response.json();
      if (
        typeof result !== "object" ||
        result === null ||
        (result as { batchId?: unknown }).batchId !==
          pendingBatch.id ||
        (result as { status?: unknown }).status !== "active"
      ) {
        throw new Error("ACTIVATION_RESPONSE_INVALID");
      }
      const activatedName = pendingBatch.name;
      setPendingBatch(undefined);
      setFileSaved(false);
      activationRequestRef.current = undefined;
      batchFormRef.current?.reset();
      setBatchStatus({
        kind: "success",
        message: `${activatedName} is active. Its claim codes can now be redeemed.`,
      });
    } catch {
      setBatchStatus({
        kind: "error",
        message:
          "The batch is still pending. Confirm the saved file and retry activation; pending claims remain unusable.",
      });
    } finally {
      setActivating(false);
    }
  }

  async function revokeCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setRevokeStatus(undefined);
    const form = new FormData(formElement);
    const rowReference = String(
      form.get("rowReference") ?? "",
    )
      .trim()
      .toUpperCase();
    if (!ROW_REFERENCE_PATTERN.test(rowReference)) {
      setRevokeStatus({
        kind: "error",
        message:
          "Enter the complete row reference, for example YGF-ABCDEFGH-0001.",
      });
      return;
    }

    setRevoking(true);
    try {
      if (
        revokeRequestRef.current?.rowReference !==
        rowReference
      ) {
        revokeRequestRef.current = {
          requestId: newRequestId(),
          rowReference,
        };
      }
      const response = await fetch(
        `/api/admin/codes/${encodeURIComponent(rowReference)}/revoke`,
        {
          body: JSON.stringify({
            requestId: revokeRequestRef.current.requestId,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      if (!response.ok) {
        throw new Error("REVOCATION_FAILED");
      }
      setRevokeStatus({
        kind: "success",
        message: "The code is revoked and the operator audit is recorded.",
      });
      revokeRequestRef.current = undefined;
      formElement.reset();
    } catch {
      setRevokeStatus({
        kind: "error",
        message:
          "The code could not be revoked. Confirm the row reference and try again.",
      });
    } finally {
      setRevoking(false);
    }
  }

  async function assignClaudeGift(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setRewardStatus(undefined);
    const form = new FormData(formElement);
    const rowReference = String(
      form.get("rewardRowReference") ?? "",
    )
      .trim()
      .toUpperCase();
    const giftUrl = String(form.get("giftUrl") ?? "").trim();
    const localExpiry = String(
      form.get("giftExpiresAt") ?? "",
    ).trim();
    const expiry = new Date(localExpiry);
    if (
      !ROW_REFERENCE_PATTERN.test(rowReference) ||
      !giftUrl ||
      !Number.isFinite(expiry.getTime())
    ) {
      setRewardStatus({
        kind: "error",
        message:
          "Enter a complete row reference, an official claude.ai/gift link, and its real expiration.",
      });
      return;
    }
    const expiresAt = expiry.toISOString();

    setAssigningReward(true);
    try {
      if (
        rewardRequestRef.current?.rowReference !== rowReference ||
        rewardRequestRef.current.expiresAt !== expiresAt
      ) {
        rewardRequestRef.current = {
          expiresAt,
          requestId: newRequestId(),
          rowReference,
        };
      }
      const response = await fetch(
        "/api/admin/rewards/claude-pro",
        {
          body: JSON.stringify({
            expiresAt,
            giftUrl,
            requestId: rewardRequestRef.current.requestId,
            rowReference,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      if (!response.ok) {
        throw new Error("CLAUDE_GIFT_ASSIGNMENT_FAILED");
      }
      const result: unknown = await response.json();
      if (
        typeof result !== "object" ||
        result === null ||
        (result as { rowReference?: unknown }).rowReference !==
          rowReference ||
        (result as { status?: unknown }).status !== "assigned"
      ) {
        throw new Error("CLAUDE_GIFT_ASSIGNMENT_RESPONSE_INVALID");
      }
      setRewardStatus({
        kind: "success",
        message:
          `The encrypted Claude gift is bound to ${rowReference}. The public CSV, QR, and analytics still contain no gift link.`,
      });
      rewardRequestRef.current = undefined;
      formElement.reset();
    } catch {
      setRewardStatus({
        kind: "error",
        message:
          "The gift was not assigned. Confirm the row is unused, the URL is an official Claude gift link, the expiry is within 366 days, and the server encryption key is configured.",
      });
    } finally {
      setAssigningReward(false);
    }
  }

  async function revokeClaudeGift(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setRewardRevokeStatus(undefined);
    const rowReference = String(
      new FormData(formElement).get("rewardRevokeRowReference") ??
        "",
    )
      .trim()
      .toUpperCase();
    if (!ROW_REFERENCE_PATTERN.test(rowReference)) {
      setRewardRevokeStatus({
        kind: "error",
        message:
          "Enter the complete row reference, for example YGF-ABCDEFGH-0001.",
      });
      return;
    }

    setRevokingReward(true);
    try {
      const response = await fetch(
        "/api/admin/rewards/claude-pro/revoke",
        {
          body: JSON.stringify({ rowReference }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      if (!response.ok) {
        throw new Error("CLAUDE_GIFT_REVOCATION_FAILED");
      }
      const result: unknown = await response.json();
      if (
        typeof result !== "object" ||
        result === null ||
        (result as { rowReference?: unknown }).rowReference !==
          rowReference ||
        !["revoked", "expired"].includes(
          String((result as { status?: unknown }).status),
        )
      ) {
        throw new Error("CLAUDE_GIFT_REVOCATION_RESPONSE_INVALID");
      }
      const status = (result as { status: "expired" | "revoked" })
        .status;
      setRewardRevokeStatus({
        kind: "success",
        message:
          status === "revoked"
            ? `The YGF gift for ${rowReference} is revoked for future opens.`
            : `The YGF gift for ${rowReference} was already expired and remains closed.`,
      });
      formElement.reset();
    } catch {
      setRewardRevokeStatus({
        kind: "error",
        message:
          "The gift could not be revoked. Confirm the row reference and try again.",
      });
    } finally {
      setRevokingReward(false);
    }
  }

  return (
    <div className="admin-code-tools">
      <form
        className="admin-form"
        onSubmit={createBatch}
        ref={batchFormRef}
      >
        <div>
          <h2>Create a private code batch</h2>
          <p>
            Only SHA-256 digests are stored. Plaintext appears once in
            the downloaded CSV and cannot be recovered later.
          </p>
        </div>

        <label>
          Batch name
          <input
            autoComplete="off"
            maxLength={120}
            name="name"
            required
            type="text"
          />
        </label>
        <div className="admin-form__row">
          <label>
            Number of codes
            <input
              defaultValue={300}
              inputMode="numeric"
              max={3000}
              min={1}
              name="count"
              required
              step={1}
              type="number"
            />
          </label>
          <label>
            Distribution source
            <select defaultValue="receipt-insert" name="source">
              {ADMIN_BATCH_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {SOURCE_LABELS[source]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Expiration (optional)
          <input name="expiresAt" type="datetime-local" />
        </label>

        <Button
          disabled={creating || pendingBatch !== undefined}
          type="submit"
        >
          {creating ? "Creating private CSV…" : "Create and download CSV"}
        </Button>
        <fieldset disabled={!pendingBatch || activating}>
          <legend>Activate the saved batch</legend>
          <label>
            <input
              checked={fileSaved}
              onChange={(event) =>
                setFileSaved(event.currentTarget.checked)
              }
              type="checkbox"
            />
            I confirm the private CSV is saved in approved storage.
          </label>
          <Button
            disabled={!pendingBatch || !fileSaved || activating}
            onClick={activateBatch}
            type="button"
            variant="secondary"
          >
            {activating
              ? "Activating saved batch…"
              : "Activate saved batch"}
          </Button>
          <p>
            Pending batches cannot be redeemed. Activation records one
            distribution audit only after this confirmation.
          </p>
        </fieldset>
        {batchStatus ? (
          <p
            className={`admin-form__status admin-form__status--${batchStatus.kind}`}
            role={batchStatus.kind === "error" ? "alert" : "status"}
          >
            {batchStatus.message}
          </p>
        ) : null}
      </form>

      <form className="admin-form" onSubmit={assignClaudeGift}>
        <div>
          <h2>Attach one Claude Pro gift</h2>
          <p>
            First purchase an official shareable gift at{" "}
            <a
              href="https://claude.ai/gift"
              rel="noreferrer"
              target="_blank"
            >
              claude.ai/gift
            </a>
            . Bind each gift link to exactly one unused private row.
            The recipient still receives the normal 3,000 YGF Credits.
          </p>
        </div>
        <label>
          Gift assignment row reference
          <input
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={17}
            minLength={17}
            name="rewardRowReference"
            pattern="YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}"
            placeholder="YGF-ABCDEFGH-0001"
            required
            spellCheck={false}
            type="text"
          />
        </label>
        <label>
          Official Claude gift link
          <input
            autoComplete="off"
            maxLength={2048}
            name="giftUrl"
            placeholder="https://claude.ai/gift/redeem?gift=<value>"
            required
            spellCheck={false}
            type="url"
          />
        </label>
        <label>
          Gift expiration
          <input
            name="giftExpiresAt"
            required
            type="datetime-local"
          />
        </label>
        <Button disabled={assigningReward} type="submit">
          {assigningReward
            ? "Encrypting and assigning…"
            : "Attach Claude gift"}
        </Button>
        <p>
          This only supports prepaid official gift links. It does not
          create an Anthropic partnership, referral contest entry, or
          shared Claude account.
        </p>
        {rewardStatus ? (
          <p
            className={`admin-form__status admin-form__status--${rewardStatus.kind}`}
            role={rewardStatus.kind === "error" ? "alert" : "status"}
          >
            {rewardStatus.message}
          </p>
        ) : null}
      </form>

      <form className="admin-form" onSubmit={revokeClaudeGift}>
        <div>
          <h2>Revoke one Claude Pro gift</h2>
          <p>
            Use the non-secret row reference from the private operations
            file. Revocation prevents future YGF opens, but cannot retract
            a bearer link that was already opened or provider-redeemed.
          </p>
        </div>
        <label>
          Gift row reference
          <input
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={17}
            minLength={17}
            name="rewardRevokeRowReference"
            pattern="YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}"
            placeholder="YGF-ABCDEFGH-0001"
            required
            spellCheck={false}
            type="text"
          />
        </label>
        <Button
          disabled={revokingReward}
          type="submit"
          variant="secondary"
        >
          {revokingReward ? "Revoking gift…" : "Revoke Claude gift"}
        </Button>
        {rewardRevokeStatus ? (
          <p
            className={`admin-form__status admin-form__status--${rewardRevokeStatus.kind}`}
            role={
              rewardRevokeStatus.kind === "error"
                ? "alert"
                : "status"
            }
          >
            {rewardRevokeStatus.message}
          </p>
        ) : null}
      </form>

      <form className="admin-form" onSubmit={revokeCode}>
        <div>
          <h2>Revoke one code</h2>
          <p>
            Use the non-secret row reference printed in the private
            operations file. Never paste a claim code or digest here.
          </p>
        </div>
        <label>
          Code row reference
          <input
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={17}
            minLength={17}
            name="rowReference"
            pattern="YGF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[0-9]{4}"
            placeholder="YGF-ABCDEFGH-0001"
            required
            spellCheck={false}
            type="text"
          />
        </label>
        <Button
          disabled={revoking}
          type="submit"
          variant="secondary"
        >
          {revoking ? "Revoking…" : "Revoke code"}
        </Button>
        {revokeStatus ? (
          <p
            className={`admin-form__status admin-form__status--${revokeStatus.kind}`}
            role={revokeStatus.kind === "error" ? "alert" : "status"}
          >
            {revokeStatus.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
