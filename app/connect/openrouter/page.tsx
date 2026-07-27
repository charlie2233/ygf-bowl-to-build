import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Share2 } from "lucide-react";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/auth/user";
import { getTaskWorkflowRepository } from "@/lib/repositories/task-workflow-repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Continue with OpenRouter",
};

export default async function OpenRouterConnectPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/auth?next=/wallet");
  }
  const history = await getTaskWorkflowRepository().listHistory({
    userId: user.id,
  });
  if (!history.some((session) => session.status === "completed")) {
    redirect("/wallet");
  }

  return (
    <section className="partner-page">
      <div>
        <span aria-hidden="true" className="partner-page__icon">
          <Share2 />
        </span>
        <h1>Keep building with OpenRouter</h1>
        <p>
          You’ve completed a Bowl-to-Build task. OpenRouter is an
          optional partner destination for exploring more models and
          managing a separate provider account.
        </p>
        <p>
          Your YGF Build Credits do not transfer, and we do not send
          your prompts or campaign history to OpenRouter.
        </p>
        <div className="partner-page__actions">
          <form action="/api/events" method="post">
            <button className="button button--primary" type="submit">
              Visit OpenRouter <ExternalLink aria-hidden="true" />
            </button>
          </form>
          <Link className="button button--secondary" href="/wallet">
            Back to wallet
          </Link>
        </div>
      </div>
    </section>
  );
}
