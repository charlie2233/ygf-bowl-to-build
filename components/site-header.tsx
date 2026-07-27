import { ButtonLink } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner container">
        <a className="site-brand" href="/">
          <span className="site-brand__name">YGF</span>
          <span className="site-brand__campaign">Bowl-to-Build</span>
        </a>

        <nav aria-label="Primary navigation" className="site-nav">
          <a className="site-nav__link" href="/#how-it-works">
            How it works
          </a>
          <a className="site-nav__link" href="/faq">
            FAQ
          </a>
          <ButtonLink href="/redeem" size="small">
            Redeem
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
