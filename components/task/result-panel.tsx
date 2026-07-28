"use client";

import {
  Check,
  Clipboard,
  Download,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";

import { useCampaignLanguage } from "@/components/campaign-language";
import { copyText } from "@/lib/browser/copy-text";
import type { TaskOutput } from "@/lib/providers/provider";
import { workspaceCopy } from "@/lib/i18n/workspace";

function outputAsText(output: TaskOutput) {
  return [
    output.title,
    ...output.sections.flatMap((section) => [
      "",
      section.heading,
      ...section.items.map((item) => `• ${item}`),
    ]),
  ].join("\n");
}

function parseFlashcard(item: string) {
  const match = /^Q:\s*(.+?)\s+—\s+A:\s*(.+)$/u.exec(item.trim());

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    answer: match[2],
    question: match[1],
  };
}

export function ResultPanel({
  onReset,
  onSave,
  output,
}: {
  onReset: () => void;
  onSave: () => Promise<void>;
  output: TaskOutput;
}) {
  const { locale } = useCampaignLanguage();
  const resultCopy = workspaceCopy[locale].task.result;
  const [copyState, setCopyState] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  async function copyResult() {
    try {
      await copyText(outputAsText(output));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  async function save() {
    setSaveState("saving");
    try {
      await onSave();
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <section
      aria-labelledby="task-result-title"
      className="result-panel"
    >
      <header className="result-panel__header">
        <span aria-hidden="true" className="result-panel__success">
          <Check />
        </span>
        <div>
          <h2 id="task-result-title">{output.title}</h2>
          <p>{resultCopy.generatedNow}</p>
        </div>
        <div className="result-panel__actions">
          <button aria-live="polite" onClick={copyResult} type="button">
            {copyState === "copied" ? (
              <Check aria-hidden="true" />
            ) : (
              <Clipboard aria-hidden="true" />
            )}
            {copyState === "copied"
              ? resultCopy.copied
              : copyState === "error"
                ? resultCopy.copyError
                : resultCopy.copy}
          </button>
          <button
            disabled={saveState === "saving" || saveState === "saved"}
            onClick={save}
            type="button"
          >
            <Download aria-hidden="true" />
            {saveState === "saving"
              ? resultCopy.saving
              : saveState === "saved"
                ? resultCopy.savedToHistory
                : resultCopy.save}
          </button>
          <button onClick={onReset} type="button">
            <RefreshCw aria-hidden="true" />
            {resultCopy.startAnother}
          </button>
        </div>
      </header>

      {saveState === "error" ? (
        <p className="result-panel__save-error" role="alert">
          {resultCopy.saveError}
        </p>
      ) : null}

      <div className="result-panel__content">
        {output.sections.map((section) => {
          const flashcards = section.items.map(parseFlashcard);
          const isFlashcardSection =
            /flashcards?/iu.test(section.heading) &&
            flashcards.every((flashcard) => flashcard !== null);

          return (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              {isFlashcardSection ? (
                <ul className="result-panel__flashcards">
                  {flashcards.map((flashcard, index) => (
                    <li
                      className="result-panel__flashcard"
                      key={section.items[index]}
                    >
                      <span aria-hidden="true">Q</span>
                      <span>{flashcard?.question}</span>
                      <span aria-hidden="true">A</span>
                      <span>{flashcard?.answer}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
