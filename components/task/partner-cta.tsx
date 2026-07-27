import { Share2 } from "lucide-react";

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
      <Share2 aria-hidden="true" />
      <div>
        <strong>Keep building with OpenRouter</strong>
        <span>
          Explore an optional partner account for more models and
          higher limits.
        </span>
      </div>
      <a href="/connect/openrouter">Connect account</a>
    </aside>
  );
}
