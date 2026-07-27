"use client";

import {
  Check,
  Clipboard,
  Download,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";

import type { TaskOutput } from "@/lib/providers/provider";

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
  const [copyState, setCopyState] = useState<"idle" | "copied">(
    "idle",
  );
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(outputAsText(output));
      setCopyState("copied");
    } catch {
      setCopyState("idle");
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
          <p>Generated just now</p>
        </div>
        <div className="result-panel__actions">
          <button onClick={copy} type="button">
            {copyState === "copied" ? <Check /> : <Clipboard />}
            {copyState === "copied" ? "Copied" : "Copy"}
          </button>
          <button
            disabled={saveState === "saving" || saveState === "saved"}
            onClick={save}
            type="button"
          >
            <Download />
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved to history"
                : "Save"}
          </button>
          <button onClick={onReset} type="button">
            <RefreshCw />
            Start another
          </button>
        </div>
      </header>

      {saveState === "error" ? (
        <p className="result-panel__save-error" role="alert">
          This result is no longer available to save. Copy it before
          leaving this page.
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
