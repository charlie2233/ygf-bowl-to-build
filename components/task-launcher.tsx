"use client";

import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Laptop,
  Soup,
} from "lucide-react";
import { useState } from "react";

import { useCampaignLanguage } from "@/components/campaign-language";
import {
  workspaceCopy,
  type WorkspaceTaskType,
} from "@/lib/i18n/workspace";

const tasks = [
  {
    icon: BookOpen,
    type: "study" satisfies WorkspaceTaskType,
  },
  {
    icon: Laptop,
    type: "coding" satisfies WorkspaceTaskType,
  },
  {
    icon: BriefcaseBusiness,
    type: "career" satisfies WorkspaceTaskType,
  },
  {
    icon: Soup,
    type: "pick-my-bowl" satisfies WorkspaceTaskType,
  },
] as const;

export function TaskLauncher() {
  const { locale } = useCampaignLanguage();
  const copy = workspaceCopy[locale].wallet.tasks;
  const [model, setModel] = useState("best");

  return (
    <section className="task-launcher">
      <h2>{copy.heading}</h2>
      <div className="task-launcher__grid">
        {tasks.map(({ icon: Icon, type }) => {
          const preset = copy.presets[type];

          return (
            <a
              className="task-launcher__item"
              href={`/task/${type}?model=${model}`}
              key={type}
            >
              <Icon aria-hidden="true" />
              <strong>{preset.label}</strong>
              <span>{preset.description}</span>
              <ArrowRight aria-hidden="true" />
            </a>
          );
        })}
      </div>
      <details className="model-choice">
        <summary>{copy.advancedSummary}</summary>
        <label htmlFor="wallet-model">{copy.modelPreference}</label>
        <select
          id="wallet-model"
          onChange={(event) => setModel(event.target.value)}
          value={model}
        >
          <option value="best">{copy.modelOptions.best}</option>
          <option value="fast">{copy.modelOptions.fast}</option>
          <option value="reasoning">{copy.modelOptions.reasoning}</option>
        </select>
        <p>{copy.costNote}</p>
      </details>
    </section>
  );
}
