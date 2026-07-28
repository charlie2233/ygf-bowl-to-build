import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import {
  CampaignLanguageProvider,
  LocalizedSkipLink,
} from "@/components/campaign-language";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

export const metadata: Metadata = {
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

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body>
        <CampaignLanguageProvider>
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
