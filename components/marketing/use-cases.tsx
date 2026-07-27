import { BookOpen, Briefcase, Laptop, Soup } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type UseCase = Readonly<{
  description: string;
  icon: LucideIcon;
  title: string;
  tone: "accent" | "primary";
}>;

const useCases = [
  {
    title: "Study",
    description: "Get explanations, summaries, and step-by-step help.",
    icon: BookOpen,
    tone: "primary",
  },
  {
    title: "Coding",
    description: "Debug, refactor, and build with AI pair programming.",
    icon: Laptop,
    tone: "accent",
  },
  {
    title: "Career",
    description: "Polish resumes, prep for interviews, and more.",
    icon: Briefcase,
    tone: "primary",
  },
  {
    title: "Pick My Bowl",
    description: "Get smarter bowl recommendations.",
    icon: Soup,
    tone: "accent",
  },
] as const satisfies readonly UseCase[];

export function UseCases() {
  return (
    <section
      aria-labelledby="use-cases-title"
      className="use-cases"
      id="use-cases"
    >
      <div className="container">
        <h2 id="use-cases-title">One pass. Four useful ways to build.</h2>
        <div className="use-cases__grid">
          {useCases.map(({ description, icon: Icon, title, tone }) => (
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
          ))}
        </div>
      </div>
    </section>
  );
}
