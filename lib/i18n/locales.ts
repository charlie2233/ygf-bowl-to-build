export const supportedLocales = ["en", "zh", "es", "fr", "ru"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const supportedLanguageOptions: ReadonlyArray<
  Readonly<{
    code: string;
    label: string;
    locale: SupportedLocale;
  }>
> = [
  { code: "EN", label: "English", locale: "en" },
  { code: "中", label: "中文", locale: "zh" },
  { code: "ES", label: "Español", locale: "es" },
  { code: "FR", label: "Français", locale: "fr" },
  { code: "RU", label: "Русский", locale: "ru" },
];
