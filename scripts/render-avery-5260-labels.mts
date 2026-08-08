import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// @ts-expect-error Node 22's type-stripping runtime requires the source extension.
import {
  AVERY_5260,
  AVERY_5260_SAMPLE_LABEL_COUNT,
  avery5260Sha256,
  createPublicAvery5260SampleRows,
  renderAvery5260Pdf,
  renderAvery5260SamplePng,
  serializeAvery5260LabelHtml,
  verifyPrivateAvery5260LabelsFromCsv,
  writePrivateAvery5260LabelsFromCsv,
} from "../lib/admin/avery-5260-labels.ts";

interface PrivateCliOptions {
  html: string;
  input: string;
  pdf: string;
  verifyOnly: boolean;
}

const USAGE = [
  "Usage:",
  "  render-avery-5260-labels.mts --input private/<batch>.csv --html private/<batch>.avery-5260.html --pdf private/<batch>.avery-5260.pdf",
  "  render-avery-5260-labels.mts --verify-only --input private/<batch>.csv --html private/<batch>.avery-5260.html --pdf private/<batch>.avery-5260.pdf",
  "  render-avery-5260-labels.mts --sample",
].join("\n");

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const publicImagePath = path.join(
  repositoryRoot,
  "output",
  "redemption-card",
  "ygf-avery-5260-label-sheet-sample.png",
);
const publicPdfPath = path.join(
  repositoryRoot,
  "output",
  "pdf",
  "ygf-avery-5260-label-sheet-sample.pdf",
);
const publicManifestPath = path.join(
  repositoryRoot,
  "output",
  "redemption-card",
  "avery-5260-label-manifest.json",
);

function parsePrivateOptions(
  arguments_: readonly string[],
): PrivateCliOptions {
  const values = new Map<string, string>();
  let verifyOnly = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const flag = arguments_[index];
    if (flag === "--verify-only") {
      if (verifyOnly) {
        throw new Error(USAGE);
      }
      verifyOnly = true;
      continue;
    }
    if (!flag || !["--input", "--html", "--pdf"].includes(flag)) {
      throw new Error(USAGE);
    }
    const value = arguments_[index + 1];
    if (!value || values.has(flag)) {
      throw new Error(USAGE);
    }
    values.set(flag, value);
    index += 1;
  }
  if (values.size !== 3) {
    throw new Error(USAGE);
  }
  return {
    html: values.get("--html") ?? "",
    input: values.get("--input") ?? "",
    pdf: values.get("--pdf") ?? "",
    verifyOnly,
  };
}

async function renderPublicSample(): Promise<void> {
  const rows = createPublicAvery5260SampleRows();
  const sourceCommitment = avery5260Sha256(
    `${JSON.stringify(rows)}\n`,
  );
  const html = serializeAvery5260LabelHtml(rows, {
    sampleOnly: true,
    sourceCommitment,
  });
  const [pdf, png] = await Promise.all([
    renderAvery5260Pdf(html),
    renderAvery5260SamplePng(html),
  ]);
  const manifest = {
    version: 1,
    renderer: "ygf-avery-5260-labels-v1",
    sampleOnly: true,
    productionCodesIncluded: false,
    productionCsvRead: false,
    thirdPartyUploadPerformed: false,
    labelCount: rows.length,
    sheetCount: 1,
    layout: {
      product: "Avery 5260",
      pageInches: [
        AVERY_5260.pageWidthInches,
        AVERY_5260.pageHeightInches,
      ],
      labelInches: [
        AVERY_5260.labelWidthInches,
        AVERY_5260.labelHeightInches,
      ],
      columns: AVERY_5260.columns,
      rows: AVERY_5260.rows,
      labelsPerSheet: AVERY_5260.labelsPerSheet,
      sideMarginInches: AVERY_5260.sideMarginInches,
      topMarginInches: AVERY_5260.topMarginInches,
      columnGapInches: AVERY_5260.columnGapInches,
    },
    fakeCodeContract: {
      pattern: "SAMPLE01 through SAMPLE30",
      eightCharacters: true,
      validProductionAlphabet: false,
      visibleSampleMarkerOnEveryLabel: true,
    },
    sourceCommitment,
    files: {
      "output/redemption-card/ygf-avery-5260-label-sheet-sample.png":
        avery5260Sha256(png),
      "output/pdf/ygf-avery-5260-label-sheet-sample.pdf":
        avery5260Sha256(pdf),
    },
  };

  await Promise.all([
    mkdir(path.dirname(publicImagePath), { recursive: true }),
    mkdir(path.dirname(publicPdfPath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(publicImagePath, png),
    writeFile(publicPdfPath, pdf),
    writeFile(
      publicManifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
    ),
  ]);
  process.stdout.write(
    `Rendered ${AVERY_5260_SAMPLE_LABEL_COUNT} fake-code Avery 5260 labels across 1 public proof sheet.\n`,
  );
}

async function runPrivate(
  options: PrivateCliOptions,
): Promise<void> {
  const operation = options.verifyOnly
    ? verifyPrivateAvery5260LabelsFromCsv
    : writePrivateAvery5260LabelsFromCsv;
  const result = await operation({
    html: options.html,
    input: options.input,
    pdf: options.pdf,
  });
  const verb = options.verifyOnly ? "Verified" : "Rendered";
  process.stdout.write(
    `${verb} ${result.labelCount}/500 Avery 5260 labels across ${result.sheetCount} sheets.\n`,
  );
  process.stdout.write(
    `HTML SHA-256 ${result.htmlSha256}\nPDF SHA-256 ${result.pdfSha256}\n`,
  );
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length === 1 && arguments_[0] === "--sample") {
    await renderPublicSample();
    return;
  }
  await runPrivate(parsePrivateOptions(arguments_));
}

main().catch((error: unknown) => {
  const safeMessages = new Set([
    "AVERY_5260_ROWS_INVALID",
    "AVERY_5260_SAMPLE_ROWS_INVALID",
    "AVERY_5260_SOURCE_COMMITMENT_INVALID",
    "PRIVATE_AVERY_ARTIFACT_INVALID",
    "PRIVATE_AVERY_CSV_CHANGED",
    "PRIVATE_AVERY_CSV_INVALID",
    "PRIVATE_AVERY_HTML_INVALID",
    "PRIVATE_AVERY_PATH_INVALID",
    "PRIVATE_AVERY_PDF_INVALID",
    "PRIVATE_AVERY_TEMP_UNAVAILABLE",
    USAGE,
  ]);
  let message = "AVERY_5260_RENDER_FAILED";
  if (
    error instanceof Error &&
    safeMessages.has(error.message)
  ) {
    message = error.message;
  } else if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  ) {
    message = "PRIVATE_AVERY_DESTINATION_EXISTS";
  }
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
