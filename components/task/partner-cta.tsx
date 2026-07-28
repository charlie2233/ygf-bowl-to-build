import Link from "next/link";
import { Bot } from "lucide-react";

export function PartnerCta({
  eligible,
}: {
  eligible: boolean;
}) {
  if (!eligible) {
    return null;
  }
  return (
    <aside className="partner-cta">
      <Bot aria-hidden="true" />
      <div>
        <strong>Connect my Agent</strong>
        <span>
          Create a personal, revocable YGF API key backed by your
          wallet’s remaining Credits.
        </span>
      </div>
      <Link href="/connect/agent">Set up Agent</Link>
    </aside>
  );
}
