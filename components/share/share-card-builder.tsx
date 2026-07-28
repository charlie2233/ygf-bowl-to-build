"use client";

import Image from "next/image";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  createShareCardSvg,
  getShareCardTaskLabel,
  isShareCardTaskType,
  SHARE_CARD_COPY,
  SHARE_CARD_FILENAME,
  SHARE_CARD_HERO_PATH,
  SHARE_CARD_TASK_TYPES,
  type ShareCardTaskType,
} from "@/lib/share/card";

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(reader.error));
    reader.addEventListener("load", () => {
      if (
        typeof reader.result !== "string" ||
        !reader.result.startsWith("data:image/png;base64,")
      ) {
        reject(new Error("SHARE_CARD_HERO_INVALID"));
        return;
      }
      resolve(reader.result);
    });
    reader.readAsDataURL(blob);
  });
}

async function createStandaloneShareCard(
  firstTaskType?: ShareCardTaskType,
) {
  const response = await fetch(SHARE_CARD_HERO_PATH, {
    cache: "force-cache",
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error("SHARE_CARD_HERO_UNAVAILABLE");
  }

  const hero = await readBlobAsDataUrl(await response.blob());
  const svg = createShareCardSvg({ firstTaskType });
  const standaloneSvg = svg.replace(
    `href="${SHARE_CARD_HERO_PATH}"`,
    `href="${hero}"`,
  );
  if (standaloneSvg === svg) {
    throw new Error("SHARE_CARD_HERO_MISSING");
  }
  return standaloneSvg;
}

function downloadSvg(svg: string) {
  const objectUrl = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.download = SHARE_CARD_FILENAME;
  link.href = objectUrl;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function recordShareCardGeneration(
  firstTaskType?: ShareCardTaskType,
) {
  void fetch("/api/share-card", {
    body: JSON.stringify({
      ...(firstTaskType ? { taskType: firstTaskType } : {}),
    }),
    cache: "no-store",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => undefined);
}

export function ShareCardBuilder() {
  const selectId = useId();
  const statusId = useId();
  const [firstTaskType, setFirstTaskType] = useState<
    "" | ShareCardTaskType
  >("");
  const [isPreparing, setIsPreparing] = useState(false);
  const [status, setStatus] = useState("");
  const taskLabel = firstTaskType
    ? getShareCardTaskLabel(firstTaskType)
    : undefined;
  const previewLabel = [
    SHARE_CARD_COPY.campaign,
    SHARE_CARD_COPY.milestone,
    taskLabel ? `First build: ${taskLabel}.` : undefined,
    SHARE_CARD_COPY.hashtag,
    SHARE_CARD_COPY.uscDisclaimer,
  ]
    .filter(Boolean)
    .join(" ");

  async function handleDownload() {
    if (isPreparing) {
      return;
    }
    setIsPreparing(true);
    setStatus("Preparing your SVG card…");
    try {
      const svg = await createStandaloneShareCard(
        firstTaskType || undefined,
      );
      downloadSvg(svg);
      recordShareCardGeneration(firstTaskType || undefined);
      setStatus("Your SVG card downloaded.");
    } catch {
      setStatus("We couldn’t prepare the card. Please try again.");
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <div className="share-builder">
      <div
        aria-label={previewLabel}
        className="share-card-preview"
        role="img"
      >
        <Image
          alt=""
          aria-hidden="true"
          className="share-card-preview__image"
          height={1_350}
          priority
          src={SHARE_CARD_HERO_PATH}
          width={1_080}
        />
        <div className="share-card-preview__shade" />
        <div className="share-card-preview__campaign">
          {SHARE_CARD_COPY.campaign}
        </div>
        <div className="share-card-preview__copy">
          <p>{SHARE_CARD_COPY.milestone}</p>
          {taskLabel ? <p>First build: {taskLabel}</p> : null}
          <strong>{SHARE_CARD_COPY.hashtag}</strong>
          <small>{SHARE_CARD_COPY.uscDisclaimer}</small>
        </div>
      </div>

      <div className="share-builder__controls">
        <div>
          <label htmlFor={selectId}>First task (optional)</label>
          <select
            id={selectId}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === "" || isShareCardTaskType(value)) {
                setFirstTaskType(value);
                setStatus("");
              }
            }}
            value={firstTaskType}
          >
            <option value="">No task selected</option>
            {SHARE_CARD_TASK_TYPES.map((taskType) => (
              <option key={taskType} value={taskType}>
                {getShareCardTaskLabel(taskType)}
              </option>
            ))}
          </select>
        </div>

        <p>
          Your card uses only the public campaign milestone and your
          optional first task. Nothing is posted automatically.
        </p>

        <Button
          aria-describedby={statusId}
          disabled={isPreparing}
          onClick={handleDownload}
        >
          {isPreparing ? "Preparing SVG…" : "Download SVG card"}
        </Button>
        <p
          aria-live="polite"
          className="share-builder__status"
          id={statusId}
          role="status"
        >
          {status}
        </p>
      </div>
    </div>
  );
}
