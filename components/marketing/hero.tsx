import { Clock3 } from "lucide-react";
import Image from "next/image";

import { ButtonLink } from "@/components/ui/button";
import {
  campaignHomeCopy,
  type CampaignHomeCopy,
} from "@/lib/i18n/campaign";

function ReceiptQrIllustration() {
  return (
    <svg
      aria-hidden="true"
      className="campaign-phone__qr"
      fill="currentColor"
      viewBox="0 0 48 48"
    >
      <path d="M2 2h18v18H2V2Zm4 4v10h10V6H6Zm22-4h18v18H28V2Zm4 4v10h10V6H32ZM2 28h18v18H2V28Zm4 4v10h10V32H6Zm18-8h6v6h-6v-6Zm8 0h6v6h-6v-6Zm8 0h6v6h-6v-6Zm-16 8h6v6h-6v-6Zm8 0h6v6h-6v-6Zm8 0h6v14h-6V32Zm-16 8h14v6H24v-6Z" />
    </svg>
  );
}

export function Hero({
  copy = campaignHomeCopy.en.hero,
}: Readonly<{
  copy?: CampaignHomeCopy["hero"];
}> = {}) {
  return (
    <section
      aria-labelledby="campaign-hero-title"
      className="marketing-hero"
      data-motion-hero
    >
      <Image
        alt={copy.imageAlt}
        className="marketing-hero__image"
        fill
        loading="eager"
        priority
        sizes="100vw"
        src="/media/ygf-hero-background.jpg"
      />

      <div className="marketing-hero__inner container">
        <div className="marketing-hero__copy" data-motion-hero-copy>
          <h1 id="campaign-hero-title">
            <span>{copy.titleLineOne}</span>
            {" "}
            <span>{copy.titleLineTwo}</span>
          </h1>
          <p className="marketing-hero__subhead">
            {copy.subhead}
          </p>
          <p className="marketing-hero__guidance">{copy.guidance}</p>
          <div className="marketing-hero__actions">
            <ButtonLink
              className="marketing-hero__cta marketing-hero__cta--step"
              data-step="01"
              href="/redeem"
            >
              <span className="marketing-hero__step-number">01</span>
              {" "}
              <span>{copy.claimCredits}</span>
            </ButtonLink>
            <ButtonLink
              className="marketing-hero__cta marketing-hero__cta--step marketing-hero__cta--secondary"
              data-step="02"
              href="/connect/agent"
              variant="secondary"
            >
              <span className="marketing-hero__step-number">02</span>
              {" "}
              <span>{copy.connectAgent}</span>
            </ButtonLink>
          </div>
          <p className="marketing-hero__disclaimer">{copy.disclaimer}</p>
        </div>

        <div
          aria-label={copy.phoneAriaLabel}
          className="campaign-phone"
          data-motion-phone
          role="img"
        >
          <div aria-hidden="true" className="campaign-phone__screen">
            <div className="campaign-phone__status">
              <span>9:41</span>
              <span className="campaign-phone__island" />
              <span>•••</span>
            </div>
            <div className="campaign-phone__toolbar">
              <span>Done</span>
              <span>+</span>
            </div>
            <div className="campaign-phone__receipt">
              <strong>YGF Malatang</strong>
              <span>{copy.receipt.qualifyingPurchase}</span>
              <dl>
                <div>
                  <dt>{copy.receipt.total}</dt>
                  <dd>$16+</dd>
                </div>
                <div>
                  <dt>{copy.receipt.status}</dt>
                  <dd>{copy.receipt.ready}</dd>
                </div>
              </dl>
            </div>
            <div className="campaign-phone__wallet">
              <span>{copy.receipt.illustrativeCode}</span>
              <div className="campaign-phone__claim">
                <ReceiptQrIllustration />
                <strong>A7K3B9Q2</strong>
              </div>
              <span>{copy.receipt.scanOrEnter}</span>
              <em>{copy.receipt.exampleOnly}</em>
              <small>
                <Clock3 aria-hidden="true" size={14} />
                {copy.receipt.expires}
              </small>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
