export const SHARE_CARD_HERO_PATH = "/media/malatang-hero.png";
export const SHARE_CARD_FILENAME = "ygf-bowl-to-build-check-in.svg";

export const SHARE_CARD_TASK_TYPES = [
  "study",
  "coding",
  "career",
  "pick-my-bowl",
] as const;

export type ShareCardTaskType = (typeof SHARE_CARD_TASK_TYPES)[number];

export interface ShareCardOptions {
  readonly firstTaskType?: ShareCardTaskType;
}

export const SHARE_CARD_COPY = Object.freeze({
  campaign: "YGF Bowl-to-Build",
  hashtag: "#一碗一算力",
  milestone: "Today’s bowl powered 3,000 AI Credits.",
  uscDisclaimer:
    "This promotion is not sponsored, endorsed by, or administered by USC.",
} as const);

const SHARE_CARD_TASK_LABELS: Readonly<
  Record<ShareCardTaskType, string>
> = Object.freeze({
  study: "Study",
  coding: "Coding",
  career: "Career",
  "pick-my-bowl": "Pick My Bowl",
});

function parseShareCardOptions(value: unknown): ShareCardOptions {
  if (value === undefined) {
    return {};
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error("SHARE_CARD_OPTIONS_INVALID");
  }

  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => key !== "firstTaskType")) {
    throw new Error("SHARE_CARD_OPTIONS_INVALID");
  }

  const firstTaskType = (value as { firstTaskType?: unknown })
    .firstTaskType;
  if (firstTaskType === undefined) {
    return {};
  }
  if (!isShareCardTaskType(firstTaskType)) {
    throw new Error("SHARE_CARD_TASK_TYPE_INVALID");
  }
  return { firstTaskType };
}

export function isShareCardTaskType(
  value: unknown,
): value is ShareCardTaskType {
  return (
    typeof value === "string" &&
    (SHARE_CARD_TASK_TYPES as readonly string[]).includes(value)
  );
}

export function getShareCardTaskLabel(taskType: ShareCardTaskType) {
  return SHARE_CARD_TASK_LABELS[taskType];
}

export function createShareCardSvg(
  options: ShareCardOptions = {},
): string {
  const { firstTaskType } = parseShareCardOptions(options);
  const taskLine = firstTaskType
    ? `<text x="540" y="1060" fill="#fff8f1" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="700" text-anchor="middle">First build: ${getShareCardTaskLabel(firstTaskType)}</text>`
    : "";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" role="img" aria-labelledby="share-card-title share-card-description">',
    `<title id="share-card-title">${SHARE_CARD_COPY.milestone}</title>`,
    `<desc id="share-card-description">${SHARE_CARD_COPY.campaign} public campaign check-in card.</desc>`,
    '<defs><linearGradient id="share-card-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="35%" stop-color="#1f2937" stop-opacity="0"/><stop offset="100%" stop-color="#1f2937" stop-opacity=".94"/></linearGradient></defs>',
    '<rect width="1080" height="1350" fill="#8b1e2d"/>',
    `<image href="${SHARE_CARD_HERO_PATH}" x="0" y="0" width="1080" height="850" preserveAspectRatio="xMidYMid slice"/>`,
    '<rect width="1080" height="940" fill="url(#share-card-shade)"/>',
    '<rect x="72" y="72" width="390" height="72" rx="36" fill="#fff8f1"/>',
    `<text x="267" y="119" fill="#8b1e2d" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="800" text-anchor="middle">${SHARE_CARD_COPY.campaign}</text>`,
    `<text x="540" y="930" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="46" font-weight="800" text-anchor="middle">${SHARE_CARD_COPY.milestone}</text>`,
    taskLine,
    `<text x="540" y="1155" fill="#f2b84b" font-family="Inter, Arial, sans-serif" font-size="48" font-weight="800" text-anchor="middle">${SHARE_CARD_COPY.hashtag}</text>`,
    `<text x="540" y="1265" fill="#fff8f1" font-family="Inter, Arial, sans-serif" font-size="22" text-anchor="middle">${SHARE_CARD_COPY.uscDisclaimer}</text>`,
    "</svg>",
  ].join("");
}
