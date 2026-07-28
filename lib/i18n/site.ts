import {
  supportedLanguageOptions,
  supportedLocales,
  type SupportedLocale,
} from "@/lib/i18n/locales";

export const siteLocales = supportedLocales;

export type SiteLocale = SupportedLocale;

export const SITE_LOCALE_COOKIE = "ygf-locale";
export const SITE_LOCALE_STORAGE_KEY = "ygf-campaign-language";
export const SITE_LANGUAGE_CHANGE_EVENT = "ygf-campaign-language-change";
export const SITE_PATHNAME_HEADER = "x-ygf-pathname";

export const siteLanguageOptions = supportedLanguageOptions;

type SiteNavigationCopy = Readonly<{
  documentLanguage: string;
  public: Readonly<{
    faq: string;
    howItWorks: string;
    languageLabel: string;
    navigationLabel: string;
    redeem: string;
  }>;
  skipLink: string;
  workspace: Readonly<{
    agent: string;
    help: string;
    history: string;
    mobileNavigationLabel: string;
    navigationLabel: string;
    openAccountMenu: string;
    signOut: string;
    wallet: string;
  }>;
}>;

export const siteNavigationCopy: Record<SiteLocale, SiteNavigationCopy> = {
  en: {
    documentLanguage: "en",
    skipLink: "Skip to content",
    public: {
      faq: "FAQ",
      howItWorks: "How it works",
      languageLabel: "Language",
      navigationLabel: "Primary navigation",
      redeem: "Redeem",
    },
    workspace: {
      agent: "Agent",
      help: "Help",
      history: "History",
      mobileNavigationLabel: "Mobile workspace navigation",
      navigationLabel: "Workspace navigation",
      openAccountMenu: "Open account menu",
      signOut: "Sign out",
      wallet: "Wallet",
    },
  },
  zh: {
    documentLanguage: "zh-CN",
    skipLink: "跳到主要内容",
    public: {
      faq: "常见问题",
      howItWorks: "使用流程",
      languageLabel: "语言",
      navigationLabel: "主导航",
      redeem: "兑换",
    },
    workspace: {
      agent: "Agent",
      help: "帮助",
      history: "历史",
      mobileNavigationLabel: "移动端工作区导航",
      navigationLabel: "工作区导航",
      openAccountMenu: "打开账户菜单",
      signOut: "退出登录",
      wallet: "钱包",
    },
  },
  es: {
    documentLanguage: "es",
    skipLink: "Saltar al contenido",
    public: {
      faq: "Preguntas",
      howItWorks: "Cómo funciona",
      languageLabel: "Idioma",
      navigationLabel: "Navegación principal",
      redeem: "Canjear",
    },
    workspace: {
      agent: "Agent",
      help: "Ayuda",
      history: "Historial",
      mobileNavigationLabel: "Navegación móvil del espacio de trabajo",
      navigationLabel: "Navegación del espacio de trabajo",
      openAccountMenu: "Abrir menú de cuenta",
      signOut: "Salir",
      wallet: "Saldo",
    },
  },
  fr: {
    documentLanguage: "fr",
    skipLink: "Aller au contenu",
    public: {
      faq: "FAQ",
      howItWorks: "Fonctionnement",
      languageLabel: "Langue",
      navigationLabel: "Navigation principale",
      redeem: "Activer",
    },
    workspace: {
      agent: "Agent",
      help: "Aide",
      history: "Historique",
      mobileNavigationLabel: "Navigation mobile de l’espace de travail",
      navigationLabel: "Navigation de l’espace de travail",
      openAccountMenu: "Ouvrir le menu du compte",
      signOut: "Déconnexion",
      wallet: "Solde",
    },
  },
  ru: {
    documentLanguage: "ru",
    skipLink: "Перейти к содержимому",
    public: {
      faq: "Вопросы",
      howItWorks: "Как это работает",
      languageLabel: "Язык",
      navigationLabel: "Основная навигация",
      redeem: "Активировать",
    },
    workspace: {
      agent: "Agent",
      help: "Помощь",
      history: "История",
      mobileNavigationLabel: "Мобильная навигация рабочего пространства",
      navigationLabel: "Навигация рабочего пространства",
      openAccountMenu: "Открыть меню аккаунта",
      signOut: "Выйти",
      wallet: "Баланс",
    },
  },
};

export function isSiteLocale(value: string | null | undefined): value is SiteLocale {
  return siteLocales.some((locale) => locale === value);
}

export function resolveSiteLocale(
  value: string | null | undefined,
): SiteLocale {
  return isSiteLocale(value) ? value : "en";
}
