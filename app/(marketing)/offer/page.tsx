import type { Metadata } from "next";

import { HowItWorks } from "@/components/marketing/how-it-works";
import { SiteFooter } from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";
import {
  promotionalFinePrint,
  uscShortDisclaimer,
} from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "The offer",
  description:
    "Spend $16+ at YGF, get a code at checkout, and claim limited Build Credits.",
};

export default function OfferPage() {
  return (
    <>
      <section className="campaign-page campaign-page--offer">
        <div className="campaign-page__intro container">
          <h1>Buy a bowl. Build with AI.</h1>
          <p className="campaign-page__lead">
            A qualifying YGF purchase unlocks limited Build Credits for study
            help, coding help, career tasks, and smarter bowl picks.
          </p>
          <div className="campaign-page__actions">
            <ButtonLink href="/redeem">Claim Build Credits</ButtonLink>
            <ButtonLink href="#how-it-works" variant="secondary">
              How it works
            </ButtonLink>
          </div>
          <p className="campaign-page__microcopy">{uscShortDisclaimer}</p>
        </div>
      </section>
      <HowItWorks />
      <section className="offer-fine-print">
        <div className="container">
          <h2>Offer details</h2>
          <p>{promotionalFinePrint}</p>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
