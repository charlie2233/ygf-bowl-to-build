"use client";

import Image from "next/image";
import { useId, useState } from "react";

import { useCampaignLanguage } from "@/components/campaign-language";
import { Button } from "@/components/ui/button";
import { customerPagesCopy } from "@/lib/i18n/customer-pages";
import {
  createShareCardSvg,
  getShareCardTaskLabel,
  SHARE_CARD_COPY,
  SHARE_CARD_FILENAME,
  SHARE_CARD_HERO_PATH,
  type ShareCardTaskType,
} from "@/lib/share/card";

type LocalizedShareCardCopy =
  (typeof customerPagesCopy)["en"]["share"]["card"];
type ShareCardStatus = "downloaded" | "error" | "preparingStatus" | null;

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

function escapeXml(value: string) {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({
        "&": "&amp;",
        "'": "&apos;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

function replaceSvgLiteral(
  svg: string,
  literal: string,
  replacement: string,
) {
  if (!svg.includes(literal)) {
    throw new Error("SHARE_CARD_COPY_MISSING");
  }
  return svg.split(literal).join(escapeXml(replacement));
}

function localizeShareCardSvg(
  svg: string,
  copy: LocalizedShareCardCopy,
  firstTaskType?: ShareCardTaskType,
) {
  let localized = replaceSvgLiteral(
    svg,
    `${SHARE_CARD_COPY.campaign} public campaign check-in card.`,
    copy.description,
  );
  if (firstTaskType) {
    localized = replaceSvgLiteral(
      localized,
      `First build: ${getShareCardTaskLabel(firstTaskType)}`,
      copy.firstBuild(copy.taskLabels[firstTaskType]),
    );
  }
  localized = replaceSvgLiteral(
    localized,
    SHARE_CARD_COPY.milestone,
    copy.milestone,
  );
  localized = replaceSvgLiteral(
    localized,
    SHARE_CARD_COPY.hashtag,
    copy.hashtag,
  );
  localized = replaceSvgLiteral(
    localized,
    SHARE_CARD_COPY.uscDisclaimer,
    copy.uscDisclaimer,
  );
  return replaceSvgLiteral(
    localized,
    SHARE_CARD_COPY.campaign,
    copy.campaign,
  );
}

async function createStandaloneShareCard(
  copy: LocalizedShareCardCopy,
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
  const svg = localizeShareCardSvg(
    createShareCardSvg({ firstTaskType }),
    copy,
    firstTaskType,
  );
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

function recordShareCardGeneration() {
  void fetch("/api/share-card", {
    body: "{}",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => undefined);
}

export function ShareCardBuilder({
  firstTaskType,
}: {
  firstTaskType?: ShareCardTaskType;
}) {
  const { locale } = useCampaignLanguage();
  const copy = customerPagesCopy[locale].share;
  const statusId = useId();
  const [isPreparing, setIsPreparing] = useState(false);
  const [status, setStatus] = useState<ShareCardStatus>(null);
  const taskLabel = firstTaskType
    ? copy.card.taskLabels[firstTaskType]
    : undefined;
  const previewLabel = [
    copy.card.campaign,
    copy.card.milestone,
    taskLabel ? `${copy.card.firstBuild(taskLabel)}.` : undefined,
    copy.card.hashtag,
    copy.card.uscDisclaimer,
  ]
    .filter(Boolean)
    .join(" ");

  async function handleDownload() {
    if (isPreparing) {
      return;
    }
    setIsPreparing(true);
    setStatus("preparingStatus");
    try {
      const svg = await createStandaloneShareCard(
        copy.card,
        firstTaskType,
      );
      downloadSvg(svg);
      recordShareCardGeneration();
      setStatus("downloaded");
    } catch {
      setStatus("error");
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
          {copy.card.campaign}
        </div>
        <div className="share-card-preview__copy">
          <p>{copy.card.milestone}</p>
          {taskLabel ? <p>{copy.card.firstBuild(taskLabel)}</p> : null}
          <strong>{copy.card.hashtag}</strong>
          <small>{copy.card.uscDisclaimer}</small>
        </div>
      </div>

      <div className="share-builder__controls">
        <p>{copy.controls.description(Boolean(taskLabel))}</p>

        <Button
          aria-describedby={statusId}
          disabled={isPreparing}
          onClick={handleDownload}
        >
          {isPreparing
            ? copy.controls.preparing
            : copy.controls.download}
        </Button>
        <p
          aria-live="polite"
          className="share-builder__status"
          id={statusId}
          role="status"
        >
          {status ? copy.controls[status] : ""}
        </p>
      </div>
    </div>
  );
}
