"use client";

import { useCampaignLanguage } from "@/components/campaign-language";
import { FAQList } from "@/components/marketing/faq-list";
import { SiteFooter } from "@/components/site-footer";
import {
  campaignHomeCopy,
  type CampaignLocale,
} from "@/lib/i18n/campaign";

const faqIntroCopy: Record<
  CampaignLocale,
  Readonly<{ heading: string; lead: string }>
> = {
  en: {
    heading: "Frequently asked questions",
    lead: "Eligibility, value, expiry, privacy, and safe use—explained simply.",
  },
  zh: {
    heading: "常见问题",
    lead: "用简单的话了解参加条件、额度、到期、隐私和安全使用。",
  },
  es: {
    heading: "Preguntas frecuentes",
    lead:
      "Requisitos, valor, vencimiento, privacidad y uso seguro, explicados con claridad.",
  },
  fr: {
    heading: "Questions fréquentes",
    lead:
      "Éligibilité, valeur, expiration, confidentialité et usage sûr, expliqués simplement.",
  },
  ru: {
    heading: "Частые вопросы",
    lead:
      "Простые ответы об участии, балансе, сроке действия, конфиденциальности и безопасном использовании.",
  },
};

export function FAQPageContent() {
  const { locale } = useCampaignLanguage();
  const copy = campaignHomeCopy[locale];
  const intro = faqIntroCopy[locale];

  return (
    <div data-language={locale}>
      <section className="campaign-page">
        <div className="campaign-page__intro container">
          <h1>{intro.heading}</h1>
          <p className="campaign-page__lead">{intro.lead}</p>
          <p className="campaign-page__microcopy">
            {copy.hero.disclaimer}
          </p>
        </div>
        <div className="campaign-page__content container">
          <FAQList items={copy.faq.items} />
        </div>
      </section>
      <SiteFooter copy={copy.footer} />
    </div>
  );
}
