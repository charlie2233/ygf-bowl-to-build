import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import CreatorKitPage from "@/app/(marketing)/creator-kit/page";
import FAQPage from "@/app/(marketing)/faq/page";
import HomePage from "@/app/(marketing)/page";
import OfferPage from "@/app/(marketing)/offer/page";
import PrivacyPage from "@/app/(marketing)/privacy/page";
import StaffPage from "@/app/(marketing)/staff/page";
import TermsPage from "@/app/(marketing)/terms/page";

function renderPage(page: ReactNode) {
  document.body.innerHTML = renderToStaticMarkup(page);
  return document.body;
}

function normalizedText(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function expectMinimalContactForm(body: HTMLElement, label: string) {
  const form = body.querySelector<HTMLFormElement>(
    'form[action="https://formspree.io/f/mbdzrwbo"][method="post"]',
  );

  expect(form).toBeTruthy();
  expect(form?.getAttribute("aria-label")).toBe(label);
  expect(form?.querySelector('input[type="email"][name="email"]')).toBeTruthy();
  expect(form?.querySelector('textarea[name="message"]')).toBeTruthy();
  expect(form?.querySelectorAll("input, textarea")).toHaveLength(2);
  expect(form?.querySelector('button[type="submit"]')).toBeTruthy();
}

describe("public campaign pages", () => {
  it("renders the approved home-page campaign contract", () => {
    const body = renderPage(<HomePage />);
    const heading = body.querySelector("h1");
    const claimLink = Array.from(body.querySelectorAll("a")).find(
      (link) => normalizedText(link) === "Claim Build Credits",
    );
    const bowlImage = Array.from(body.querySelectorAll("img")).find((image) =>
      /malatang bowl/i.test(image.getAttribute("alt") ?? ""),
    );

    expect(normalizedText(heading)).toBe("Buy a bowl. Build with AI.");
    expect(body.querySelectorAll("h1")).toHaveLength(1);
    expect(claimLink?.getAttribute("href")).toBe("/redeem");
    expect(normalizedText(body)).toMatch(/not affiliated with or endorsed by USC/i);
    expect(bowlImage).toBeTruthy();
    expect(bowlImage?.getAttribute("loading")).toBe("eager");
    expect(normalizedText(body)).not.toMatch(/\btoken(s)?\b/i);
  });

  it("shows an illustrative receipt QR and printed-code handoff", () => {
    const text = normalizedText(renderPage(<HomePage />));

    expect(text).toContain("A7K3B9Q2");
    expect(text).toMatch(/illustrative receipt code/i);
    expect(text).toMatch(/scan receipt QR or enter code/i);
    expect(text).toMatch(/not a live claim code/i);
  });

  it("renders the complete public FAQ topics", () => {
    const text = normalizedText(renderPage(<FAQPage />));

    expect(text).toContain("Who’s eligible?");
    expect(text).toContain("Is this official USC?");
    expect(text).toContain("When do credits expire?");
    expect(text).toContain("Do I need a school email?");
  });

  it("keeps the offer and promotional terms explicit", () => {
    const offerText = normalizedText(renderPage(<OfferPage />));
    const termsText = normalizedText(renderPage(<TermsPage />));

    expect(offerText).toContain("Spend $16+ in one transaction");
    expect(offerText).toContain("Credits expire 14 days after redemption");
    expect(termsText).toContain("One redemption per person/account");
    expect(termsText).toContain("No cash value");
  });

  it("shows privacy and sensitive-data warnings", () => {
    const privacyText = normalizedText(renderPage(<PrivacyPage />));
    const staffText = normalizedText(renderPage(<StaffPage />));

    expect(privacyText).toMatch(/account identifier/i);
    expect(privacyText).toMatch(/Supabase anonymous user identifier/i);
    expect(privacyText).toMatch(/Do not submit SSNs, payment card numbers, medical data/i);
    expect(staffText).toMatch(/staff only hand the code after the receipt threshold is met/i);
    expect(staffText).toMatch(/Do not submit SSNs, payment card numbers, medical data/i);
  });

  it("states current sharing and retention limits without invented deadlines", () => {
    const body = renderPage(<PrivacyPage />);
    const text = normalizedText(body);

    expect(text).toMatch(/Supabase/i);
    expect(text).toMatch(/directly to OpenAI/i);
    expect(text).toMatch(/Formspree/i);
    expect(text).toMatch(/technical request data/i);
    expect(text).toMatch(/five minutes/i);
    expect(text).toMatch(/90-day retain_until default/i);
    expect(text).toMatch(/explicit per-record expiry/i);
    expect(text).toMatch(/14 days.*not the same as record deletion/i);
    expect(text).toMatch(/saved web outputs persist when explicitly saved/i);
    expect(text).toMatch(/store:false.*not a zero-retention promise/i);
    expect(text).toMatch(/abuse-monitoring logs.*up to 30 days/i);
    expect(text).toMatch(/stored in Postgres.*15-minute/i);
    expect(text).toMatch(/can repeat or echo submitted input/i);
    expect(text).toMatch(/bounded scheduled cleanup.*launch gate/i);
    expect(text).toMatch(/no fixed deletion deadline/i);
    expect(text).toMatch(
      /manager-approved, technically enforced retention\/deletion schedule is a launch gate before accepting live redemptions/i,
    );
    expect(text).not.toMatch(/180 days/i);
    expect(text).not.toMatch(/Formspree processes only/i);
    expectMinimalContactForm(body, "Privacy contact form");
  });

  it("gives creators the supplied disclosure guidance", () => {
    const text = normalizedText(renderPage(<CreatorKitPage />));

    expect(text).toMatch(
      /If you received a free meal, promo credits, or any other benefit from YGF/i,
    );
    expect(text).toMatch(/clearly disclose that relationship in your post/i);
  });

  it("gives staff privacy-safe troubleshooting and issue reporting", () => {
    const body = renderPage(<StaffPage />);
    const text = normalizedText(body);

    expect(text).toMatch(/invalid, already used, or expired/i);
    expect(text).toMatch(/manager approval/i);
    expect(text).toMatch(/reissue or revocation/i);
    expect(text).toMatch(
      /Do not ask guests to share full codes, receipts, prompts, or sensitive data/i,
    );
    expect(text).toMatch(/Formspree/i);
    expect(text).toMatch(/technical request data/i);
    expectMinimalContactForm(body, "Staff issue report form");
  });
});
