"use client";

import Link from "next/link";
import { WalletCards } from "lucide-react";
import {
  useRef,
  useState,
  type FormEvent,
} from "react";

import { PartnerCta } from "@/components/task/partner-cta";
import { PresetList } from "@/components/task/preset-list";
import { ResultPanel } from "@/components/task/result-panel";
import type { TaskDefinition } from "@/lib/content/tasks";
import type { FriendlyModelChoice } from "@/lib/providers/model-catalog";
import type { TaskOutput } from "@/lib/providers/provider";

export interface TaskSubmission {
  idempotencyKey: string;
  input: string;
  model?: string;
  taskType: TaskDefinition["type"];
}

export interface BrowserTaskSuccess {
  friendlyModel: string;
  output: TaskOutput;
  remainingCredits: number;
  sessionId: string;
  status: "completed";
}

interface BrowserTaskFailure {
  error: string;
  remainingCredits?: number;
  sessionId?: string;
  status?: "failed";
}

async function defaultSubmitTask(
  submission: TaskSubmission,
): Promise<BrowserTaskSuccess> {
  const response = await fetch("/api/tasks", {
    body: JSON.stringify(submission),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as
    | BrowserTaskSuccess
    | BrowserTaskFailure;
  if (response.status === 401) {
    window.location.assign("/auth?next=/wallet");
    throw new Error("AUTHENTICATION_REQUIRED");
  }
  if (!response.ok || body.status !== "completed") {
    const error =
      "error" in body && typeof body.error === "string"
        ? body.error
        : "TASK_UNAVAILABLE";
    const failure = new Error(error) as Error & {
      remainingCredits?: number;
    };
    failure.remainingCredits = body.remainingCredits;
    throw failure;
  }
  return body;
}

async function defaultSaveTask(sessionId: string) {
  const response = await fetch("/api/tasks", {
    body: JSON.stringify({ sessionId }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  if (!response.ok) {
    throw new Error("RESULT_NO_LONGER_AVAILABLE");
  }
}

function taskError(error: unknown) {
  if (error instanceof Error) {
    switch (error.message) {
      case "INSUFFICIENT_CREDITS":
        return "You need 120 Build Credits for this task.";
      case "WALLET_EXPIRED":
        return "These Build Credits have expired.";
      case "PROVIDER_LIMIT_REACHED":
        return "This beta wallet reached its provider spending limit.";
      case "TASK_THROTTLED":
        return "Too many requests were made. Wait a minute and try again.";
      case "TASK_IN_PROGRESS":
        return "This task is still running. Wait a moment, then retry—the same request will not spend twice.";
      case "RESULT_REPLAY_EXPIRED":
        return "This completed retry is too old to replay. Start another task; the provider was not called again.";
      case "TASK_IDEMPOTENCY_CONFLICT":
        return "This retry no longer matches the original request. Start another task.";
      case "PROVIDER_UNAVAILABLE":
      case "TASK_UNAVAILABLE":
        return "AI is temporarily unavailable. Your 120 credits were not consumed if the provider failed.";
    }
  }
  return "We couldn’t generate this result. Try again shortly.";
}

export function TaskShell({
  initialCredits,
  initialModel = "best",
  modelChoices,
  saveTask = defaultSaveTask,
  submitTask = defaultSubmitTask,
  task,
}: {
  initialCredits: number;
  initialModel?: string;
  modelChoices: readonly FriendlyModelChoice[];
  saveTask?: (sessionId: string) => Promise<void>;
  submitTask?: (
    submission: TaskSubmission,
  ) => Promise<BrowserTaskSuccess>;
  task: TaskDefinition;
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [model, setModel] = useState(
    modelChoices.some((choice) => choice.id === initialModel)
      ? initialModel
      : "best",
  );
  const [result, setResult] = useState<BrowserTaskSuccess | null>(
    null,
  );
  const [selectedPreset, setSelectedPreset] = useState<
    string | undefined
  >();
  const retryRef = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = input.trim();
    if (!normalized) {
      setError("Tell us what you’re working on.");
      return;
    }
    const fingerprint = JSON.stringify({
      input: normalized,
      model,
      taskType: task.type,
    });
    const idempotencyKey =
      retryRef.current?.fingerprint === fingerprint
        ? retryRef.current.idempotencyKey
        : crypto.randomUUID();
    retryRef.current = { fingerprint, idempotencyKey };

    setError(null);
    setIsSubmitting(true);
    try {
      const response = await submitTask({
        idempotencyKey,
        input: normalized,
        ...(model === "best" ? {} : { model }),
        taskType: task.type,
      });
      setCredits(response.remainingCredits);
      setResult(response);
    } catch (submissionError) {
      if (
        submissionError instanceof Error &&
        "remainingCredits" in submissionError &&
        typeof submissionError.remainingCredits === "number"
      ) {
        setCredits(submissionError.remainingCredits);
      }
      setError(taskError(submissionError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function startAnother() {
    setError(null);
    setInput("");
    setResult(null);
    setSelectedPreset(undefined);
    retryRef.current = null;
  }

  return (
    <section className="task-workspace">
      <div className="task-workspace__topline">
        <Link href="/wallet">‹ Wallet</Link>
        <span>
          <WalletCards aria-hidden="true" />
          <strong>{credits.toLocaleString("en-US")} credits</strong>
        </span>
      </div>

      <div className="task-workspace__grid">
        <form className="task-composer" onSubmit={handleSubmit}>
          <h1>{task.title}</h1>
          <p>What would you like help with?</p>
          <PresetList
            onSelect={(prompt, id) => {
              setInput(prompt);
              setSelectedPreset(id);
              retryRef.current = null;
            }}
            selectedId={selectedPreset}
            task={task}
          />

          <label htmlFor="task-input">{task.inputLabel}</label>
          <textarea
            id="task-input"
            maxLength={12_000}
            name="input"
            onChange={(event) => {
              setInput(event.target.value);
              setSelectedPreset(undefined);
              retryRef.current = null;
            }}
            placeholder={task.example}
            value={input}
          />
          <span className="task-composer__count">
            {input.length.toLocaleString("en-US")}/12,000
          </span>

          <details className="task-model-choice">
            <summary>Advanced: choose a model</summary>
            <label htmlFor="task-model">
              Model preference
              <select
                id="task-model"
                onChange={(event) => {
                  setModel(event.target.value);
                  retryRef.current = null;
                }}
                value={model}
              >
                {modelChoices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Every beta choice spends the same 120 Build Credits.
              Only server-allowlisted models are available.
            </p>
          </details>

          <button
            className="button button--primary task-composer__submit"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Generating…" : "Generate"}
          </button>
          <p className="task-composer__review">{task.reviewNote}</p>
          {task.safetyNote ? (
            <p className="task-composer__safety">{task.safetyNote}</p>
          ) : null}
          <p aria-live="polite" className="task-composer__error">
            {error}
          </p>
        </form>

        <div className="task-result-column">
          {result ? (
            <>
              <ResultPanel
                onReset={startAnother}
                onSave={() => saveTask(result.sessionId)}
                output={result.output}
              />
              <PartnerCta eligible />
            </>
          ) : (
            <section className="task-empty-state" aria-live="polite">
              <span aria-hidden="true">✦</span>
              <h2>Your result will appear here</h2>
              <p>
                Choose a quick start or describe what you need. One
                generation uses 120 Build Credits.
              </p>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
