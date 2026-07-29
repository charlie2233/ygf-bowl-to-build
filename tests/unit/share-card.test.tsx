import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SharePageContent } from "@/app/share/page";
import { ShareCardBuilder } from "@/components/share/share-card-builder";
import {
  createShareCardSvg,
  getShareCardTaskLabel,
  SHARE_CARD_FILENAME,
  SHARE_CARD_HERO_PATH,
  SHARE_CARD_TASK_TYPES,
} from "@/lib/share/card";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function readBlobAsText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(reader.error));
    reader.addEventListener("load", () =>
      resolve(typeof reader.result === "string" ? reader.result : ""),
    );
    reader.readAsText(blob);
  });
}

describe("safe share card", () => {
  let container: HTMLDivElement;
  let createObjectUrlDescriptor: PropertyDescriptor | undefined;
  let root: Root;
  let revokeObjectUrlDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
      URL,
      "createObjectURL",
    );
    revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
      URL,
      "revokeObjectURL",
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    if (createObjectUrlDescriptor) {
      Object.defineProperty(
        URL,
        "createObjectURL",
        createObjectUrlDescriptor,
      );
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (revokeObjectUrlDescriptor) {
      Object.defineProperty(
        URL,
        "revokeObjectURL",
        revokeObjectUrlDescriptor,
      );
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders only the fixed public campaign content by default", () => {
    const svg = createShareCardSvg();

    expect(svg).toContain("YGF Bowl-to-Build");
    expect(svg).toContain("Today’s bowl powered 3,000 AI Credits.");
    expect(svg).toContain("#一碗一算力");
    expect(svg).toContain(SHARE_CARD_HERO_PATH);
    expect(svg).not.toMatch(
      /\b(email|user ID|claim|code|private QR|API key|remaining balance)\b/i,
    );
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<foreignObject");
  });

  it.each(SHARE_CARD_TASK_TYPES)(
    "renders the fixed label for allowlisted task %s",
    (taskType) => {
      const svg = createShareCardSvg({ firstTaskType: taskType });

      expect(svg).toContain(`First build: ${getShareCardTaskLabel(taskType)}`);
    },
  );

  it("rejects invalid task values and every unknown option key", () => {
    expect(() =>
      createShareCardSvg({
        firstTaskType: "email",
      } as never),
    ).toThrow("SHARE_CARD_TASK_TYPE_INVALID");
    expect(() =>
      createShareCardSvg({
        email: "private@example.com",
      } as never),
    ).toThrow("SHARE_CARD_OPTIONS_INVALID");
    expect(() =>
      createShareCardSvg({
        apiKey: "ygf_private",
        firstTaskType: "study",
      } as never),
    ).toThrow("SHARE_CARD_OPTIONS_INVALID");
  });

  it("presents one page heading and makes automatic posting explicitly absent", async () => {
    await act(async () => {
      root.render(<SharePageContent firstTaskType="study" />);
    });

    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("Create your check-in card");
    expect(container.textContent).toContain(
      "Nothing is posted automatically.",
    );
    expect(container.querySelector('button[type="button"]')?.textContent).toBe(
      "Download SVG card",
    );
    expect(
      container.querySelector('[role="img"]')?.getAttribute("aria-label"),
    ).toContain("Today’s bowl powered 3,000 AI Credits.");
    expect(container.textContent).toContain("First build: Study");
    expect(container.querySelector("select")).toBeNull();
  });

  it("waits for an explicit accessible download action", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === SHARE_CARD_HERO_PATH
        ? ({
            blob: async () =>
              new Blob(["png"], { type: "image/png" }),
            ok: true,
          } as Response)
        : new Response(null, { status: 204 }),
    );
    const createObjectURL = vi.fn<(blob: Blob) => string>(
      () => "blob:share-card",
    );
    const revokeObjectURL = vi.fn<(url: string) => void>();
    let clickedDownload:
      | Readonly<{ download: string; href: string }>
      | undefined;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedDownload = {
          download: this.download,
          href: this.href,
        };
      });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });

    await act(async () => {
      root.render(<ShareCardBuilder firstTaskType="study" />);
    });

    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Download SVG card",
    );
    const status = container.querySelector('[role="status"]');

    expect(container.querySelector("select")).toBeNull();
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(button).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();

    await act(async () => {
      button?.click();
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, SHARE_CARD_HERO_PATH, {
      cache: "force-cache",
      credentials: "same-origin",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/share-card",
      expect.objectContaining({
        body: "{}",
        credentials: "same-origin",
        keepalive: true,
        method: "POST",
      }),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:share-card");
    expect(status?.textContent).toBe("Your SVG card downloaded.");
    expect(clickedDownload).toEqual({
      download: SHARE_CARD_FILENAME,
      href: "blob:share-card",
    });

    const downloadedBlob = createObjectURL.mock.calls[0]?.[0];
    expect(downloadedBlob).toBeInstanceOf(Blob);
    if (!(downloadedBlob instanceof Blob)) {
      throw new Error("Expected an SVG download blob");
    }
    expect(downloadedBlob?.type).toBe(
      "image/svg+xml;charset=utf-8",
    );
    const downloadedSvg = await readBlobAsText(downloadedBlob);
    expect(downloadedSvg).toContain('href="data:image/png;base64,');
    expect(downloadedSvg).toContain("First build: Study");
    expect(downloadedSvg).not.toContain(
      `href="${SHARE_CARD_HERO_PATH}"`,
    );

    const download = document.querySelector<HTMLAnchorElement>(
      `a[download="${SHARE_CARD_FILENAME}"]`,
    );
    expect(download).toBeNull();
  });
});
