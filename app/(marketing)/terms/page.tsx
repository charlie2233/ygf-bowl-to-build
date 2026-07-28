import type { Metadata } from "next";

import {
  EnglishOnlyContentNotice,
  LocalizedSiteFooter,
} from "@/components/marketing/english-only-content";
import {
  promotionalFinePrint,
  promotionalTerms,
} from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Promotional terms",
  description: "Promotional terms for YGF Bowl-to-Build.",
};

export default function TermsPage() {
  return (
    <>
      <EnglishOnlyContentNotice />
      <section className="campaign-page legal-page" lang="en">
        <div className="campaign-page__intro container">
          <h1>Promotional terms</h1>
          <p className="campaign-page__lead">{promotionalFinePrint}</p>
        </div>
        <div className="legal-page__sections container">
          {promotionalTerms.map(({ body, bullets, title }) => (
            <section key={title}>
              <h2>{title}</h2>
              {body?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {bullets ? (
                <ul>
                  {bullets.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </section>
      <LocalizedSiteFooter />
    </>
  );
}
