import type { Metadata } from "next";

import {
  EnglishOnlyContentNotice,
  LocalizedSiteFooter,
} from "@/components/marketing/english-only-content";
import { creatorSections } from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Creator kit",
  description: "Disclosure and campaign guidance for YGF creators.",
};

export default function CreatorKitPage() {
  return (
    <>
      <EnglishOnlyContentNotice />
      <section className="campaign-page legal-page" lang="en">
        <div className="campaign-page__intro container">
          <h1>Creator kit</h1>
          <p className="campaign-page__lead">
            Clear disclosure and accurate campaign language for creator posts.
          </p>
        </div>
        <div className="legal-page__sections container">
          {creatorSections.map(({ body, bullets, title }) => (
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
