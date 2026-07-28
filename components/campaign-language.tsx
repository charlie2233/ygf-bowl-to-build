"use client";

import { Languages } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  campaignHomeCopy,
  campaignLanguageOptions,
  type CampaignLocale,
} from "@/lib/i18n/campaign";

const STORAGE_KEY = "ygf-campaign-language";
const LANGUAGE_CHANGE_EVENT = "ygf-campaign-language-change";

type CampaignLanguageContextValue = Readonly<{
  locale: CampaignLocale;
  setLocale: (locale: CampaignLocale) => void;
}>;

const CampaignLanguageContext =
  createContext<CampaignLanguageContextValue>({
    locale: "en",
    setLocale: () => undefined,
  });

function isCampaignLocale(value: string | null): value is CampaignLocale {
  return campaignLanguageOptions.some(({ locale }) => locale === value);
}

function getCampaignLocaleSnapshot(): CampaignLocale {
  const storedLocale = window.localStorage.getItem(STORAGE_KEY);
  return isCampaignLocale(storedLocale) ? storedLocale : "en";
}

function subscribeToCampaignLocale(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(LANGUAGE_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, onStoreChange);
  };
}

export function CampaignLanguageProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const locale = useSyncExternalStore<CampaignLocale>(
    subscribeToCampaignLocale,
    getCampaignLocaleSnapshot,
    () => "en",
  );

  const setLocale = useCallback((nextLocale: CampaignLocale) => {
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
    window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
  }, []);

  useEffect(() => {
    document.documentElement.lang =
      campaignHomeCopy[locale].documentLanguage;
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
    }),
    [locale, setLocale],
  );

  return (
    <CampaignLanguageContext.Provider value={value}>
      {children}
    </CampaignLanguageContext.Provider>
  );
}

export function useCampaignLanguage() {
  return useContext(CampaignLanguageContext);
}

export function CampaignLanguageSelector({
  label,
}: Readonly<{ label: string }>) {
  const { locale, setLocale } = useCampaignLanguage();
  const current =
    campaignLanguageOptions.find((option) => option.locale === locale) ??
    campaignLanguageOptions[0];

  return (
    <label className="language-selector">
      <Languages aria-hidden="true" className="language-selector__icon" />
      <span aria-hidden="true" className="language-selector__code">
        {current.code}
      </span>
      <span className="visually-hidden">{label}</span>
      <select
        aria-label={label}
        onChange={(event) => {
          const nextLocale = event.currentTarget.value;
          if (isCampaignLocale(nextLocale)) {
            setLocale(nextLocale);
          }
        }}
        value={locale}
      >
        {campaignLanguageOptions.map((option) => (
          <option key={option.locale} value={option.locale}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LocalizedSkipLink() {
  const { locale } = useCampaignLanguage();

  return (
    <a className="skip-link" href="#main-content">
      {campaignHomeCopy[locale].skipLink}
    </a>
  );
}
