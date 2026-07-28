import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  usePathname: vi.fn(() => "/"),
  useRouter: vi.fn(),
}));
const headersMocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: navigationMocks.usePathname,
  useRouter: navigationMocks.useRouter,
}));
vi.mock("next/headers", () => ({
  cookies: headersMocks.cookies,
  headers: headersMocks.headers,
}));

import RootLayout from "@/app/layout";
import {
  CampaignLanguageProvider,
  CampaignLanguageSelector,
  useCampaignLanguage,
} from "@/components/campaign-language";
import {
  EnglishOnlyContentNotice,
  LocalizedSiteFooter,
} from "@/components/marketing/english-only-content";
import { SiteHeader } from "@/components/site-header";
import {
  SITE_LOCALE_COOKIE,
  SITE_LOCALE_STORAGE_KEY,
  type SiteLocale,
} from "@/lib/i18n/site";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function LocaleProbe() {
  const { locale } = useCampaignLanguage();
  return <output data-testid="locale">{locale}</output>;
}

describe("site language UI", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    navigationMocks.refresh.mockReset();
    navigationMocks.usePathname.mockReset();
    navigationMocks.usePathname.mockReturnValue("/");
    navigationMocks.useRouter.mockReset();
    navigationMocks.useRouter.mockReturnValue({
      refresh: navigationMocks.refresh,
    });
    headersMocks.cookies.mockReset();
    headersMocks.cookies.mockResolvedValue({
      get: () => undefined,
    });
    headersMocks.headers.mockReset();
    headersMocks.headers.mockResolvedValue({
      get: () => undefined,
    });
    window.localStorage.clear();
    document.cookie = `${SITE_LOCALE_COOKIE}=; Path=/; Max-Age=0`;
    document.documentElement.lang = "en";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.localStorage.clear();
    document.cookie = `${SITE_LOCALE_COOKIE}=; Path=/; Max-Age=0`;
    document.documentElement.lang = "en";
    vi.clearAllMocks();
  });

  async function renderClient(
    children: ReactNode,
    initialLocale: SiteLocale = "en",
  ) {
    await act(async () => {
      root.render(
        <CampaignLanguageProvider initialLocale={initialLocale}>
          {children}
        </CampaignLanguageProvider>,
      );
    });
  }

  it("updates immediately and persists a language change in storage and a Lax cookie", async () => {
    await renderClient(
      <>
        <CampaignLanguageSelector label="Language" />
        <LocaleProbe />
      </>,
    );

    const selector = container.querySelector<HTMLSelectElement>("select");
    expect(selector).toBeTruthy();

    await act(async () => {
      if (selector) {
        selector.value = "zh";
        selector.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(
      container.querySelector('[data-testid="locale"]')?.textContent,
    ).toBe("zh");
    expect(window.localStorage.getItem(SITE_LOCALE_STORAGE_KEY)).toBe("zh");
    expect(document.cookie).toContain(`${SITE_LOCALE_COOKIE}=zh`);
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it("shows localized selectors and navigation on public and workspace routes, but not admin", async () => {
    window.localStorage.setItem(SITE_LOCALE_STORAGE_KEY, "zh");
    document.cookie = `${SITE_LOCALE_COOKIE}=zh; Path=/; SameSite=Lax`;
    navigationMocks.usePathname.mockReturnValue("/redeem");
    await renderClient(<SiteHeader />, "zh");

    expect(container.querySelectorAll("select")).toHaveLength(1);
    expect(container.querySelector('nav[aria-label="主导航"]')).toBeTruthy();
    expect(container.textContent).toContain("使用流程");
    expect(container.textContent).toContain("兑换");

    navigationMocks.usePathname.mockReturnValue("/wallet");
    await renderClient(<SiteHeader />, "zh");
    expect(container.querySelectorAll("select")).toHaveLength(2);
    expect(
      container.querySelector('nav[aria-label="工作区导航"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('nav[aria-label="移动端工作区导航"]'),
    ).toBeTruthy();
    expect(container.textContent).toContain("钱包");
    expect(container.textContent).toContain("退出登录");

    navigationMocks.usePathname.mockReturnValue("/admin/dashboard");
    await renderClient(<SiteHeader />, "zh");
    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(
      container.querySelector('nav[aria-label="Primary navigation"]'),
    ).toBeTruthy();
  });

  it("renders the cookie locale into the root html language on first paint", async () => {
    headersMocks.cookies.mockResolvedValue({
      get: (name: string) =>
        name === SITE_LOCALE_COOKIE ? { value: "fr" } : undefined,
    });

    const markup = renderToStaticMarkup(
      await RootLayout({ children: <div>Contenu</div> }),
    );

    expect(markup).toContain('<html data-scroll-behavior="smooth" lang="fr">');
    expect(markup).toContain('aria-label="Navigation principale"');
  });

  it("keeps English-only admin routes tagged as English without changing the saved preference", async () => {
    headersMocks.cookies.mockResolvedValue({
      get: (name: string) =>
        name === SITE_LOCALE_COOKIE ? { value: "zh" } : undefined,
    });
    headersMocks.headers.mockResolvedValue({
      get: (name: string) =>
        name === "x-ygf-pathname" ? "/admin/dashboard" : undefined,
    });

    const markup = renderToStaticMarkup(
      await RootLayout({ children: <div>Campaign dashboard</div> }),
    );

    expect(markup).toContain(
      '<html data-scroll-behavior="smooth" lang="en">',
    );
    expect(markup).toContain('aria-label="Primary navigation"');
  });

  it("labels English-only policy content while keeping its footer localized", async () => {
    window.localStorage.setItem(SITE_LOCALE_STORAGE_KEY, "fr");
    document.cookie = `${SITE_LOCALE_COOKIE}=fr; Path=/; SameSite=Lax`;

    await renderClient(
      <>
        <EnglishOnlyContentNotice />
        <section lang="en">Promotional terms</section>
        <LocalizedSiteFooter />
      </>,
      "fr",
    );

    expect(container.textContent).toContain(
      "contenu juridique ou opérationnel",
    );
    expect(container.querySelector('section[lang="en"]')).toBeTruthy();
    expect(container.textContent).toContain("Confidentialité");
    expect(container.textContent).toContain("Aide au personnel");
  });
});
