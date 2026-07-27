import { uscShortDisclaimer } from "@/lib/content/legal";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner container">
        <nav aria-label="Footer navigation">
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/creator-kit">Creator kit</a>
          <a href="/staff">Staff help</a>
        </nav>
        <p>{uscShortDisclaimer}</p>
      </div>
    </footer>
  );
}
