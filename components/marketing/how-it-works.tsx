import { CheckCircle2, Soup, Ticket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";

type CampaignStep = Readonly<{
  description: string;
  icon: LucideIcon;
  title: string;
}>;

const steps = [
  {
    title: "Buy a bowl",
    description: "Spend $16+ in one transaction.",
    icon: Soup,
  },
  {
    title: "Claim your code",
    description: "Get your code at checkout.",
    icon: Ticket,
  },
  {
    title: "Use Build Credits",
    description: "Redeem your code and start building.",
    icon: CheckCircle2,
  },
] as const satisfies readonly CampaignStep[];

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

export function HowItWorks() {
  return (
    <>
      <section
        aria-labelledby="how-it-works-title"
        className="how-it-works"
        id="how-it-works"
      >
        <div className="how-it-works__lead container">
          <div>
            <h2 id="how-it-works-title">From checkout to build mode.</h2>
            <p>
              Spend $16+ in one transaction. Get your code at checkout. Credits
              expire 14 days after redemption.
            </p>
          </div>
          <div aria-hidden="true" className="how-it-works__photo">
            <Image
              alt=""
              fill
              sizes="(max-width: 760px) 100vw, 48vw"
              src="/media/malatang-hero.png"
            />
          </div>
        </div>

        <ol className="campaign-steps container">
          {steps.map(({ description, icon: Icon, title }, index) => (
            <li className="campaign-step" key={title}>
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
          ))}
        </ol>
      </section>

      <section aria-labelledby="busy-week-title" className="busy-week">
        <div className="busy-week__inner container">
          <div>
            <h2 id="busy-week-title">Built for a busy week.</h2>
            <p>
              Move-in, classes, projects, recruiting — get to a useful first
              result in under 90 seconds.
            </p>
          </div>
          <BusyWeekIllustration />
        </div>
      </section>
    </>
  );
}
