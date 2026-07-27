import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PartnerCta } from "@/components/task/partner-cta";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { friendlyModelName } from "@/lib/providers/model-catalog";
import { parseTaskOutput } from "@/lib/providers/provider";
import { getTaskWorkflowRepository } from "@/lib/repositories/task-workflow-repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Build history",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function HistoryPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/auth?next=/wallet");
  }
  const sessions = await getTaskWorkflowRepository().listHistory({
    userId: user.id,
  });
  const completed = sessions.some(
    (session) => session.status === "completed",
  );

  return (
    <section className="history-page container">
      <header>
        <div>
          <Link href="/wallet">‹ Wallet</Link>
          <h1>Build history</h1>
          <p>
            Prompt text is not retained. Full results appear here only
            when you explicitly save them.
          </p>
        </div>
      </header>

      {sessions.length === 0 ? (
        <div className="history-empty">
          <h2>No tasks yet</h2>
          <p>Your completed and failed task metadata will appear here.</p>
          <Link className="button button--primary" href="/wallet">
            Choose a task
          </Link>
        </div>
      ) : (
        <ol className="history-list">
          {sessions.map((session) => {
            let savedOutput;
            try {
              savedOutput = session.savedOutput
                ? parseTaskOutput(JSON.parse(session.savedOutput))
                : undefined;
            } catch {
              savedOutput = undefined;
            }
            return (
              <li key={session.id}>
                <header>
                  <div>
                    <h2>{session.title}</h2>
                    <p>
                      {formatDate(session.createdAt)} ·{" "}
                      {friendlyModelName(session.model)}
                    </p>
                  </div>
                  <span data-status={session.status}>
                    {session.status}
                  </span>
                </header>
                {savedOutput ? (
                  <div className="history-list__saved">
                    {savedOutput.sections.map((section) => (
                      <section key={section.heading}>
                        <h3>{section.heading}</h3>
                        <ul>
                          {section.items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                ) : (
                  <p className="history-list__privacy">
                    Result not saved · prompt not retained
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <PartnerCta eligible={completed} />
    </section>
  );
}
