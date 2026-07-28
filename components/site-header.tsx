"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  CampaignLanguageSelector,
  useCampaignLanguage,
} from "@/components/campaign-language";
import { ButtonLink } from "@/components/ui/button";
import { campaignHomeCopy } from "@/lib/i18n/campaign";

export function SiteHeader() {
  const pathname = usePathname();
  const { locale } = useCampaignLanguage();
  const isCampaignHome = pathname === "/";
  const homeCopy = campaignHomeCopy[locale].header;
  const isWorkspace =
    pathname === "/wallet" ||
    pathname === "/history" ||
    pathname === "/share" ||
    pathname.startsWith("/connect/") ||
    pathname.startsWith("/task/");

  return (
    <header className="site-header">
      <div className="site-header__inner container">
        <Link className="site-brand" href="/">
          <span className="site-brand__name">YGF</span>
          <span className="site-brand__campaign">Bowl-to-Build</span>
        </Link>

        {isWorkspace ? (
          <>
            <nav
              aria-label="Workspace navigation"
              className="site-nav site-nav--workspace"
            >
              <Link
                aria-current={pathname === "/wallet" ? "page" : undefined}
                className="site-nav__link"
                href="/wallet"
              >
                Wallet
              </Link>
              <Link
                aria-current={
                  pathname.startsWith("/connect/") ? "page" : undefined
                }
                className="site-nav__link"
                href="/connect/agent"
              >
                Agent
              </Link>
              <Link
                aria-current={pathname === "/history" ? "page" : undefined}
                className="site-nav__link"
                href="/history"
              >
                History
              </Link>
              <Link className="site-nav__link" href="/faq">
                Help
              </Link>
              <form action="/auth/sign-out" method="post">
                <button
                  className="button button--primary button--small"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            </nav>
            <details className="workspace-menu">
              <summary>
                <span aria-hidden="true" className="workspace-menu__icon">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="visually-hidden">Open account menu</span>
              </summary>
              <nav
                aria-label="Mobile workspace navigation"
                className="workspace-menu__panel"
              >
                <Link
                  aria-current={pathname === "/wallet" ? "page" : undefined}
                  href="/wallet"
                >
                  Wallet
                </Link>
                <Link
                  aria-current={
                    pathname.startsWith("/connect/") ? "page" : undefined
                  }
                  href="/connect/agent"
                >
                  Agent
                </Link>
                <Link
                  aria-current={pathname === "/history" ? "page" : undefined}
                  href="/history"
                >
                  History
                </Link>
                <Link href="/faq">Help</Link>
                <form action="/auth/sign-out" method="post">
                  <button
                    className="button button--primary button--small"
                    type="submit"
                  >
                    Sign out
                  </button>
                </form>
              </nav>
            </details>
          </>
        ) : (
          <nav
            aria-label="Primary navigation"
            className={`site-nav${isCampaignHome ? " site-nav--campaign" : ""}`}
          >
            {isCampaignHome ? (
              <CampaignLanguageSelector label={homeCopy.languageLabel} />
            ) : null}
            <Link
              className="site-nav__link site-nav__link--how"
              href="/#how-it-works"
            >
              {isCampaignHome ? homeCopy.howItWorks : "How it works"}
            </Link>
            <Link
              className="site-nav__link site-nav__link--faq"
              href="/faq"
            >
              {isCampaignHome ? homeCopy.faq : "FAQ"}
            </Link>
            <ButtonLink href="/redeem" size="small">
              {isCampaignHome ? homeCopy.redeem : "Redeem"}
            </ButtonLink>
          </nav>
        )}
      </div>
    </header>
  );
}
