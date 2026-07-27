import { Clock3 } from "lucide-react";
import Image from "next/image";

import { ButtonLink } from "@/components/ui/button";
import { uscShortDisclaimer } from "@/lib/content/legal";

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

export function Hero() {
  return (
    <section aria-labelledby="campaign-hero-title" className="marketing-hero">
      <Image
        alt="Generated overhead image of a malatang bowl"
        className="marketing-hero__image"
        fill
        loading="eager"
        priority
        sizes="100vw"
        src="/media/malatang-hero.png"
      />

      <div className="marketing-hero__inner container">
        <div className="marketing-hero__copy">
          <h1 id="campaign-hero-title">
            <span>Buy a bowl.</span>
            {" "}
            <span>Build with AI.</span>
          </h1>
          <p className="marketing-hero__subhead">
            A qualifying YGF purchase unlocks limited Build Credits for study
            help, coding help, career tasks, and smarter bowl picks.
          </p>
          <div className="marketing-hero__actions">
            <ButtonLink className="marketing-hero__cta" href="/redeem">
              Claim Build Credits
            </ButtonLink>
            <ButtonLink
              className="marketing-hero__cta"
              href="#how-it-works"
              variant="secondary"
            >
              How it works
            </ButtonLink>
          </div>
          <p className="marketing-hero__disclaimer">{uscShortDisclaimer}</p>
        </div>

        <div
          aria-label="Illustration of a receipt QR and printed code that can be scanned or entered; example only, not live"
          className="campaign-phone"
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
              <span>Qualifying purchase</span>
              <dl>
                <div>
                  <dt>Total</dt>
                  <dd>$16+</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>Ready</dd>
                </div>
              </dl>
            </div>
            <div className="campaign-phone__wallet">
              <span>Illustrative receipt code</span>
              <div className="campaign-phone__claim">
                <ReceiptQrIllustration />
                <strong>A7K3B9Q2</strong>
              </div>
              <span>Scan receipt QR or enter code</span>
              <em>Example only — not a live claim code.</em>
              <small>
                <Clock3 aria-hidden="true" size={14} />
                Expires 14 days after redemption
              </small>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
