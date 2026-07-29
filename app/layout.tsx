import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";

import {
  CampaignLanguageProvider,
  LocalizedSkipLink,
} from "@/components/campaign-language";
import { SiteHeader } from "@/components/site-header";
import {
  resolveSiteLocale,
  SITE_LOCALE_COOKIE,
  SITE_PATHNAME_HEADER,
  siteNavigationCopy,
} from "@/lib/i18n/site";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://malatangai.com"),
  title: {
    default: "YGF Bowl-to-Build",
    template: "%s | YGF Bowl-to-Build",
  },
  description:
    "Turn a qualifying YGF purchase into useful Build Credits for everyday AI tasks.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#FFF8F1",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default async function RootLayout({ children }: RootLayoutProps) {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    headers(),
  ]);
  const preferredLocale = resolveSiteLocale(
    cookieStore.get(SITE_LOCALE_COOKIE)?.value,
  );
  const adminRoute =
    requestHeaders.get(SITE_PATHNAME_HEADER)?.startsWith("/admin") ??
    false;
  const initialLocale = adminRoute ? "en" : preferredLocale;

  return (
    <html
      data-scroll-behavior="smooth"
      lang={siteNavigationCopy[initialLocale].documentLanguage}
    >
      <body>
        <CampaignLanguageProvider initialLocale={initialLocale}>
          <LocalizedSkipLink />
          <SiteHeader />
          <main className="app-main" id="main-content" tabIndex={-1}>
            {children}
          </main>
        </CampaignLanguageProvider>
      </body>
    </html>
  );
}
