export type BoundedBodyErrorCode =
  | "BODY_INVALID"
  | "BODY_TOO_LARGE";

export class BoundedBodyError extends Error {
  readonly code: BoundedBodyErrorCode;

  constructor(code: BoundedBodyErrorCode) {
    super(code);
    this.code = code;
    this.name = "BoundedBodyError";
  }
}

export async function readBoundedRequestText(
  request: Request,
  maximumBytes: number,
): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > maximumBytes
  ) {
    throw new BoundedBodyError("BODY_TOO_LARGE");
  }
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new BoundedBodyError("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new BoundedBodyError("BODY_INVALID");
  }
}
