"use client";

import { Languages } from "lucide-react";
import { usePathname } from "next/navigation";
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
  isSiteLocale,
  SITE_LANGUAGE_CHANGE_EVENT,
  SITE_LOCALE_COOKIE,
  SITE_LOCALE_STORAGE_KEY,
  siteLanguageOptions,
  siteNavigationCopy,
  type SiteLocale,
} from "@/lib/i18n/site";

type CampaignLanguageContextValue = Readonly<{
  locale: SiteLocale;
  setLocale: (locale: SiteLocale) => void;
}>;

const CampaignLanguageContext =
  createContext<CampaignLanguageContextValue>({
    locale: "en",
    setLocale: () => undefined,
  });

function subscribeToCampaignLocale(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SITE_LANGUAGE_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(SITE_LANGUAGE_CHANGE_EVENT, onStoreChange);
  };
}

function readBrowserLocaleCookie(): SiteLocale | null {
  const cookiePrefix = `${SITE_LOCALE_COOKIE}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookiePrefix));

  if (!cookie) {
    return null;
  }

  const value = cookie.slice(cookiePrefix.length);
  return isSiteLocale(value) ? value : null;
}

function writeBrowserLocaleCookie(locale: SiteLocale) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SITE_LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function CampaignLanguageProvider({
  children,
  initialLocale = "en",
}: Readonly<{
  children: ReactNode;
  initialLocale?: SiteLocale;
}>) {
  const pathname = usePathname();
  const lockedLocale: SiteLocale | undefined = pathname.startsWith("/admin")
    ? "en"
    : undefined;
  const getClientSnapshot = useCallback((): SiteLocale => {
    if (lockedLocale) {
      return lockedLocale;
    }
    const storedLocale = window.localStorage.getItem(
      SITE_LOCALE_STORAGE_KEY,
    );
    return isSiteLocale(storedLocale) ? storedLocale : initialLocale;
  }, [initialLocale, lockedLocale]);
  const getServerSnapshot = useCallback(
    (): SiteLocale => lockedLocale ?? initialLocale,
    [initialLocale, lockedLocale],
  );
  const locale = useSyncExternalStore<SiteLocale>(
    subscribeToCampaignLocale,
    getClientSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    document.documentElement.dataset.campaignLanguageReady = "true";
    return () => {
      delete document.documentElement.dataset.campaignLanguageReady;
    };
  }, []);

  const setLocale = useCallback(
    (nextLocale: SiteLocale) => {
      if (lockedLocale) {
        return;
      }
      window.localStorage.setItem(SITE_LOCALE_STORAGE_KEY, nextLocale);
      writeBrowserLocaleCookie(nextLocale);
      document.documentElement.lang =
        siteNavigationCopy[nextLocale].documentLanguage;
      window.dispatchEvent(new Event(SITE_LANGUAGE_CHANGE_EVENT));
    },
    [lockedLocale],
  );

  useEffect(() => {
    document.documentElement.lang =
      siteNavigationCopy[locale].documentLanguage;

    if (lockedLocale) {
      return;
    }

    const storedLocale = window.localStorage.getItem(
      SITE_LOCALE_STORAGE_KEY,
    );
    if (!isSiteLocale(storedLocale)) {
      window.localStorage.setItem(SITE_LOCALE_STORAGE_KEY, locale);
    }

    if (readBrowserLocaleCookie() !== locale) {
      writeBrowserLocaleCookie(locale);
    }
  }, [locale, lockedLocale]);

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
    siteLanguageOptions.find((option) => option.locale === locale) ??
    siteLanguageOptions[0];

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
          if (isSiteLocale(nextLocale)) {
            setLocale(nextLocale);
          }
        }}
        value={locale}
      >
        {siteLanguageOptions.map((option) => (
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
      {siteNavigationCopy[locale].skipLink}
    </a>
  );
}
