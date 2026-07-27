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

import type { TaskDefinition } from "@/lib/content/tasks";

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
  return (
    <div aria-label={`${task.title} quick starts`} className="preset-list">
      {task.presets.map((preset, index) => {
        const Icon = ICONS[task.type][index] ?? ListChecks;
        return (
          <button
            aria-pressed={selectedId === preset.id}
            className="preset-list__item"
            key={preset.id}
            onClick={() => onSelect(preset.prompt, preset.id)}
            type="button"
          >
            <Icon aria-hidden="true" />
            <span>{preset.label}</span>
          </button>
        );
      })}
    </div>
  );
}
