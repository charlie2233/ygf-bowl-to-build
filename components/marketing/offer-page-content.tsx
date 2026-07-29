"use client";

import { useCampaignLanguage } from "@/components/campaign-language";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { SiteFooter } from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";
import { promotionalFinePrint } from "@/lib/content/legal";
import {
  campaignHomeCopy,
  type CampaignLocale,
} from "@/lib/i18n/campaign";

const offerDetailsCopy: Record<
  CampaignLocale,
  Readonly<{ englishNotice: string; heading: string }>
> = {
  en: {
    englishNotice: "",
    heading: "Offer details",
  },
  zh: {
    englishNotice: "以下正式活动条款目前以英文提供。",
    heading: "活动详情",
  },
  es: {
    englishNotice:
      "Los términos oficiales de la promoción se ofrecen actualmente en inglés.",
    heading: "Detalles de la oferta",
  },
  fr: {
    englishNotice:
      "Les conditions officielles de l’offre sont actuellement disponibles en anglais.",
    heading: "Détails de l’offre",
  },
  ru: {
    englishNotice:
      "Официальные условия акции пока доступны только на английском языке.",
    heading: "Условия предложения",
  },
};

export function OfferPageContent() {
  const { locale } = useCampaignLanguage();
  const copy = campaignHomeCopy[locale];
  const details = offerDetailsCopy[locale];

  return (
    <div data-language={locale}>
      <section className="campaign-page campaign-page--offer">
        <div className="campaign-page__intro container">
          <h1>
            {copy.hero.titleLineOne} {copy.hero.titleLineTwo}
          </h1>
          <p className="campaign-page__lead">{copy.hero.subhead}</p>
          <p className="campaign-page__microcopy">{copy.hero.rewardContext}</p>
          <div className="campaign-page__actions">
            <ButtonLink href="/redeem">{copy.hero.claimCredits}</ButtonLink>
            <ButtonLink href="#how-it-works" variant="secondary">
              {copy.header.howItWorks}
            </ButtonLink>
          </div>
          <p className="campaign-page__microcopy">
            {copy.hero.disclaimer}
          </p>
        </div>
      </section>
      <HowItWorks copy={copy.howItWorks} eagerImage />
      <section className="offer-fine-print">
        <div className="container">
          <h2>{details.heading}</h2>
          {details.englishNotice ? <p>{details.englishNotice}</p> : null}
          <p lang="en">{promotionalFinePrint}</p>
        </div>
      </section>
      <SiteFooter copy={copy.footer} />
    </div>
  );
}
