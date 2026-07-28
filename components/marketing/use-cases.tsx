import { BookOpen, Briefcase, Laptop, Soup } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  campaignHomeCopy,
  type CampaignHomeCopy,
} from "@/lib/i18n/campaign";

type UseCaseVisual = Readonly<{
  icon: LucideIcon;
  tone: "accent" | "primary";
}>;

const useCaseVisuals = [
  {
    icon: BookOpen,
    tone: "primary",
  },
  {
    icon: Laptop,
    tone: "accent",
  },
  {
    icon: Briefcase,
    tone: "primary",
  },
  {
    icon: Soup,
    tone: "accent",
  },
] as const satisfies readonly UseCaseVisual[];

export function UseCases({
  copy = campaignHomeCopy.en.useCases,
}: Readonly<{
  copy?: CampaignHomeCopy["useCases"];
}> = {}) {
  return (
    <section
      aria-labelledby="use-cases-title"
      className="use-cases"
      data-motion-reveal
      id="use-cases"
    >
      <div className="container">
        <h2 id="use-cases-title">{copy.heading}</h2>
        <div className="use-cases__grid">
          {copy.items.map(({ description, title }, index) => {
            const { icon: Icon, tone } = useCaseVisuals[index];

            return (
              <article className="use-case" key={title}>
                <Icon
                  aria-hidden="true"
                  className={`use-case__icon use-case__icon--${tone}`}
                  strokeWidth={1.6}
                />
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
