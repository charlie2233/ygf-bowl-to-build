"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  CampaignLanguageSelector,
  useCampaignLanguage,
} from "@/components/campaign-language";
import { ButtonLink } from "@/components/ui/button";
import { siteNavigationCopy } from "@/lib/i18n/site";

export function SiteHeader() {
  const pathname = usePathname();
  const { locale } = useCampaignLanguage();
  const isAdmin = pathname.startsWith("/admin");
  const brandName = locale === "zh" && !isAdmin ? "杨国福" : "YGF";
  const copy = siteNavigationCopy[isAdmin ? "en" : locale];
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
          <span className="site-brand__name">{brandName}</span>
          <span className="site-brand__campaign">Bowl-to-Build</span>
        </Link>

        {isWorkspace ? (
          <>
            <nav
              aria-label={copy.workspace.navigationLabel}
              className="site-nav site-nav--workspace"
            >
              <CampaignLanguageSelector
                label={copy.public.languageLabel}
              />
              <Link
                aria-current={pathname === "/wallet" ? "page" : undefined}
                className="site-nav__link"
                href="/wallet"
              >
                {copy.workspace.wallet}
              </Link>
              <Link
                aria-current={
                  pathname.startsWith("/connect/") ? "page" : undefined
                }
                className="site-nav__link"
                href="/connect/agent"
              >
                {copy.workspace.agent}
              </Link>
              <Link
                aria-current={pathname === "/history" ? "page" : undefined}
                className="site-nav__link"
                href="/history"
              >
                {copy.workspace.history}
              </Link>
              <Link className="site-nav__link" href="/faq">
                {copy.workspace.help}
              </Link>
              <form action="/auth/sign-out" method="post">
                <button
                  className="button button--primary button--small"
                  type="submit"
                >
                  {copy.workspace.signOut}
                </button>
              </form>
            </nav>
            <div className="workspace-menu">
              <CampaignLanguageSelector
                label={copy.public.languageLabel}
              />
            </div>
            <details className="workspace-menu">
              <summary>
                <span aria-hidden="true" className="workspace-menu__icon">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="visually-hidden">
                  {copy.workspace.openAccountMenu}
                </span>
              </summary>
              <nav
                aria-label={copy.workspace.mobileNavigationLabel}
                className="workspace-menu__panel"
              >
                <Link
                  aria-current={pathname === "/wallet" ? "page" : undefined}
                  href="/wallet"
                >
                  {copy.workspace.wallet}
                </Link>
                <Link
                  aria-current={
                    pathname.startsWith("/connect/") ? "page" : undefined
                  }
                  href="/connect/agent"
                >
                  {copy.workspace.agent}
                </Link>
                <Link
                  aria-current={pathname === "/history" ? "page" : undefined}
                  href="/history"
                >
                  {copy.workspace.history}
                </Link>
                <Link href="/faq">{copy.workspace.help}</Link>
                <form action="/auth/sign-out" method="post">
                  <button
                    className="button button--primary button--small"
                    type="submit"
                  >
                    {copy.workspace.signOut}
                  </button>
                </form>
              </nav>
            </details>
          </>
        ) : (
          <nav
            aria-label={copy.public.navigationLabel}
            className={`site-nav${isAdmin ? "" : " site-nav--campaign"}`}
          >
            {isAdmin ? null : (
              <CampaignLanguageSelector label={copy.public.languageLabel} />
            )}
            <Link
              className="site-nav__link site-nav__link--how"
              href="/#how-it-works"
            >
              {copy.public.howItWorks}
            </Link>
            <Link
              className="site-nav__link site-nav__link--faq"
              href="/faq"
            >
              {copy.public.faq}
            </Link>
            <ButtonLink href="/redeem" size="small">
              {copy.public.redeem}
            </ButtonLink>
          </nav>
        )}
      </div>
    </header>
  );
}
