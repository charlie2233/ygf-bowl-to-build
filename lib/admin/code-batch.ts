import { randomInt } from "node:crypto";

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;
const MAX_CODES = 3_000;
const ROW_REFERENCE_PREFIX = "YGF";
const ROW_REFERENCE_BATCH_LENGTH = 8;
const ROW_REFERENCE_PATTERN =
  /^YGF-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8})-([0-9]{4})$/;

export type RandomIndex = (maximumExclusive: number) => number;

export interface PrivateClaimRow {
  claimUrl: string;
  code: string;
  rowReference: string;
}

function defaultRandomIndex(maximumExclusive: number): number {
  return randomInt(0, maximumExclusive);
}

function validateCount(count: number): void {
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > MAX_CODES
  ) {
    throw new Error("CODE_COUNT_INVALID");
  }
}

function generateAlphabetValue(
  length: number,
  randomIndex: RandomIndex,
): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    const alphabetIndex = randomIndex(
      CODE_ALPHABET.length,
    );
    if (
      !Number.isSafeInteger(alphabetIndex) ||
      alphabetIndex < 0 ||
      alphabetIndex >= CODE_ALPHABET.length
    ) {
      throw new Error("RANDOM_SOURCE_INVALID");
    }
    value += CODE_ALPHABET[alphabetIndex];
  }
  return value;
}

export function generateUniqueCodes(
  count: number,
  randomIndex: RandomIndex = defaultRandomIndex,
): readonly string[] {
  validateCount(count);
  const codes = new Set<string>();
  const maximumAttempts = Math.max(1_000, count * 100);
  let attempts = 0;

  while (codes.size < count && attempts < maximumAttempts) {
    codes.add(generateAlphabetValue(CODE_LENGTH, randomIndex));
    attempts += 1;
  }
  if (codes.size !== count) {
    throw new Error("UNIQUE_CODE_GENERATION_FAILED");
  }
  return [...codes];
}

export function generatePrivateRowReferences(
  count: number,
  randomIndex: RandomIndex = defaultRandomIndex,
): readonly string[] {
  validateCount(count);
  const batchReference = generateAlphabetValue(
    ROW_REFERENCE_BATCH_LENGTH,
    randomIndex,
  );
  return Array.from(
    { length: count },
    (_, index) =>
      `${ROW_REFERENCE_PREFIX}-${batchReference}-${String(index + 1).padStart(4, "0")}`,
  );
}

function validateOrigin(origin: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error("PUBLIC_ORIGIN_INVALID");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error("PUBLIC_ORIGIN_INVALID");
  }
  return parsed;
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildPrivateClaimRows(
  codes: readonly string[],
  origin: string,
  rowReferences: readonly string[],
): readonly PrivateClaimRow[] {
  if (
    codes.length < 1 ||
    codes.length > MAX_CODES ||
    rowReferences.length !== codes.length ||
    new Set(codes).size !== codes.length ||
    new Set(rowReferences).size !== rowReferences.length
  ) {
    throw new Error("PRIVATE_CODE_ROWS_INVALID");
  }
  const firstReference = ROW_REFERENCE_PATTERN.exec(
    rowReferences[0] ?? "",
  );
  if (!firstReference) {
    throw new Error("PRIVATE_ROW_REFERENCE_INVALID");
  }
  const batchReference = firstReference[1];
  const parsedOrigin = validateOrigin(origin);
  return codes.map((code, index) => {
    if (
      code.length !== CODE_LENGTH ||
      [...code].some(
        (character) => !CODE_ALPHABET.includes(character),
      )
    ) {
      throw new Error("GENERATED_CODE_INVALID");
    }
    const rowReference = rowReferences[index];
    const referenceParts =
      typeof rowReference === "string"
        ? ROW_REFERENCE_PATTERN.exec(rowReference)
        : null;
    if (
      !referenceParts ||
      referenceParts[1] !== batchReference ||
      Number(referenceParts[2]) !== index + 1
    ) {
      throw new Error("PRIVATE_ROW_REFERENCE_INVALID");
    }
    const claimUrl = new URL("/redeem", parsedOrigin);
    claimUrl.hash = `code=${code}`;
    return {
      claimUrl: claimUrl.toString(),
      code,
      rowReference,
    };
  });
}

export function serializePrivateCodeCsv(
  codes: readonly string[],
  origin: string,
  rowReferences: readonly string[],
): string {
  const rows = buildPrivateClaimRows(
    codes,
    origin,
    rowReferences,
  );
  return [
    "row_reference,code,claim_url",
    ...rows.map(
      (row) =>
        `${csvCell(row.rowReference)},${csvCell(row.code)},${csvCell(row.claimUrl)}`,
    ),
    "",
  ].join("\n");
}
