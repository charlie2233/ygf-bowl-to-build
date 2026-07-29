import type { PublicFaqItem } from "@/lib/content/legal";
import {
  supportedLanguageOptions,
  supportedLocales,
  type SupportedLocale,
} from "@/lib/i18n/locales";

export const campaignLocales = supportedLocales;

export type CampaignLocale = SupportedLocale;

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
    guidance: string;
    imageAlt: string;
    phoneAriaLabel: string;
    rewardContext: string;
    stepOne: string;
    stepTwo: string;
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

export const campaignLanguageOptions = supportedLanguageOptions;

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
        "Spend $25+ at YGF, get an AI card at checkout, then scan or enter its private code to unlock 3,000 AI Credits for 14 days.",
      guidance:
        "New here? Start with Step 1. Agent setup is optional after redemption.",
      rewardContext:
        "Every valid code adds 3,000 AI Credits. Selected special codes may also include a Claude Pro gift.",
      stepOne: "Step 1",
      stepTwo: "Step 2",
      claimCredits: "Scan or enter my code",
      connectAgent: "Connect Agent (optional)",
      disclaimer:
        "For the USC community. Not affiliated with or endorsed by USC.",
      imageAlt: "Real YGF ingredient counter with fresh malatang choices",
      phoneAriaLabel:
        "Illustration of an AI card with a private QR and printed code; example only, not live",
      receipt: {
        qualifyingPurchase: "Your AI card",
        total: "Purchase",
        status: "Credits",
        ready: "3,000",
        illustrativeCode: "DEMO — use your own card",
        scanOrEnter: "Private QR or 8-character code",
        exampleOnly: "Example only. This code cannot be redeemed.",
        expires: "Credits last 14 days",
      },
    },
    useCases: {
      heading: "What can 3,000 AI Credits help with?",
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
      heading: "Three simple steps.",
      description:
        "Spend $25+ in one transaction. Receive an AI card at checkout. Redeem it for 3,000 AI Credits that last 14 days.",
      photoAlt: "Assorted YGF ingredients ready to choose at the counter",
      steps: [
        {
          title: "Get your AI card",
          description: "Spend $25+ and receive it at checkout.",
        },
        {
          title: "Scan or enter the code",
          description: "Use the private QR or 8-character card code.",
        },
        {
          title: "Pick an AI tool",
          description: "Choose Study, Coding, Career, or Pick My Bowl.",
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
            "Guests who spend $25+ in one transaction and receive a code at checkout. One redemption per person/account.",
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
        "在杨国福单笔消费满 $25，结账时领取 AI 算力卡；扫描私人二维码或输入兑换码，即可解锁 3,000 杨国福 AI Credits，有效 14 天。",
      guidance: "第一次使用？从步骤 1 开始。Agent 连接是兑换后的可选功能。",
      rewardContext:
        "每个有效兑换码均可获得 3,000 杨国福 AI Credits；部分特别兑换码还可能附带一份 Claude Pro 礼赠。",
      stepOne: "步骤 1",
      stepTwo: "步骤 2",
      claimCredits: "扫码或输入兑换码",
      connectAgent: "连接 Agent（可选）",
      disclaimer: "面向 USC 社区。本活动与 USC 无隶属关系，也未获其赞助或认可。",
      imageAlt: "真实的杨国福麻辣烫新鲜食材柜台",
      phoneAriaLabel:
        "带私人二维码和纸质兑换码的 AI 算力卡示意图；仅作示例，并非真实兑换码",
      receipt: {
        qualifyingPurchase: "你的 AI 算力卡",
        total: "消费门槛",
        status: "Credits",
        ready: "3,000",
        illustrativeCode: "演示码 — 请使用自己的卡",
        scanOrEnter: "私人二维码或 8 位兑换码",
        exampleOnly: "仅作示例，无法兑换。",
        expires: "Credits 有效 14 天",
      },
    },
    useCases: {
      heading: "3,000 AI Credits 可以帮你做什么？",
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
      heading: "简单三步即可开始。",
      description:
        "单笔消费满 $25，结账时领取 AI 算力卡。兑换后获得 3,000 AI Credits，有效 14 天。",
      photoAlt: "杨国福柜台中可自由选择的丰富食材",
      steps: [
        {
          title: "领取 AI 算力卡",
          description: "单笔消费满 $25，结账时领取。",
        },
        {
          title: "扫码或输入兑换码",
          description: "使用卡片上的私人二维码或 8 位兑换码。",
        },
        {
          title: "选择 AI 工具",
          description: "选择学习、编程、求职或下一碗。",
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
            "单笔消费满 $25，并在结账时领取兑换码的顾客。每人或每个账户限兑换一次。",
        },
        {
          question: "这是 USC 官方活动吗？",
          answer:
            "本活动由杨国福面向 USC 社区提供，并非由南加州大学赞助、认可或管理。",
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
        "Gasta $25+ en YGF, recibe una tarjeta de IA en caja y escanea o escribe su código privado para desbloquear 3,000 AI Credits durante 14 días.",
      guidance:
        "¿Es tu primera vez? Empieza por el Paso 1. Conectar un Agent es opcional después del canje.",
      rewardContext:
        "Cada código válido añade 3,000 créditos de IA. Algunos códigos especiales seleccionados también pueden incluir un regalo de Claude Pro.",
      stepOne: "Paso 1",
      stepTwo: "Paso 2",
      claimCredits: "Escanear o escribir código",
      connectAgent: "Agent (opcional)",
      disclaimer:
        "Para la comunidad de USC. No está afiliado ni respaldado por USC.",
      imageAlt: "Mostrador real de YGF con ingredientes frescos de malatang",
      phoneAriaLabel:
        "Ilustración de una tarjeta de IA con QR privado y código impreso; es solo un ejemplo",
      receipt: {
        qualifyingPurchase: "Tu tarjeta de IA",
        total: "Compra",
        status: "Credits",
        ready: "3,000",
        illustrativeCode: "DEMO — usa tu propia tarjeta",
        scanOrEnter: "QR privado o código de 8 caracteres",
        exampleOnly: "Solo un ejemplo. Este código no se puede canjear.",
        expires: "Credits válidos por 14 días",
      },
    },
    useCases: {
      heading: "¿En qué ayudan 3,000 AI Credits?",
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
      heading: "Tres pasos sencillos.",
      description:
        "Gasta $25+ en una transacción y recibe una tarjeta de IA en caja. Canjéala por 3,000 AI Credits válidos durante 14 días.",
      photoAlt: "Ingredientes variados de YGF listos para elegir en el mostrador",
      steps: [
        {
          title: "Recibe tu tarjeta de IA",
          description: "Gasta $25+ y recíbela en caja.",
        },
        {
          title: "Escanea o escribe el código",
          description: "Usa el QR privado o el código de 8 caracteres.",
        },
        {
          title: "Elige una herramienta de IA",
          description: "Estudio, Programación, Carrera o Elige mi bowl.",
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
            "Quienes gasten $25+ en una transacción y reciban un código en caja. Un canje por persona o cuenta.",
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
        "Dépensez 25 $ ou plus chez YGF, recevez une carte IA en caisse, puis scannez ou saisissez son code privé pour débloquer 3,000 AI Credits pendant 14 jours.",
      guidance:
        "Première visite ? Commencez par l’Étape 1. La connexion d’un Agent est facultative après l’activation.",
      rewardContext:
        "Chaque code valide ajoute 3 000 crédits IA. Certains codes spéciaux sélectionnés peuvent aussi inclure un cadeau Claude Pro.",
      stepOne: "Étape 1",
      stepTwo: "Étape 2",
      claimCredits: "Scanner ou saisir le code",
      connectAgent: "Agent (facultatif)",
      disclaimer:
        "Pour la communauté USC. Sans affiliation ni approbation de l’USC.",
      imageAlt: "Vrai comptoir YGF avec des ingrédients frais pour malatang",
      phoneAriaLabel:
        "Illustration d’une carte IA avec QR privé et code imprimé ; exemple uniquement",
      receipt: {
        qualifyingPurchase: "Votre carte IA",
        total: "Achat",
        status: "Credits",
        ready: "3,000",
        illustrativeCode: "DÉMO — utilisez votre carte",
        scanOrEnter: "QR privé ou code à 8 caractères",
        exampleOnly: "Exemple uniquement. Ce code ne peut pas être activé.",
        expires: "Credits valables 14 jours",
      },
    },
    useCases: {
      heading: "Que faire avec 3,000 AI Credits ?",
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
      heading: "Trois étapes simples.",
      description:
        "Dépensez 25 $ ou plus en une transaction et recevez une carte IA en caisse. Activez 3,000 AI Credits valables 14 jours.",
      photoAlt: "Ingrédients YGF variés à choisir au comptoir",
      steps: [
        {
          title: "Recevez votre carte IA",
          description: "Dépensez 25 $ ou plus et recevez-la en caisse.",
        },
        {
          title: "Scannez ou saisissez le code",
          description: "Utilisez le QR privé ou le code à 8 caractères.",
        },
        {
          title: "Choisissez un outil IA",
          description: "Études, Code, Carrière ou Choisir mon bowl.",
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
            "Les clients dépensant 25 $ ou plus en une transaction et recevant un code en caisse. Une activation par personne ou compte.",
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
        "Потратьте в YGF от $25, получите AI-карту на кассе и отсканируйте или введите её личный код, чтобы открыть 3,000 AI Credits на 14 дней.",
      guidance:
        "Впервые здесь? Начните с шага 1. Подключение Agent — необязательный шаг после активации.",
      rewardContext:
        "Каждый действительный код добавляет 3 000 AI Credits. Некоторые специальные коды также могут включать подарок Claude Pro.",
      stepOne: "Шаг 1",
      stepTwo: "Шаг 2",
      claimCredits: "Сканировать или ввести код",
      connectAgent: "Agent (необязательно)",
      disclaimer:
        "Для сообщества USC. Не связано с USC и не одобрено университетом.",
      imageAlt: "Настоящая витрина YGF со свежими ингредиентами для малатана",
      phoneAriaLabel:
        "Иллюстрация AI-карты с личным QR и печатным кодом; только пример",
      receipt: {
        qualifyingPurchase: "Ваша AI-карта",
        total: "Покупка",
        status: "Credits",
        ready: "3,000",
        illustrativeCode: "ДЕМО — используйте свою карту",
        scanOrEnter: "Личный QR или 8-значный код",
        exampleOnly: "Только пример. Этот код нельзя активировать.",
        expires: "Credits действуют 14 дней",
      },
    },
    useCases: {
      heading: "Чем помогут 3,000 AI Credits?",
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
      heading: "Три простых шага.",
      description:
        "Потратьте от $25 за одну покупку и получите AI-карту на кассе. Активируйте 3,000 AI Credits на 14 дней.",
      photoAlt: "Разнообразные ингредиенты YGF для выбора у стойки",
      steps: [
        {
          title: "Получите AI-карту",
          description: "Потратьте от $25 и заберите её на кассе.",
        },
        {
          title: "Сканируйте или введите код",
          description: "Используйте личный QR или 8-значный код.",
        },
        {
          title: "Выберите AI-инструмент",
          description: "Учёба, Код, Карьера или Выбрать мой боул.",
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
            "Гости, потратившие от $25 за одну покупку и получившие код на кассе. Одна активация на человека или аккаунт.",
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
