import type { Metadata } from "next";

import { FAQList } from "@/components/marketing/faq-list";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { UseCases } from "@/components/marketing/use-cases";
import { SiteFooter } from "@/components/site-footer";
import { publicFaq } from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Buy a bowl. Build with AI.",
  description:
    "A qualifying YGF purchase unlocks limited Build Credits for study help, coding help, career tasks, and smarter bowl picks.",
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <UseCases />
      <HowItWorks />
      <section
        aria-labelledby="faq-preview-title"
        className="faq-preview"
        id="faq"
      >
        <div className="container">
          <div className="section-heading">
            <h2 id="faq-preview-title">FAQ</h2>
            <a href="/faq">View all questions</a>
          </div>
          <FAQList items={publicFaq.slice(0, 4)} />
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
