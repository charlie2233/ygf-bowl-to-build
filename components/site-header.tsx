import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner container">
        <Link className="site-brand" href="/">
          <span className="site-brand__name">YGF</span>
          <span className="site-brand__campaign">Bowl-to-Build</span>
        </Link>

        <nav aria-label="Primary navigation" className="site-nav">
          <Link className="site-nav__link" href="/#how-it-works">
            How it works
          </Link>
          <Link className="site-nav__link" href="/faq">
            FAQ
          </Link>
          <ButtonLink href="/redeem" size="small">
            Redeem
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
