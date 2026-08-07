import {
  campaignHomeCopy,
  type CampaignHomeCopy,
} from "@/lib/i18n/campaign";

export function SiteFooter({
  copy = campaignHomeCopy.en.footer,
}: Readonly<{
  copy?: CampaignHomeCopy["footer"];
}> = {}) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner container">
        <nav aria-label={copy.navigationLabel}>
          <a href="/terms">{copy.terms}</a>
          <a href="/privacy">{copy.privacy}</a>
          <a href="/review">{copy.review}</a>
          <a href="/creator-kit">{copy.creatorKit}</a>
          <a href="/staff">{copy.staffHelp}</a>
        </nav>
        <p>{copy.disclaimer}</p>
      </div>
    </footer>
  );
}
