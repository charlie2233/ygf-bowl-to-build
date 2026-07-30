import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HeroMedia } from "@/components/marketing/hero-media";

describe("responsive hero media", () => {
  it("renders an eager desktop image with a mobile art-directed source", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <HeroMedia imageAlt="A finished bowl of spicy malatang" />,
    );

    const media = document.body.querySelector(".marketing-hero__media");
    const picture = media?.querySelector("picture");
    const mobileSource = picture?.querySelector("source");
    const desktopImage = picture?.querySelector("img");

    expect(media?.getAttribute("data-hero-media-state")).toBe("still");
    expect(picture?.classList.contains("marketing-hero__picture")).toBe(true);
    expect(mobileSource?.getAttribute("media")).toBe("(max-width: 820px)");
    expect(mobileSource?.getAttribute("type")).toBe("image/jpeg");
    expect(mobileSource?.getAttribute("srcset")).toBe(
      "/media/ygf-authentic-hero-mobile-v2.jpg",
    );
    expect(desktopImage?.getAttribute("alt")).toBe(
      "A finished bowl of spicy malatang",
    );
    expect(desktopImage?.getAttribute("src")).toBe(
      "/media/ygf-authentic-hero-desktop-v2.jpg",
    );
    expect(desktopImage?.getAttribute("loading")).toBe("eager");
    expect(desktopImage?.getAttribute("fetchpriority")).toBe("high");
    expect(media?.querySelector("video")).toBeNull();
    expect(media?.querySelector("button")).toBeNull();
  });
});
