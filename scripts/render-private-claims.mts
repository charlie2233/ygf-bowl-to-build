interface CliOptions {
  input: string;
  out: string;
}

interface PrintModule {
  writePrivateClaimSheetFromCsv(options: CliOptions): Promise<{
    destination: string;
    rowCount: number;
    source: string;
  }>;
}

const USAGE =
  "Usage: render-private-claims.mts --input private/<admin-download>.csv --out private/<print-sheet>.html";

function parseCliArguments(
  arguments_: readonly string[],
): CliOptions {
  const values = new Map<string, string>();
  for (
    let index = 0;
    index < arguments_.length;
    index += 2
  ) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (
      !flag ||
      !["--input", "--out"].includes(flag) ||
      value === undefined ||
      values.has(flag)
    ) {
      throw new Error(USAGE);
    }
    values.set(flag, value);
  }
  if (values.size !== 2) {
    throw new Error(USAGE);
  }
  return {
    input: values.get("--input") ?? "",
    out: values.get("--out") ?? "",
  };
}

async function runCli(): Promise<void> {
  const options = parseCliArguments(process.argv.slice(2));
  const moduleUrl = new URL(
    "../lib/admin/code-generator.ts",
    import.meta.url,
  );
  const printer = (await import(
    moduleUrl.href
  )) as PrintModule;
  const result =
    await printer.writePrivateClaimSheetFromCsv(options);
  process.stdout.write(
    `Rendered ${result.rowCount} private claim rows.\n`,
  );
}

runCli().catch((error: unknown) => {
  const safeMessages = new Set([
    "PRIVATE_CSV_INVALID",
    "PRIVATE_OUTPUT_REQUIRED",
    "PRIVATE_PRINT_TEMP_UNAVAILABLE",
    USAGE,
  ]);
  let message = "PRIVATE_PRINT_FAILED";
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
    message = "PRIVATE_PRINT_DESTINATION_EXISTS";
  }
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
