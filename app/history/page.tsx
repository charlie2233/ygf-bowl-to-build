import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  HistoryPageView,
  type HistoryDisplaySession,
} from "@/components/customer-page-views";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { friendlyModelKey } from "@/lib/providers/model-catalog";
import { parseTaskOutput } from "@/lib/providers/provider";
import { getTaskWorkflowRepository } from "@/lib/repositories/task-workflow-repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Build history",
};

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
  const displaySessions: readonly HistoryDisplaySession[] = sessions.map(
    (session) => {
      let savedOutput;
      try {
        savedOutput = session.savedOutput
          ? parseTaskOutput(JSON.parse(session.savedOutput))
          : undefined;
      } catch {
        savedOutput = undefined;
      }
      return {
        createdAt: session.createdAt,
        modelLabelKey: friendlyModelKey(session.model),
        savedOutput,
        status: session.status,
        title: session.title,
      };
    },
  );

  return (
    <HistoryPageView
      agentEligible={completed}
      sessions={displaySessions}
    />
  );
}
