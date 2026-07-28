import {
  BookOpen,
  Braces,
  CircleHelp,
  FileText,
  Lightbulb,
  ListChecks,
  Mail,
  MessageSquareText,
  RefreshCw,
  Soup,
  TestTube2,
  UserRoundSearch,
  Utensils,
  Vegan,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { useCampaignLanguage } from "@/components/campaign-language";
import type { TaskDefinition } from "@/lib/content/tasks";
import { workspaceCopy } from "@/lib/i18n/workspace";

const ICONS: Readonly<
  Record<TaskDefinition["type"], readonly LucideIcon[]>
> = {
  study: [BookOpen, FileText, CircleHelp, Lightbulb],
  coding: [CircleHelp, RefreshCw, TestTube2, Braces],
  career: [FileText, Mail, UserRoundSearch, MessageSquareText],
  "pick-my-bowl": [Soup, Zap, Vegan, Utensils],
};

export function PresetList({
  onSelect,
  selectedId,
  task,
}: {
  onSelect: (prompt: string, id: string) => void;
  selectedId?: string;
  task: TaskDefinition;
}) {
  const { locale } = useCampaignLanguage();
  const copy = workspaceCopy[locale].task.tasks[task.type];

  return (
    <div aria-label={copy.quickStartsLabel} className="preset-list">
      {task.presets.map((preset, index) => {
        const Icon = ICONS[task.type][index] ?? ListChecks;
        const label = copy.presets[index] ?? preset.label;
        const prompt = locale === "en" ? preset.prompt : label;

        return (
          <button
            aria-pressed={selectedId === preset.id}
            className="preset-list__item"
            key={preset.id}
            onClick={() => onSelect(prompt, preset.id)}
            type="button"
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
