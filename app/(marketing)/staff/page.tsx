import type { Metadata } from "next";

import { ContactForm } from "@/components/marketing/contact-form";
import {
  EnglishOnlyContentNotice,
  LocalizedSiteFooter,
} from "@/components/marketing/english-only-content";
import {
  sensitiveDataWarning,
  staffSections,
} from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Staff help",
  description: "Counter guidance for the YGF Bowl-to-Build promotion.",
  robots: {
    follow: false,
    index: false,
  },
};

export default function StaffPage() {
  return (
    <>
      <EnglishOnlyContentNotice />
      <section className="campaign-page legal-page" lang="en">
        <div className="campaign-page__intro container">
          <h1>Staff help</h1>
          <p className="campaign-page__lead">
            Counter instructions and privacy-safe guidance for YGF
            Bowl-to-Build.
          </p>
          <p className="campaign-page__warning">{sensitiveDataWarning}</p>
        </div>
        <div className="legal-page__sections container">
          {staffSections.map(({ body, bullets, title }) => (
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
            <h2>Report an issue</h2>
            <p>
              Report only the issue category, approximate time, and non-secret
              context. Do not include a full code, receipt, prompt, or sensitive
              information. This form sends the email and issue-report message
              you enter to Formspree. Formspree may also process technical
              request data under its own privacy terms while delivering the
              message to YGF.
            </p>
            <ContactForm
              ariaLabel="Staff issue report form"
              idPrefix="staff-issue"
              messageLabel="Issue report"
              submitLabel="Send issue report"
            />
          </section>
        </div>
      </section>
      <LocalizedSiteFooter />
    </>
  );
}
