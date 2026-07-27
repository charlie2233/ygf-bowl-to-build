import type { Metadata } from "next";

import { FAQList } from "@/components/marketing/faq-list";
import { SiteFooter } from "@/components/site-footer";
import { uscShortDisclaimer } from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Eligibility, expiry, privacy, and use details for YGF Bowl-to-Build.",
};

export default function FAQPage() {
  return (
    <>
      <section className="campaign-page">
        <div className="campaign-page__intro container">
          <h1>Frequently asked questions</h1>
          <p className="campaign-page__lead">
            Rules, value, expiry, privacy, and safe use for YGF
            Bowl-to-Build.
          </p>
          <p className="campaign-page__microcopy">{uscShortDisclaimer}</p>
        </div>
        <div className="campaign-page__content container">
          <FAQList />
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
