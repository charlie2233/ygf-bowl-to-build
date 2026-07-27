"use client";

import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Laptop,
  Soup,
} from "lucide-react";
import { useState } from "react";

const tasks = [
  {
    description: "Turn notes into a study guide",
    icon: BookOpen,
    label: "Study",
    type: "study",
  },
  {
    description: "Explain an error or refactor code",
    icon: Laptop,
    label: "Coding",
    type: "coding",
  },
  {
    description: "Sharpen a resume or outreach",
    icon: BriefcaseBusiness,
    label: "Career",
    type: "career",
  },
  {
    description: "Build a bowl for your budget",
    icon: Soup,
    label: "Pick My Bowl",
    type: "pick-my-bowl",
  },
] as const;

export function TaskLauncher() {
  const [model, setModel] = useState("best");

  return (
    <section className="task-launcher">
      <h2>Choose a quick start</h2>
      <div className="task-launcher__grid">
        {tasks.map(({ description, icon: Icon, label, type }) => (
          <a
            className="task-launcher__item"
            href={`/task/${type}?model=${model}`}
            key={type}
          >
            <Icon aria-hidden="true" />
            <strong>{label}</strong>
            <span>{description}</span>
            <ArrowRight aria-hidden="true" />
          </a>
        ))}
      </div>
      <details className="model-choice">
        <summary>Advanced: choose a model</summary>
        <label htmlFor="wallet-model">Model preference</label>
        <select
          id="wallet-model"
          onChange={(event) => setModel(event.target.value)}
          value={model}
        >
          <option value="best">Best for this task</option>
          <option value="fast">Fast and focused</option>
          <option value="reasoning">Deeper reasoning</option>
        </select>
        <p>
          Every beta choice spends the same 120 Build Credits. Only
          server-allowlisted models are available.
        </p>
      </details>
    </section>
  );
}
