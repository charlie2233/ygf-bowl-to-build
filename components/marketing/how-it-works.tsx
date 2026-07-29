import { ArrowRight, CheckCircle2, Soup, Ticket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";

import { ButtonLink } from "@/components/ui/button";
import {
  campaignHomeCopy,
  type CampaignHomeCopy,
} from "@/lib/i18n/campaign";

type CampaignStepVisual = Readonly<{
  icon: LucideIcon;
}>;

const stepVisuals = [
  {
    icon: Soup,
  },
  {
    icon: Ticket,
  },
  {
    icon: CheckCircle2,
  },
] as const satisfies readonly CampaignStepVisual[];

function BusyWeekIllustration() {
  return (
    <svg
      aria-hidden="true"
      className="busy-week__illustration"
      fill="none"
      viewBox="0 0 520 250"
    >
      <path d="M36 216h448M175 216v-70h68v70m-51-70V92h34v54m-17-54V28l-17 64m17-64 17 64m52 124v-89h70v89m-60-89 25-28 25 28M77 216v-66m0 0c-22-18-45-4-44 13m44-13c21-19 45-4 44 13m-44-13-22 26m22-26 21 26m300 40v-58m0 0c-18-15-38-3-37 11m37-11c18-15 38-3 37 11m-37-11-18 23m18-23 18 23M204 120h10m-10 26h10m-10 26h10m89-20v28m20-28v28" />
      <path d="M74 98c17-22 39-22 56 0 18-18 35-14 45 4M355 70c18-25 45-24 58 2 20-17 40-10 46 8" />
    </svg>
  );
}

export function HowItWorks({
  copy = campaignHomeCopy.en.howItWorks,
  eagerImage = false,
  handoff,
}: {
  copy?: CampaignHomeCopy["howItWorks"];
  eagerImage?: boolean;
  handoff?: Pick<
    CampaignHomeCopy["hero"],
    "claimCredits" | "guidance"
  >;
} = {}) {
  return (
    <>
      <section
        aria-labelledby="how-it-works-title"
        className="how-it-works"
        id="how-it-works"
      >
        <div className="how-it-works__lead container" data-motion-reveal>
          <div>
            <h2 id="how-it-works-title">{copy.heading}</h2>
            <p>{copy.description}</p>
          </div>
          <div className="how-it-works__photo">
            <Image
              alt={copy.photoAlt}
              fill
              loading={eagerImage ? "eager" : "lazy"}
              sizes="(max-width: 760px) 100vw, 48vw"
              src="/media/ygf-user-photo.png"
            />
          </div>
        </div>

        <div
          className="campaign-steps-wrap container"
          data-motion-journey
          data-motion-reveal
        >
          <span
            aria-hidden="true"
            className="campaign-steps__progress"
            data-motion-journey-progress
          />
          <ol className="campaign-steps">
            {copy.steps.map(({ description, title }, index) => {
              const { icon: Icon } = stepVisuals[index];

              return (
                <li
                  className="campaign-step"
                  data-motion-journey-step
                  key={title}
                >
                  <span aria-hidden="true" className="campaign-step__number">
                    {index + 1}
                  </span>
                  <Icon
                    aria-hidden="true"
                    className="campaign-step__icon"
                    strokeWidth={1.6}
                  />
                  <h3>{title}</h3>
                  <p>{description}</p>
                </li>
              );
            })}
          </ol>
        </div>

        {handoff ? (
          <div
            className="campaign-handoff container"
            data-campaign-handoff
            data-motion-reveal
          >
            <p>{handoff.guidance}</p>
            <ButtonLink
              className="campaign-handoff__cta"
              href="/redeem"
            >
              <span
                aria-hidden="true"
                className="campaign-handoff__step-number"
              >
                01
              </span>
              {" "}
              <span>{handoff.claimCredits}</span>
              <ArrowRight aria-hidden="true" size={20} strokeWidth={2} />
            </ButtonLink>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="busy-week-title" className="busy-week">
        <div className="busy-week__inner container" data-motion-reveal>
          <div>
            <h2 id="busy-week-title">{copy.busyHeading}</h2>
            <p>{copy.busyDescription}</p>
          </div>
          <BusyWeekIllustration />
        </div>
      </section>
    </>
  );
}
