"use client";

import { useRef } from "react";

import { useCampaignLanguage } from "@/components/campaign-language";
import { useCampaignMotionExperience } from "@/components/marketing/campaign-motion-experience";
import { FAQList } from "@/components/marketing/faq-list";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { UseCases } from "@/components/marketing/use-cases";
import { SiteFooter } from "@/components/site-footer";
import { campaignHomeCopy } from "@/lib/i18n/campaign";

export function MarketingHome() {
  const { locale } = useCampaignLanguage();
  const copy = campaignHomeCopy[locale];
  const scopeRef = useRef<HTMLDivElement>(null);

  useCampaignMotionExperience({
    locale,
    scopeRef,
  });

  return (
    <div className="campaign-home" data-language={locale} ref={scopeRef}>
      <Hero copy={copy.hero} />
      <UseCases copy={copy.useCases} />
      <HowItWorks copy={copy.howItWorks} />
      <section
        aria-labelledby="faq-preview-title"
        className="faq-preview"
        data-motion-reveal
        id="faq"
      >
        <div className="container">
          <div className="section-heading">
            <h2 id="faq-preview-title">{copy.faq.heading}</h2>
            <a href="/faq">{copy.faq.viewAll}</a>
          </div>
          <FAQList items={copy.faq.items} />
        </div>
      </section>
      <SiteFooter copy={copy.footer} />
    </div>
  );
}
