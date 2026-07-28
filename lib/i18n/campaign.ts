import type { PublicFaqItem } from "@/lib/content/legal";

export const campaignLocales = ["en", "zh", "es", "fr", "ru"] as const;

export type CampaignLocale = (typeof campaignLocales)[number];

type UseCaseCopy = Readonly<{
  description: string;
  title: string;
}>;

type CampaignStepCopy = Readonly<{
  description: string;
  title: string;
}>;

export type CampaignHomeCopy = Readonly<{
  documentLanguage: string;
  faq: Readonly<{
    heading: string;
    items: readonly PublicFaqItem[];
    viewAll: string;
  }>;
  footer: Readonly<{
    creatorKit: string;
    disclaimer: string;
    navigationLabel: string;
    privacy: string;
    staffHelp: string;
    terms: string;
  }>;
  header: Readonly<{
    faq: string;
    howItWorks: string;
    languageLabel: string;
    redeem: string;
  }>;
  hero: Readonly<{
    claimCredits: string;
    connectAgent: string;
    disclaimer: string;
    phoneAriaLabel: string;
    receipt: Readonly<{
      exampleOnly: string;
      expires: string;
      illustrativeCode: string;
      qualifyingPurchase: string;
      ready: string;
      scanOrEnter: string;
      status: string;
      total: string;
    }>;
    subhead: string;
    titleLineOne: string;
    titleLineTwo: string;
  }>;
  howItWorks: Readonly<{
    busyDescription: string;
    busyHeading: string;
    description: string;
    heading: string;
    photoAlt: string;
    steps: readonly CampaignStepCopy[];
  }>;
  skipLink: string;
  useCases: Readonly<{
    heading: string;
    items: readonly UseCaseCopy[];
  }>;
}>;

export const campaignLanguageOptions: ReadonlyArray<
  Readonly<{
    code: string;
    label: string;
    locale: CampaignLocale;
  }>
> = [
  { code: "EN", label: "English", locale: "en" },
  { code: "中", label: "中文", locale: "zh" },
  { code: "ES", label: "Español", locale: "es" },
  { code: "FR", label: "Français", locale: "fr" },
  { code: "RU", label: "Русский", locale: "ru" },
];

export const campaignHomeCopy: Record<
  CampaignLocale,
  CampaignHomeCopy
