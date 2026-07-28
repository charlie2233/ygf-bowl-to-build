"use client";

import Link from "next/link";
import { WalletCards } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useCampaignLanguage } from "@/components/campaign-language";
import { PartnerCta } from "@/components/task/partner-cta";
import { PresetList } from "@/components/task/preset-list";
import { ResultPanel } from "@/components/task/result-panel";
import { browserRandomUuid } from "@/lib/browser/uuid";
import type { TaskDefinition } from "@/lib/content/tasks";
import {
  workspaceCopy,
  workspaceIntlLocales,
  type WorkspaceCopy,
  type WorkspaceTaskErrorKey,
} from "@/lib/i18n/workspace";
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

function taskErrorKey(error: unknown): WorkspaceTaskErrorKey {
  if (error instanceof Error) {
    switch (error.message) {
      case "INSUFFICIENT_CREDITS":
        return "insufficientCredits";
      case "WALLET_EXPIRED":
        return "walletExpired";
      case "PROVIDER_LIMIT_REACHED":
        return "providerLimit";
      case "TASK_THROTTLED":
        return "throttled";
      case "TASK_IN_PROGRESS":
        return "inProgress";
      case "RESULT_REPLAY_EXPIRED":
        return "replayExpired";
      case "TASK_IDEMPOTENCY_CONFLICT":
        return "retryConflict";
      case "PROVIDER_UNAVAILABLE":
      case "TASK_UNAVAILABLE":
        return "providerUnavailable";
    }
  }
  return "generic";
}

function localizedModelLabel(
  choice: FriendlyModelChoice,
  options: WorkspaceCopy["task"]["model"]["options"],
) {
  switch (choice.id) {
    case "best":
    case "balanced":
    case "fast":
    case "coding":
    case "reasoning":
      return options[choice.id];
    default:
      return choice.label;
  }
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
  const { locale } = useCampaignLanguage();
  const copy = workspaceCopy[locale].task;
  const taskCopy = copy.tasks[task.type];
  const intlLocale = workspaceIntlLocales[locale];
  const inputErrorId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [credits, setCredits] = useState(initialCredits);
  const [errorKey, setErrorKey] = useState<
    WorkspaceTaskErrorKey | "blankInput" | null
  >(null);
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
      setErrorKey("blankInput");
      inputRef.current?.focus();
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
        : browserRandomUuid();
    retryRef.current = { fingerprint, idempotencyKey };

    setErrorKey(null);
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
      setErrorKey(taskErrorKey(submissionError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function startAnother() {
    setErrorKey(null);
    setInput("");
    setResult(null);
    setSelectedPreset(undefined);
    retryRef.current = null;
  }

  return (
    <section className="task-workspace">
      <div className="task-workspace__topline">
        <Link href="/wallet">‹ {copy.backToWallet}</Link>
        <span>
          <WalletCards aria-hidden="true" />
          <strong>
            {copy.credits(credits.toLocaleString(intlLocale))}
          </strong>
        </span>
      </div>

      <div className="task-workspace__grid">
        <form className="task-composer" onSubmit={handleSubmit}>
          <h1>{taskCopy.title}</h1>
          <p>{copy.helpPrompt}</p>
          <PresetList
            onSelect={(prompt, id) => {
              setInput(prompt);
              setSelectedPreset(id);
              retryRef.current = null;
            }}
            selectedId={selectedPreset}
            task={task}
          />

          <label htmlFor="task-input">{taskCopy.inputLabel}</label>
          <textarea
            aria-describedby={
              errorKey === "blankInput" ? inputErrorId : undefined
            }
            aria-invalid={errorKey === "blankInput" ? true : undefined}
            id="task-input"
            maxLength={12_000}
            name="input"
            onChange={(event) => {
              setInput(event.target.value);
              if (errorKey === "blankInput") {
                setErrorKey(null);
              }
              setSelectedPreset(undefined);
              retryRef.current = null;
            }}
            placeholder={taskCopy.example}
            ref={inputRef}
            value={input}
          />
          <span className="task-composer__count">
            {copy.characterCount(
              input.length.toLocaleString(intlLocale),
              (12_000).toLocaleString(intlLocale),
            )}
          </span>

          <details className="task-model-choice">
            <summary>{copy.model.summary}</summary>
            <label htmlFor="task-model">
              {copy.model.preference}
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
                    {localizedModelLabel(choice, copy.model.options)}
                  </option>
                ))}
              </select>
            </label>
            <p>{copy.model.costNote}</p>
          </details>

          <button
            className="button button--primary task-composer__submit"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? copy.generating : copy.generate}
          </button>
          <p className="task-composer__review">{taskCopy.reviewNote}</p>
          {taskCopy.safetyNote ? (
            <p className="task-composer__safety">{taskCopy.safetyNote}</p>
          ) : null}
          <p
            aria-live="polite"
            className="task-composer__error"
            id={inputErrorId}
          >
            {errorKey
              ? errorKey === "blankInput"
                ? copy.blankInput
                : copy.errors[errorKey]
              : null}
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
              <h2>{copy.empty.title}</h2>
              <p>{copy.empty.description}</p>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
