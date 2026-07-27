import type { Metadata } from "next";

import { ContactForm } from "@/components/marketing/contact-form";
import { SiteFooter } from "@/components/site-footer";
import {
  privacySections,
  sensitiveDataWarning,
} from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "Privacy notice for YGF Bowl-to-Build.",
};

export default function PrivacyPage() {
  return (
    <>
      <section className="campaign-page legal-page">
        <div className="campaign-page__intro container">
          <h1>Privacy notice</h1>
          <p className="campaign-page__lead">
            YGF processes only the information needed to provide this
            promotional AI service, deliver wallet access, prevent fraud, and
            restore access.
          </p>
          <p className="campaign-page__warning">{sensitiveDataWarning}</p>
        </div>
        <div className="legal-page__sections container">
          {privacySections.map(({ body, bullets, title }) => (
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
          <section className="contact-panel">
            <h2>Privacy contact</h2>
            <p>
              This form sends the email and request text you enter to Formspree.
              Formspree may also process technical request data under its own
              privacy terms while delivering the message to YGF.
            </p>
            <ContactForm
              ariaLabel="Privacy contact form"
              idPrefix="privacy-contact"
              messageLabel="Privacy request"
              submitLabel="Send privacy request"
            />
          </section>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