> = {
  en: {
    documentLanguage: "en",
    skipLink: "Skip to content",
    header: {
      howItWorks: "How it works",
      faq: "FAQ",
      redeem: "Redeem",
      languageLabel: "Language",
    },
    hero: {
      titleLineOne: "Buy a bowl.",
      titleLineTwo: "Build with AI.",
      subhead:
        "A qualifying YGF purchase unlocks limited Build Credits for study help, coding help, career tasks, and smarter bowl picks.",
      claimCredits: "Claim Build Credits",
      connectAgent: "Connect my Agent",
      disclaimer:
        "For the USC community. Not affiliated with or endorsed by USC.",
      phoneAriaLabel:
        "Illustration of a receipt QR and printed code that can be scanned or entered; example only, not live",
      receipt: {
        qualifyingPurchase: "Qualifying purchase",
        total: "Total",
        status: "Status",
        ready: "Ready",
        illustrativeCode: "Illustrative receipt code",
        scanOrEnter: "Scan receipt QR or enter code",
        exampleOnly: "Example only — not a live claim code.",
        expires: "Expires 14 days after redemption",
      },
    },
    useCases: {
      heading: "One pass. Four useful ways to build.",
      items: [
        {
          title: "Study",
          description: "Get explanations, summaries, and step-by-step help.",
        },
        {
          title: "Coding",
          description: "Debug, refactor, and build with AI pair programming.",
        },
        {
          title: "Career",
          description: "Polish resumes, prep for interviews, and more.",
        },
        {
          title: "Pick My Bowl",
          description: "Get smarter bowl recommendations.",
        },
      ],
    },
    howItWorks: {
      heading: "From checkout to build mode.",
      description:
        "Spend $16+ in one transaction. Get your code at checkout. Credits expire 14 days after redemption.",
      photoAlt: "Assorted YGF ingredients ready to choose at the counter",
      steps: [
        {
          title: "Buy a bowl",
          description: "Spend $16+ in one transaction.",
        },
        {
          title: "Claim your code",
          description: "Get your code at checkout.",
        },
        {
          title: "Use Build Credits",
          description: "Redeem your code and start building.",
        },
      ],
      busyHeading: "Built for a busy week.",
      busyDescription:
        "Move-in, classes, projects, recruiting — get to a useful first result in under 90 seconds.",
    },
    faq: {
      heading: "FAQ",
      viewAll: "View all questions",
      items: [
        {
          question: "Who’s eligible?",
          answer:
            "Guests who spend $16+ in one transaction and receive a code at checkout. One redemption per person/account.",
        },
        {
          question: "Is this official USC?",
          answer:
            "This promotion is offered by YGF for the USC community and is not sponsored, endorsed by, or administered by the University of Southern California.",
        },
        {
          question: "When do credits expire?",
          answer: "Credits expire 14 days after redemption.",
        },
        {
          question: "Do I need a school email?",
          answer:
            "No. Scan first to use a private guest wallet. Link Google or Apple only for recovery, cross-device access, or an Agent API key.",
        },
      ],
    },
    footer: {
      navigationLabel: "Footer navigation",
      terms: "Terms",
      privacy: "Privacy",
      creatorKit: "Creator kit",
      staffHelp: "Staff help",
      disclaimer:
        "For the USC community. Not affiliated with or endorsed by USC.",
    },
  },
  zh: {
    documentLanguage: "zh-CN",
    skipLink: "跳到主要内容",
    header: {
      howItWorks: "使用流程",
      faq: "常见问题",
      redeem: "兑换",
      languageLabel: "语言",
    },
    hero: {
      titleLineOne: "吃一碗。",
      titleLineTwo: "用 AI 开始创造。",
      subhead:
        "在 YGF 完成符合条件的消费，即可获得限量 Build Credits，用于学习、编程、求职和下一碗推荐。",
      claimCredits: "领取 Build Credits",
      connectAgent: "连接我的 Agent",
      disclaimer: "面向 USC 社区。本活动与 USC 无隶属关系，也未获其赞助或认可。",
      phoneAriaLabel:
        "可扫码或输入纸质兑换码的收据示意图；仅作示例，并非真实兑换码",
      receipt: {
        qualifyingPurchase: "符合条件的消费",
        total: "消费金额",
        status: "状态",
        ready: "可领取",
        illustrativeCode: "兑换码示意",
        scanOrEnter: "扫描收据二维码或输入兑换码",
        exampleOnly: "仅作示例，并非真实兑换码。",
        expires: "兑换后 14 天到期",
      },
    },
    useCases: {
      heading: "一张 Pass，四种实用方式。",
      items: [
        {
          title: "学习",
          description: "整理重点、解释难题，并获得分步骤帮助。",
        },
        {
          title: "编程",
          description: "调试、重构，并与 AI 一起完成项目。",
        },
        {
          title: "求职",
          description: "优化简历、准备面试以及更多任务。",
        },
        {
          title: "下一碗",
          description: "获得更聪明的麻辣烫搭配建议。",
        },
      ],
    },
    howItWorks: {
      heading: "从结账到开始创造。",
      description:
        "单笔消费满 $16。结账时领取兑换码。Credits 在兑换后 14 天到期。",
      photoAlt: "YGF 柜台中可自由选择的丰富食材",
      steps: [
        {
          title: "买一碗",
          description: "单笔消费满 $16。",
        },
        {
          title: "领取兑换码",
          description: "在结账时领取兑换码。",
        },
        {
          title: "使用 Credits",
          description: "兑换后立即开始使用 AI。",
        },
      ],
      busyHeading: "为忙碌的一周而生。",
      busyDescription:
        "搬家、上课、项目、求职——90 秒内获得第一个真正有用的结果。",
    },
    faq: {
      heading: "常见问题",
      viewAll: "查看全部问题",
      items: [
        {
          question: "谁可以参加？",
          answer:
            "单笔消费满 $16，并在结账时领取兑换码的顾客。每人或每个账户限兑换一次。",
        },
        {
          question: "这是 USC 官方活动吗？",
          answer:
            "本活动由 YGF 面向 USC 社区提供，并非由南加州大学赞助、认可或管理。",
        },
        {
          question: "Credits 什么时候到期？",
          answer: "Credits 在兑换后 14 天到期。",
        },
        {
          question: "需要学校邮箱吗？",
          answer:
            "不需要。扫码即可使用当前浏览器中的私密访客钱包。只有在需要找回、跨设备使用或 Agent API Key 时才需要连接 Google 或 Apple。",
        },
      ],
    },
    footer: {
      navigationLabel: "页脚导航",
      terms: "活动条款",
      privacy: "隐私",
      creatorKit: "创作者工具包",
      staffHelp: "员工帮助",
      disclaimer: "面向 USC 社区。本活动与 USC 无隶属关系，也未获其赞助或认可。",
    },
  },
  es: {
    documentLanguage: "es",
    skipLink: "Saltar al contenido",
    header: {
      howItWorks: "Cómo funciona",
      faq: "Preguntas",
      redeem: "Canjear",
      languageLabel: "Idioma",
    },
    hero: {
      titleLineOne: "Compra un bowl.",
      titleLineTwo: "Crea con IA.",
      subhead:
        "Una compra válida en YGF desbloquea Build Credits limitados para estudiar, programar, buscar empleo y elegir mejor tu próximo bowl.",
      claimCredits: "Obtener Build Credits",
      connectAgent: "Conectar mi Agent",
      disclaimer:
        "Para la comunidad de USC. No está afiliado ni respaldado por USC.",
      phoneAriaLabel:
        "Ilustración de un recibo con QR y código impreso; es solo un ejemplo y no sirve para canjear",
      receipt: {
        qualifyingPurchase: "Compra válida",
        total: "Total",
        status: "Estado",
        ready: "Listo",
        illustrativeCode: "Código ilustrativo",
        scanOrEnter: "Escanea el QR o escribe el código",
        exampleOnly: "Solo un ejemplo; no es un código real.",
        expires: "Vence 14 días después del canje",
      },
    },
    useCases: {
      heading: "Un pase. Cuatro formas útiles de crear.",
      items: [
        {
          title: "Estudio",
          description: "Obtén explicaciones, resúmenes y ayuda paso a paso.",
        },
        {
          title: "Programación",
          description: "Depura, refactoriza y crea junto con la IA.",
        },
        {
          title: "Carrera",
          description: "Mejora tu currículum y prepárate para entrevistas.",
        },
        {
          title: "Elige mi bowl",
          description: "Recibe recomendaciones más inteligentes para tu bowl.",
        },
      ],
    },
    howItWorks: {
      heading: "De la caja al modo creación.",
      description:
        "Gasta $16+ en una transacción. Recibe tu código en caja. Los Credits vencen 14 días después del canje.",
      photoAlt: "Ingredientes variados de YGF listos para elegir en el mostrador",
      steps: [
        {
          title: "Compra un bowl",
          description: "Gasta $16+ en una transacción.",
        },
        {
          title: "Recibe tu código",
          description: "Obtén tu código en caja.",
        },
        {
          title: "Usa tus Credits",
          description: "Canjea el código y empieza a crear.",
        },
      ],
      busyHeading: "Hecho para una semana ocupada.",
      busyDescription:
        "Mudanza, clases, proyectos y empleo: llega a un primer resultado útil en menos de 90 segundos.",
    },
    faq: {
      heading: "Preguntas frecuentes",
      viewAll: "Ver todas",
      items: [
        {
          question: "¿Quién puede participar?",
          answer:
            "Quienes gasten $16+ en una transacción y reciban un código en caja. Un canje por persona o cuenta.",
        },
        {
          question: "¿Es una actividad oficial de USC?",
          answer:
            "YGF ofrece esta promoción para la comunidad de USC. No está patrocinada, respaldada ni administrada por la Universidad del Sur de California.",
        },
        {
          question: "¿Cuándo vencen los Credits?",
          answer: "Los Credits vencen 14 días después del canje.",
        },
        {
          question: "¿Necesito un correo universitario?",
          answer:
            "No. Escanea primero para usar una billetera privada de invitado. Vincula Google o Apple solo para recuperación, uso en varios dispositivos o una API key de Agent.",
        },
      ],
    },
    footer: {
      navigationLabel: "Navegación del pie",
      terms: "Términos",
      privacy: "Privacidad",
      creatorKit: "Kit de creadores",
      staffHelp: "Ayuda al personal",
      disclaimer:
        "Para la comunidad de USC. No está afiliado ni respaldado por USC.",
    },
  },
  fr: {
    documentLanguage: "fr",
    skipLink: "Aller au contenu",
    header: {
      howItWorks: "Fonctionnement",
      faq: "FAQ",
      redeem: "Activer",
      languageLabel: "Langue",
    },
    hero: {
      titleLineOne: "Prenez un bowl.",
      titleLineTwo: "Créez avec l’IA.",
      subhead:
        "Un achat YGF admissible débloque des Build Credits limités pour étudier, coder, préparer votre carrière et mieux choisir votre prochain bowl.",
      claimCredits: "Obtenir des Build Credits",
      connectAgent: "Connecter mon Agent",
      disclaimer:
        "Pour la communauté USC. Sans affiliation ni approbation de l’USC.",
      phoneAriaLabel:
        "Illustration d’un reçu avec QR et code imprimé ; exemple uniquement, non utilisable",
      receipt: {
        qualifyingPurchase: "Achat admissible",
        total: "Total",
        status: "Statut",
        ready: "Prêt",
        illustrativeCode: "Code illustratif",
        scanOrEnter: "Scannez le QR ou saisissez le code",
        exampleOnly: "Exemple uniquement — code non valide.",
        expires: "Expire 14 jours après l’activation",
      },
    },
    useCases: {
      heading: "Un pass. Quatre façons utiles de créer.",
      items: [
        {
          title: "Études",
          description: "Obtenez des explications, résumés et étapes claires.",
        },
        {
          title: "Code",
          description: "Déboguez, refactorisez et créez avec l’IA.",
        },
        {
          title: "Carrière",
          description: "Améliorez votre CV et préparez vos entretiens.",
        },
        {
          title: "Choisir mon bowl",
          description: "Recevez des recommandations plus intelligentes.",
        },
      ],
    },
    howItWorks: {
      heading: "De la caisse au mode création.",
      description:
        "Dépensez 16 $ ou plus en une transaction. Recevez votre code en caisse. Les Credits expirent 14 jours après l’activation.",
      photoAlt: "Ingrédients YGF variés à choisir au comptoir",
      steps: [
        {
          title: "Prenez un bowl",
          description: "Dépensez 16 $ ou plus en une transaction.",
        },
        {
          title: "Recevez le code",
          description: "Obtenez votre code en caisse.",
        },
        {
          title: "Utilisez les Credits",
          description: "Activez le code et commencez à créer.",
        },
      ],
      busyHeading: "Pensé pour les semaines chargées.",
      busyDescription:
        "Installation, cours, projets, recrutement : obtenez un premier résultat utile en moins de 90 secondes.",
    },
    faq: {
      heading: "Questions fréquentes",
      viewAll: "Voir toutes les questions",
      items: [
        {
          question: "Qui peut participer ?",
          answer:
            "Les clients dépensant 16 $ ou plus en une transaction et recevant un code en caisse. Une activation par personne ou compte.",
        },
        {
          question: "Est-ce une activité officielle de l’USC ?",
          answer:
            "YGF propose cette promotion à la communauté USC. Elle n’est ni sponsorisée, ni approuvée, ni administrée par l’Université de Californie du Sud.",
        },
        {
          question: "Quand les Credits expirent-ils ?",
          answer: "Les Credits expirent 14 jours après l’activation.",
        },
        {
          question: "Faut-il une adresse e-mail universitaire ?",
          answer:
            "Non. Scannez d’abord pour utiliser un portefeuille invité privé. Liez Google ou Apple uniquement pour la récupération, l’accès multi-appareil ou une clé API Agent.",
        },
      ],
    },
    footer: {
      navigationLabel: "Navigation de pied de page",
      terms: "Conditions",
      privacy: "Confidentialité",
      creatorKit: "Kit créateur",
      staffHelp: "Aide au personnel",
      disclaimer:
        "Pour la communauté USC. Sans affiliation ni approbation de l’USC.",
    },
  },
  ru: {
    documentLanguage: "ru",
    skipLink: "Перейти к содержимому",
    header: {
      howItWorks: "Как это работает",
      faq: "Вопросы",
      redeem: "Активировать",
      languageLabel: "Язык",
    },
    hero: {
      titleLineOne: "Купите боул.",
      titleLineTwo: "Создавайте с ИИ.",
      subhead:
        "Подходящая покупка в YGF открывает ограниченные Build Credits для учёбы, программирования, карьеры и выбора следующего боула.",
      claimCredits: "Получить Build Credits",
      connectAgent: "Подключить мой Agent",
      disclaimer:
        "Для сообщества USC. Не связано с USC и не одобрено университетом.",
      phoneAriaLabel:
        "Иллюстрация чека с QR и печатным кодом; только пример, не для активации",
      receipt: {
        qualifyingPurchase: "Подходящая покупка",
        total: "Сумма",
        status: "Статус",
        ready: "Готово",
        illustrativeCode: "Пример кода",
        scanOrEnter: "Сканируйте QR или введите код",
        exampleOnly: "Только пример — код недействителен.",
        expires: "Истекает через 14 дней после активации",
      },
    },
    useCases: {
      heading: "Один pass. Четыре полезных сценария.",
      items: [
        {
          title: "Учёба",
          description: "Получайте объяснения, конспекты и помощь по шагам.",
        },
        {
          title: "Код",
          description: "Ищите ошибки, улучшайте и создавайте вместе с ИИ.",
        },
        {
          title: "Карьера",
          description: "Улучшайте резюме и готовьтесь к собеседованиям.",
        },
        {
          title: "Выбрать мой боул",
          description: "Получайте более точные рекомендации для боула.",
        },
      ],
    },
    howItWorks: {
      heading: "От кассы к режиму создания.",
      description:
        "Потратьте от $16 за одну покупку. Получите код на кассе. Credits действуют 14 дней после активации.",
      photoAlt: "Разнообразные ингредиенты YGF для выбора у стойки",
      steps: [
        {
          title: "Купите боул",
          description: "Потратьте от $16 за одну покупку.",
        },
        {
          title: "Получите код",
          description: "Заберите код на кассе.",
        },
        {
          title: "Используйте Credits",
          description: "Активируйте код и начинайте создавать.",
        },
      ],
      busyHeading: "Создано для насыщенной недели.",
      busyDescription:
        "Переезд, занятия, проекты, поиск работы — получите первый полезный результат менее чем за 90 секунд.",
    },
    faq: {
      heading: "Частые вопросы",
      viewAll: "Все вопросы",
      items: [
        {
          question: "Кто может участвовать?",
          answer:
            "Гости, потратившие от $16 за одну покупку и получившие код на кассе. Одна активация на человека или аккаунт.",
        },
        {
          question: "Это официальная акция USC?",
          answer:
            "YGF предлагает эту акцию сообществу USC. Университет Южной Калифорнии не спонсирует, не одобряет и не администрирует её.",
        },
        {
          question: "Когда истекают Credits?",
          answer: "Credits истекают через 14 дней после активации.",
        },
        {
          question: "Нужна университетская почта?",
          answer:
            "Нет. Сначала отсканируйте код и используйте приватный гостевой кошелёк. Google или Apple нужны только для восстановления, нескольких устройств или Agent API key.",
        },
      ],
    },
    footer: {
      navigationLabel: "Навигация внизу страницы",
      terms: "Условия",
      privacy: "Конфиденциальность",
      creatorKit: "Набор автора",
      staffHelp: "Помощь персоналу",
      disclaimer:
        "Для сообщества USC. Не связано с USC и не одобрено университетом.",
    },
  },
};
