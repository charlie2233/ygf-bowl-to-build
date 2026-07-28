"use client";

import { SiteFooter } from "@/components/site-footer";
import { useCampaignLanguage } from "@/components/campaign-language";
import { campaignHomeCopy } from "@/lib/i18n/campaign";
import type { SiteLocale } from "@/lib/i18n/site";

const availabilityCopy: Readonly<Record<SiteLocale, string | null>> = {
  en: null,
  es: "Este contenido legal u operativo se ofrece actualmente en inglés para evitar traducciones imprecisas. El recorrido principal del cliente sí está disponible en español.",
  fr: "Ce contenu juridique ou opérationnel est actuellement proposé en anglais afin d’éviter toute traduction imprécise. Le parcours client principal reste disponible en français.",
  ru: "Юридические и рабочие инструкции пока представлены на английском, чтобы избежать неточного перевода. Основной путь пользователя доступен на русском языке.",
  zh: "为避免法律或门店操作说明出现误译，本页正文目前保留英文；顾客领取和使用 AI Credits 的主流程仍支持中文。",
};

export function EnglishOnlyContentNotice() {
  const { locale } = useCampaignLanguage();
  const message = availabilityCopy[locale];

  if (!message) {
    return null;
  }

  return (
    <aside className="language-availability container" role="note">
      {message}
    </aside>
  );
}

export function LocalizedSiteFooter() {
  const { locale } = useCampaignLanguage();

  return <SiteFooter copy={campaignHomeCopy[locale].footer} />;
}
