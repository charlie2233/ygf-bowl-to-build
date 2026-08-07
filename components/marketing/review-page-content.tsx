"use client";

import { useCampaignLanguage } from "@/components/campaign-language";
import { ReviewForm } from "@/components/marketing/review-form";
import { SiteFooter } from "@/components/site-footer";
import { campaignHomeCopy } from "@/lib/i18n/campaign";
import { reviewPageCopy } from "@/lib/i18n/review";

export function ReviewPageContent() {
  const { locale } = useCampaignLanguage();
  const copy = reviewPageCopy[locale];

  return (
    <div data-language={locale}>
      <section
        className="campaign-page legal-page"
        lang={copy.documentLanguage}
      >
        <div className="campaign-page__intro container">
          <h1>{copy.title}</h1>
          <p className="campaign-page__lead">{copy.lead}</p>
          <p className="campaign-page__warning">{copy.warning}</p>
        </div>
        <div className="legal-page__sections container">
          <section className="contact-panel">
            <h2>{copy.formHeading}</h2>
            <p>{copy.disclosure}</p>
            <ReviewForm copy={copy.form} />
          </section>
        </div>
      </section>
      <SiteFooter copy={campaignHomeCopy[locale].footer} />
    </div>
  );
}
