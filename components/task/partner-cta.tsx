"use client";

import Link from "next/link";
import { Bot } from "lucide-react";

import { useCampaignLanguage } from "@/components/campaign-language";
import { workspaceCopy } from "@/lib/i18n/workspace";

export function PartnerCta({
  eligible,
}: {
  eligible: boolean;
}) {
  const { locale } = useCampaignLanguage();
  const copy = workspaceCopy[locale].task.partner;

  if (!eligible) {
    return null;
  }
  return (
    <aside className="partner-cta">
      <Bot aria-hidden="true" />
      <div>
        <strong>{copy.title}</strong>
        <span>{copy.description}</span>
      </div>
      <Link href="/connect/agent">{copy.action}</Link>
    </aside>
  );
}
