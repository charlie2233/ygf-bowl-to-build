import type { CampaignLocale } from "@/lib/i18n/campaign";

export type WorkspaceTaskType =
  | "study"
  | "coding"
  | "career"
  | "pick-my-bowl";

export type WorkspaceTaskErrorKey =
  | "generic"
  | "inProgress"
  | "insufficientCredits"
  | "providerLimit"
  | "providerUnavailable"
  | "replayExpired"
  | "retryConflict"
  | "throttled"
  | "walletExpired";

type WorkspaceTaskCopy = Readonly<{
  backToWallet: string;
  blankInput: string;
  characterCount: (count: string, maximum: string) => string;
  credits: (credits: string) => string;
  empty: Readonly<{
    description: string;
    title: string;
  }>;
  errors: Readonly<Record<WorkspaceTaskErrorKey, string>>;
  generate: string;
  generating: string;
  helpPrompt: string;
  model: Readonly<{
    costNote: string;
    options: Readonly<
      Record<
        "balanced" | "best" | "coding" | "fast" | "reasoning",
        string
      >
    >;
    preference: string;
    summary: string;
  }>;
  partner: Readonly<{
    action: string;
    description: string;
    title: string;
  }>;
  result: Readonly<{
    copied: string;
    copy: string;
    copyError: string;
    generatedNow: string;
    save: string;
    saveError: string;
    savedToHistory: string;
    saving: string;
    startAnother: string;
  }>;
  tasks: Readonly<
    Record<
      WorkspaceTaskType,
      Readonly<{
        example: string;
        inputLabel: string;
        presets: readonly string[];
        quickStartsLabel: string;
        reviewNote: string;
        safetyNote?: string;
        title: string;
      }>
    >
  >;
}>;

export type WorkspaceCopy = Readonly<{
  agent: Readonly<{
    controlsLanguageNotice: string;
    description: string;
    eyebrow: string;
    title: string;
    useYgfAi: string;
  }>;
  redeemSuccess: Readonly<{
    connectAgent: string;
    description: string;
    developerApiKey: string;
    share: string;
    title: string;
    useAi: string;
  }>;
  wallet: Readonly<{
    balance: Readonly<{
      ariaLabel: string;
      expires: (date: string) => string;
      remaining: string;
      reserved: (credits: string) => string;
      used: (percent: number, credits: string) => string;
    }>;
    heading: string;
    nextSteps: Readonly<{
      connectAgent: string;
      eyebrow: string;
      share: string;
      title: string;
    }>;
    tasks: Readonly<{
      advancedSummary: string;
      costNote: string;
      heading: string;
      modelOptions: Readonly<{
        best: string;
        fast: string;
        reasoning: string;
      }>;
      modelPreference: string;
      presets: Readonly<
        Record<
          WorkspaceTaskType,
          Readonly<{
            description: string;
            label: string;
          }>
        >
      >;
    }>;
  }>;
  task: WorkspaceTaskCopy;
}>;

export const workspaceIntlLocales: Record<CampaignLocale, string> = {
  en: "en-US",
  zh: "zh-CN",
  es: "es-ES",
  fr: "fr-FR",
  ru: "ru-RU",
};

export const workspaceCopy: Record<CampaignLocale, WorkspaceCopy> = {
  en: {
    redeemSuccess: {
      title: "Your Build Credits are ready",
      description:
        "Your AI balance is active. Pick a useful task and get to a first result.",
      useAi: "Use AI now",
      connectAgent: "Connect my Agent (optional)",
      developerApiKey: "Developer API key",
      share: "Generate a safe check-in card",
    },
    wallet: {
      heading: "What will you build first?",
      balance: {
        ariaLabel: "Your AI balance",
        remaining: "Build Credits remaining",
        expires: (date) => `Expires ${date}`,
        used: (percent, credits) =>
          `${percent}% of ${credits} credits used`,
        reserved: (credits) => `${credits} reserved`,
      },
      tasks: {
        heading: "Choose a quick start",
        presets: {
          study: {
            label: "Study",
            description: "Turn notes into a study guide",
          },
          coding: {
            label: "Coding",
            description: "Explain an error or refactor code",
          },
          career: {
            label: "Career",
            description: "Sharpen a resume or outreach",
          },
          "pick-my-bowl": {
            label: "Pick My Bowl",
            description: "Build a bowl for your budget",
          },
        },
        advancedSummary: "Advanced: choose a model",
        modelPreference: "Model preference",
        modelOptions: {
          best: "Best for this task",
          fast: "Fast and focused",
          reasoning: "Deeper reasoning",
        },
        costNote:
          "Every beta choice spends the same 120 Build Credits. Only server-allowlisted models are available.",
      },
      nextSteps: {
        eyebrow: "Optional next steps",
        title: "Build your way",
        connectAgent: "Connect my Agent",
        share: "Generate check-in card",
      },
    },
    task: {
      backToWallet: "Wallet",
      blankInput: "Tell us what you’re working on.",
      characterCount: (count, maximum) => `${count}/${maximum}`,
      credits: (credits) => `${credits} credits`,
      helpPrompt: "What would you like help with?",
      model: {
        summary: "Advanced: choose a model",
        preference: "Model preference",
        options: {
          best: "Best for this task",
          balanced: "Balanced guide",
          fast: "Fast and focused",
          coding: "Coding specialist",
          reasoning: "Deeper reasoning",
        },
        costNote:
          "Every beta choice spends the same 120 Build Credits. Only server-allowlisted models are available.",
      },
      generate: "Generate",
      generating: "Generating…",
      errors: {
        insufficientCredits: "You need 120 Build Credits for this task.",
        walletExpired: "These Build Credits have expired.",
        providerLimit:
          "This beta wallet reached its provider spending limit.",
        throttled:
          "Too many requests were made. Wait a minute and try again.",
        inProgress:
          "This task is still running. Wait a moment, then retry—the same request will not spend twice.",
        replayExpired:
          "This completed retry is too old to replay. Start another task; the provider was not called again.",
        retryConflict:
          "This retry no longer matches the original request. Start another task.",
        providerUnavailable:
          "AI is temporarily unavailable. Your 120 credits were not consumed if the provider failed.",
        generic: "We couldn’t generate this result. Try again shortly.",
      },
      empty: {
        title: "Your result will appear here",
        description:
          "Choose a quick start or describe what you need. One generation uses 120 Build Credits.",
      },
      result: {
        generatedNow: "Generated just now",
        copy: "Copy",
        copied: "Copied",
        copyError: "Copy failed",
        save: "Save",
        saving: "Saving…",
        savedToHistory: "Saved to history",
        startAnother: "Start another",
        saveError:
          "This result is no longer available to save. Copy it before leaving this page.",
      },
      partner: {
        title: "Connect my Agent (optional)",
        description:
          "Create a personal, revocable YGF API key backed by your wallet’s remaining Credits.",
        action: "Set up Agent",
      },
      tasks: {
        study: {
          title: "Study help",
          quickStartsLabel: "Study help quick starts",
          inputLabel: "What are you working on?",
          example:
            "Turn these notes into a one-page study guide and 10 flashcards.",
          presets: [
            "Make a study guide",
            "Create flashcards",
            "Quiz me",
            "Explain a concept",
          ],
          reviewNote:
            "AI can make mistakes. Review before relying on this result.",
        },
        coding: {
          title: "Coding help",
          quickStartsLabel: "Coding help quick starts",
          inputLabel: "What are you working on?",
          example:
            "Paste the relevant error and code. Ask for the smallest safe fix.",
          presets: [
            "Explain this error",
            "Refactor this function",
            "Write tests",
            "Compare approaches",
          ],
          reviewNote:
            "AI can make mistakes. Test the result and review before submitting.",
        },
        career: {
          title: "Career help",
          quickStartsLabel: "Career help quick starts",
          inputLabel: "What are you working on?",
          example:
            "Rewrite this resume bullet for a software engineering internship.",
          presets: [
            "Rewrite a resume bullet",
            "Draft a cold email",
            "Tailor my intro",
            "Create STAR stories",
          ],
          reviewNote:
            "AI can make mistakes. Review before relying on this result.",
        },
        "pick-my-bowl": {
          title: "Pick My Bowl",
          quickStartsLabel: "Pick My Bowl quick starts",
          inputLabel: "What sounds good?",
          example:
            "Suggest a filling vegetarian bowl with mild spice. I will confirm ingredients with staff.",
          presets: [
            "Bowl under $16",
            "High-protein, less spicy",
            "Vegetarian, not bland",
            "Late-night comfort bowl",
          ],
          reviewNote:
            "AI can make mistakes. Review before relying on this result.",
          safetyNote:
            "Food suggestions are informational only. Please confirm ingredients/allergens with YGF staff.",
        },
      },
    },
    agent: {
      eyebrow: "Optional developer path",
      title: "Connect your own Agent",
      description:
        "Use a personal YGF key with software that accepts an OpenAI-compatible API. Prefer the ready-made AI tools? They stay one click away.",
      controlsLanguageNotice:
        "Advanced setup controls below are currently in English.",
      useYgfAi: "Use YGF AI instead",
    },
  },
  zh: {
    redeemSuccess: {
      title: "你的 Build Credits 已到账",
      description: "AI 余额已启用。选择一个实用任务，马上获得第一个结果。",
      useAi: "立即使用 AI",
      connectAgent: "连接我的 Agent（可选）",
      developerApiKey: "开发者 API Key",
      share: "生成安全打卡图",
    },
    wallet: {
      heading: "你想先用 AI 完成什么？",
      balance: {
        ariaLabel: "你的 AI 余额",
        remaining: "剩余 Build Credits",
        expires: (date) => `到期时间：${date}`,
        used: (percent, credits) =>
          `已使用 ${percent}%（共 ${credits} Credits）`,
        reserved: (credits) => `已预留 ${credits}`,
      },
      tasks: {
        heading: "选择一个快速开始",
        presets: {
          study: {
            label: "学习",
            description: "把笔记整理成学习指南",
          },
          coding: {
            label: "编程",
            description: "解释报错或重构代码",
          },
          career: {
            label: "求职",
            description: "优化简历或联络文案",
          },
          "pick-my-bowl": {
            label: "下一碗",
            description: "按预算搭配一碗",
          },
        },
        advancedSummary: "高级：选择模型",
        modelPreference: "模型偏好",
        modelOptions: {
          best: "最适合此任务",
          fast: "快速且专注",
          reasoning: "深度推理",
        },
        costNote:
          "内测期间每种选择都消耗 120 Build Credits，且只能使用服务器白名单中的模型。",
      },
      nextSteps: {
        eyebrow: "可选下一步",
        title: "按你的方式继续",
        connectAgent: "连接我的 Agent",
        share: "生成打卡图",
      },
    },
    task: {
      backToWallet: "钱包",
      blankInput: "请告诉我们你正在处理什么。",
      characterCount: (count, maximum) => `${count}/${maximum}`,
      credits: (credits) => `${credits} Credits`,
      helpPrompt: "你希望 AI 帮你完成什么？",
      model: {
        summary: "高级：选择模型",
        preference: "模型偏好",
        options: {
          best: "最适合此任务",
          balanced: "均衡助手",
          fast: "快速且专注",
          coding: "编程专用",
          reasoning: "深度推理",
        },
        costNote:
          "内测期间每种选择都消耗 120 Build Credits，且只能使用服务器白名单中的模型。",
      },
      generate: "生成结果",
      generating: "正在生成…",
      errors: {
        insufficientCredits: "此任务需要 120 Build Credits。",
        walletExpired: "这些 Build Credits 已过期。",
        providerLimit: "此内测钱包已达到服务商费用上限。",
        throttled: "请求次数过多。请等待一分钟后重试。",
        inProgress:
          "此任务仍在运行。请稍等后重试，同一次请求不会重复扣费。",
        replayExpired:
          "这次已完成的重试记录太旧，无法再次显示。请开始新任务；服务商不会被重复调用。",
        retryConflict:
          "这次重试与原请求不一致。请开始一个新任务。",
        providerUnavailable:
          "AI 服务暂时不可用。如果服务商调用失败，你的 120 Credits 不会被扣除。",
        generic: "暂时无法生成结果，请稍后重试。",
      },
      empty: {
        title: "结果会显示在这里",
        description:
          "选择一个快速开始，或描述你的需求。每次生成消耗 120 Build Credits。",
      },
      result: {
        generatedNow: "刚刚生成",
        copy: "复制",
        copied: "已复制",
        copyError: "复制失败",
        save: "保存",
        saving: "正在保存…",
        savedToHistory: "已保存到历史记录",
        startAnother: "开始新任务",
        saveError: "此结果已无法保存。离开页面前请先复制内容。",
      },
      partner: {
        title: "连接我的 Agent（可选）",
        description:
          "创建一把个人、可撤销的 YGF API Key，并使用钱包中的剩余 Credits。",
        action: "设置 Agent",
      },
      tasks: {
        study: {
          title: "学习助手",
          quickStartsLabel: "学习助手快速开始",
          inputLabel: "你正在学习什么？",
          example: "把这些笔记整理成一页学习指南和 10 张记忆卡。",
          presets: [
            "制作学习指南",
            "创建记忆卡",
            "考考我",
            "解释一个概念",
          ],
          reviewNote: "AI 可能出错，请在使用前检查结果。",
        },
        coding: {
          title: "编程助手",
          quickStartsLabel: "编程助手快速开始",
          inputLabel: "你正在处理什么代码问题？",
          example: "粘贴相关报错和代码，并要求给出最小且安全的修复方案。",
          presets: [
            "解释这个报错",
            "重构这个函数",
            "编写测试",
            "比较两种方案",
          ],
          reviewNote: "AI 可能出错。请测试结果，并在提交前检查。",
        },
        career: {
          title: "求职助手",
          quickStartsLabel: "求职助手快速开始",
          inputLabel: "你想优化什么？",
          example: "为软件工程实习岗位改写这条简历经历。",
          presets: [
            "改写简历要点",
            "起草陌生拜访邮件",
            "优化个人介绍",
            "整理 STAR 故事",
          ],
          reviewNote: "AI 可能出错，请在使用前检查结果。",
        },
        "pick-my-bowl": {
          title: "帮我选下一碗",
          quickStartsLabel: "下一碗快速开始",
          inputLabel: "你今天想吃什么？",
          example: "推荐一碗饱腹、素食、微辣的搭配；我会向员工确认食材。",
          presets: [
            "$16 以内搭配",
            "高蛋白、少辣",
            "素食但有味道",
            "深夜治愈搭配",
          ],
          reviewNote: "AI 可能出错，请在使用前检查结果。",
          safetyNote:
            "食物建议仅供参考。请向 YGF 员工确认食材和过敏原。",
        },
      },
    },
    agent: {
      eyebrow: "可选开发者路径",
      title: "连接你自己的 Agent",
      description:
        "使用个人 YGF Key 接入支持 OpenAI-compatible API 的软件。更想直接用现成的 AI 工具？只需点击一下。",
      controlsLanguageNotice: "下方的高级设置控件目前仅提供英文。",
      useYgfAi: "改用 YGF AI",
    },
  },
  es: {
    redeemSuccess: {
      title: "Tus Build Credits están listos",
      description:
        "Tu saldo de IA está activo. Elige una tarea útil y obtén tu primer resultado.",
      useAi: "Usar IA ahora",
      connectAgent: "Conectar mi Agent (opcional)",
      developerApiKey: "Clave API para desarrolladores",
      share: "Generar una tarjeta segura",
    },
    wallet: {
      heading: "¿Qué vas a crear primero?",
      balance: {
        ariaLabel: "Tu saldo de IA",
        remaining: "Build Credits disponibles",
        expires: (date) => `Vence el ${date}`,
        used: (percent, credits) =>
          `${percent}% de ${credits} créditos usados`,
        reserved: (credits) => `${credits} reservados`,
      },
      tasks: {
        heading: "Elige un inicio rápido",
        presets: {
          study: {
            label: "Estudio",
            description: "Convierte notas en una guía de estudio",
          },
          coding: {
            label: "Programación",
            description: "Explica un error o refactoriza código",
          },
          career: {
            label: "Carrera",
            description: "Mejora un currículum o un mensaje",
          },
          "pick-my-bowl": {
            label: "Elegir mi bowl",
            description: "Crea un bowl para tu presupuesto",
          },
        },
        advancedSummary: "Avanzado: elegir un modelo",
        modelPreference: "Preferencia de modelo",
        modelOptions: {
          best: "El mejor para esta tarea",
          fast: "Rápido y preciso",
          reasoning: "Razonamiento más profundo",
        },
        costNote:
          "Durante la beta, cada opción usa los mismos 120 Build Credits. Solo están disponibles los modelos autorizados por el servidor.",
      },
      nextSteps: {
        eyebrow: "Siguientes pasos opcionales",
        title: "Crea a tu manera",
        connectAgent: "Conectar mi Agent",
        share: "Generar tarjeta",
      },
    },
    task: {
      backToWallet: "Saldo",
      blankInput: "Cuéntanos en qué estás trabajando.",
      characterCount: (count, maximum) => `${count}/${maximum}`,
      credits: (credits) => `${credits} créditos`,
      helpPrompt: "¿En qué quieres que te ayude la IA?",
      model: {
        summary: "Avanzado: elegir un modelo",
        preference: "Preferencia de modelo",
        options: {
          best: "El mejor para esta tarea",
          balanced: "Guía equilibrada",
          fast: "Rápido y preciso",
          coding: "Especialista en código",
          reasoning: "Razonamiento más profundo",
        },
        costNote:
          "Durante la beta, cada opción usa los mismos 120 Build Credits. Solo están disponibles los modelos autorizados por el servidor.",
      },
      generate: "Generar",
      generating: "Generando…",
      errors: {
        insufficientCredits:
          "Necesitas 120 Build Credits para esta tarea.",
        walletExpired: "Estos Build Credits han vencido.",
        providerLimit:
          "Este saldo beta alcanzó su límite de gasto del proveedor.",
        throttled:
          "Se hicieron demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.",
        inProgress:
          "Esta tarea sigue en curso. Espera un momento y vuelve a intentarlo; la misma solicitud no se cobrará dos veces.",
        replayExpired:
          "Este reintento completado es demasiado antiguo para volver a mostrarlo. Inicia otra tarea; el proveedor no se llamó de nuevo.",
        retryConflict:
          "Este reintento ya no coincide con la solicitud original. Inicia otra tarea.",
        providerUnavailable:
          "La IA no está disponible temporalmente. Si falló el proveedor, no se consumieron tus 120 créditos.",
        generic:
          "No pudimos generar el resultado. Inténtalo de nuevo en breve.",
      },
      empty: {
        title: "Tu resultado aparecerá aquí",
        description:
          "Elige un inicio rápido o describe lo que necesitas. Cada generación usa 120 Build Credits.",
      },
      result: {
        generatedNow: "Generado ahora",
        copy: "Copiar",
        copied: "Copiado",
        copyError: "No se pudo copiar",
        save: "Guardar",
        saving: "Guardando…",
        savedToHistory: "Guardado en el historial",
        startAnother: "Iniciar otra tarea",
        saveError:
          "Este resultado ya no se puede guardar. Cópialo antes de salir de la página.",
      },
      partner: {
        title: "Conectar mi Agent (opcional)",
        description:
          "Crea una clave API personal y revocable de YGF respaldada por los Credits restantes de tu saldo.",
        action: "Configurar Agent",
      },
      tasks: {
        study: {
          title: "Ayuda para estudiar",
          quickStartsLabel: "Inicios rápidos para estudiar",
          inputLabel: "¿En qué estás trabajando?",
          example:
            "Convierte estas notas en una guía de una página y 10 tarjetas.",
          presets: [
            "Crear una guía de estudio",
            "Crear tarjetas",
            "Hazme preguntas",
            "Explicar un concepto",
          ],
          reviewNote:
            "La IA puede equivocarse. Revisa el resultado antes de usarlo.",
        },
        coding: {
          title: "Ayuda con programación",
          quickStartsLabel: "Inicios rápidos de programación",
          inputLabel: "¿En qué estás trabajando?",
          example:
            "Pega el error y el código relevante. Pide la corrección segura más pequeña.",
          presets: [
            "Explicar este error",
            "Refactorizar esta función",
            "Escribir pruebas",
            "Comparar enfoques",
          ],
          reviewNote:
            "La IA puede equivocarse. Prueba y revisa el resultado antes de enviarlo.",
        },
        career: {
          title: "Ayuda profesional",
          quickStartsLabel: "Inicios rápidos profesionales",
          inputLabel: "¿En qué estás trabajando?",
          example:
            "Reescribe este punto del currículum para unas prácticas de ingeniería de software.",
          presets: [
            "Reescribir un punto del CV",
            "Redactar un correo inicial",
            "Adaptar mi presentación",
            "Crear historias STAR",
          ],
          reviewNote:
            "La IA puede equivocarse. Revisa el resultado antes de usarlo.",
        },
        "pick-my-bowl": {
          title: "Elegir mi bowl",
          quickStartsLabel: "Inicios rápidos para elegir un bowl",
          inputLabel: "¿Qué te apetece?",
          example:
            "Sugiere un bowl vegetariano, abundante y poco picante. Confirmaré los ingredientes con el personal.",
          presets: [
            "Bowl por menos de $16",
            "Mucha proteína y poco picante",
            "Vegetariano con sabor",
            "Bowl reconfortante nocturno",
          ],
          reviewNote:
            "La IA puede equivocarse. Revisa el resultado antes de usarlo.",
          safetyNote:
            "Las sugerencias de comida son solo informativas. Confirma los ingredientes y alérgenos con el personal de YGF.",
        },
      },
    },
    agent: {
      eyebrow: "Ruta opcional para desarrolladores",
      title: "Conecta tu propio Agent",
      description:
        "Usa una clave personal de YGF con software compatible con la API de OpenAI. Si prefieres las herramientas de IA listas para usar, están a un clic.",
      controlsLanguageNotice:
        "Los controles avanzados que aparecen abajo están disponibles en inglés.",
      useYgfAi: "Usar YGF AI",
    },
  },
  fr: {
    redeemSuccess: {
      title: "Vos Build Credits sont prêts",
      description:
        "Votre solde d’IA est actif. Choisissez une tâche utile et obtenez un premier résultat.",
      useAi: "Utiliser l’IA",
      connectAgent: "Connecter mon Agent (facultatif)",
      developerApiKey: "Clé API développeur",
      share: "Générer une carte sécurisée",
    },
    wallet: {
      heading: "Qu’allez-vous créer en premier ?",
      balance: {
        ariaLabel: "Votre solde d’IA",
        remaining: "Build Credits restants",
        expires: (date) => `Expire le ${date}`,
        used: (percent, credits) =>
          `${percent} % des ${credits} crédits utilisés`,
        reserved: (credits) => `${credits} réservés`,
      },
      tasks: {
        heading: "Choisissez un démarrage rapide",
        presets: {
          study: {
            label: "Études",
            description: "Transformez vos notes en guide de révision",
          },
          coding: {
            label: "Programmation",
            description: "Expliquez une erreur ou refactorisez du code",
          },
          career: {
            label: "Carrière",
            description: "Améliorez un CV ou un message",
          },
          "pick-my-bowl": {
            label: "Choisir mon bowl",
            description: "Composez un bowl adapté à votre budget",
          },
        },
        advancedSummary: "Avancé : choisir un modèle",
        modelPreference: "Préférence de modèle",
        modelOptions: {
          best: "Le meilleur pour cette tâche",
          fast: "Rapide et ciblé",
          reasoning: "Raisonnement approfondi",
        },
        costNote:
          "Pendant la bêta, chaque choix utilise 120 Build Credits. Seuls les modèles autorisés par le serveur sont disponibles.",
      },
      nextSteps: {
        eyebrow: "Étapes suivantes facultatives",
        title: "Créez à votre façon",
        connectAgent: "Connecter mon Agent",
        share: "Générer une carte",
      },
    },
    task: {
      backToWallet: "Solde",
      blankInput: "Indiquez ce sur quoi vous travaillez.",
      characterCount: (count, maximum) => `${count}/${maximum}`,
      credits: (credits) => `${credits} crédits`,
      helpPrompt: "Comment l’IA peut-elle vous aider ?",
      model: {
        summary: "Avancé : choisir un modèle",
        preference: "Préférence de modèle",
        options: {
          best: "Le meilleur pour cette tâche",
          balanced: "Guide équilibré",
          fast: "Rapide et ciblé",
          coding: "Spécialiste du code",
          reasoning: "Raisonnement approfondi",
        },
        costNote:
          "Pendant la bêta, chaque choix utilise 120 Build Credits. Seuls les modèles autorisés par le serveur sont disponibles.",
      },
      generate: "Générer",
      generating: "Génération…",
      errors: {
        insufficientCredits:
          "Cette tâche nécessite 120 Build Credits.",
        walletExpired: "Ces Build Credits ont expiré.",
        providerLimit:
          "Ce solde bêta a atteint sa limite de dépenses fournisseur.",
        throttled:
          "Trop de demandes ont été effectuées. Attendez une minute et réessayez.",
        inProgress:
          "Cette tâche est toujours en cours. Patientez, puis réessayez : la même demande ne sera pas débitée deux fois.",
        replayExpired:
          "Cette tentative terminée est trop ancienne pour être réaffichée. Lancez une autre tâche ; le fournisseur n’a pas été rappelé.",
        retryConflict:
          "Cette nouvelle tentative ne correspond plus à la demande initiale. Lancez une autre tâche.",
        providerUnavailable:
          "L’IA est temporairement indisponible. Si le fournisseur a échoué, vos 120 crédits n’ont pas été utilisés.",
        generic:
          "Impossible de générer le résultat. Réessayez dans un instant.",
      },
      empty: {
        title: "Votre résultat apparaîtra ici",
        description:
          "Choisissez un démarrage rapide ou décrivez votre besoin. Chaque génération utilise 120 Build Credits.",
      },
      result: {
        generatedNow: "Généré à l’instant",
        copy: "Copier",
        copied: "Copié",
        copyError: "Échec de la copie",
        save: "Enregistrer",
        saving: "Enregistrement…",
        savedToHistory: "Enregistré dans l’historique",
        startAnother: "Lancer une autre tâche",
        saveError:
          "Ce résultat ne peut plus être enregistré. Copiez-le avant de quitter cette page.",
      },
      partner: {
        title: "Connecter mon Agent (facultatif)",
        description:
          "Créez une clé API YGF personnelle et révocable, adossée aux Credits restants de votre solde.",
        action: "Configurer l’Agent",
      },
      tasks: {
        study: {
          title: "Aide aux études",
          quickStartsLabel: "Démarrages rapides pour les études",
          inputLabel: "Sur quoi travaillez-vous ?",
          example:
            "Transformez ces notes en un guide d’une page et 10 cartes mémoire.",
          presets: [
            "Créer un guide de révision",
            "Créer des cartes mémoire",
            "Me faire réviser",
            "Expliquer un concept",
          ],
          reviewNote:
            "L’IA peut se tromper. Vérifiez le résultat avant de l’utiliser.",
        },
        coding: {
          title: "Aide au code",
          quickStartsLabel: "Démarrages rapides pour le code",
          inputLabel: "Sur quoi travaillez-vous ?",
          example:
            "Collez l’erreur et le code concernés. Demandez la plus petite correction sûre.",
          presets: [
            "Expliquer cette erreur",
            "Refactoriser cette fonction",
            "Écrire des tests",
            "Comparer des approches",
          ],
          reviewNote:
            "L’IA peut se tromper. Testez et vérifiez le résultat avant de le soumettre.",
        },
        career: {
          title: "Aide à la carrière",
          quickStartsLabel: "Démarrages rapides pour la carrière",
          inputLabel: "Sur quoi travaillez-vous ?",
          example:
            "Réécrivez cette ligne de CV pour un stage en génie logiciel.",
          presets: [
            "Réécrire une ligne de CV",
            "Rédiger un premier e-mail",
            "Adapter ma présentation",
            "Créer des récits STAR",
          ],
          reviewNote:
            "L’IA peut se tromper. Vérifiez le résultat avant de l’utiliser.",
        },
        "pick-my-bowl": {
          title: "Choisir mon bowl",
          quickStartsLabel: "Démarrages rapides pour choisir un bowl",
          inputLabel: "De quoi avez-vous envie ?",
          example:
            "Suggérez un bowl végétarien, rassasiant et peu épicé. Je confirmerai les ingrédients avec l’équipe.",
          presets: [
            "Bowl à moins de 16 $",
            "Riche en protéines, peu épicé",
            "Végétarien et savoureux",
            "Bowl réconfortant du soir",
          ],
          reviewNote:
            "L’IA peut se tromper. Vérifiez le résultat avant de l’utiliser.",
          safetyNote:
            "Les suggestions de repas sont uniquement informatives. Confirmez les ingrédients et allergènes auprès de l’équipe YGF.",
        },
      },
    },
    agent: {
      eyebrow: "Parcours développeur facultatif",
      title: "Connectez votre propre Agent",
      description:
        "Utilisez une clé YGF personnelle avec un logiciel compatible avec l’API OpenAI. Vous préférez les outils d’IA prêts à l’emploi ? Ils restent accessibles en un clic.",
      controlsLanguageNotice:
        "Les réglages avancés ci-dessous sont actuellement disponibles en anglais.",
      useYgfAi: "Utiliser YGF AI",
    },
  },
  ru: {
    redeemSuccess: {
      title: "Ваши Build Credits готовы",
      description:
        "Баланс ИИ активирован. Выберите полезную задачу и получите первый результат.",
      useAi: "Использовать ИИ",
      connectAgent: "Подключить мой Agent (необязательно)",
      developerApiKey: "API-ключ разработчика",
      share: "Создать безопасную карточку",
    },
    wallet: {
      heading: "Что вы создадите первым?",
      balance: {
        ariaLabel: "Ваш баланс ИИ",
        remaining: "Осталось Build Credits",
        expires: (date) => `Истекают ${date}`,
        used: (percent, credits) =>
          `Использовано ${percent}% из ${credits} кредитов`,
        reserved: (credits) => `Зарезервировано: ${credits}`,
      },
      tasks: {
        heading: "Выберите быстрый старт",
        presets: {
          study: {
            label: "Учёба",
            description: "Превратите заметки в учебное пособие",
          },
          coding: {
            label: "Кодинг",
            description: "Разберите ошибку или улучшите код",
          },
          career: {
            label: "Карьера",
            description: "Улучшите резюме или сообщение",
          },
          "pick-my-bowl": {
            label: "Выбрать боул",
            description: "Соберите боул под свой бюджет",
          },
        },
        advancedSummary: "Дополнительно: выбрать модель",
        modelPreference: "Предпочтение модели",
        modelOptions: {
          best: "Лучший вариант для задачи",
          fast: "Быстро и по делу",
          reasoning: "Более глубокий анализ",
        },
        costNote:
          "В бета-версии каждый вариант расходует 120 Build Credits. Доступны только модели из списка сервера.",
      },
      nextSteps: {
        eyebrow: "Необязательные следующие шаги",
        title: "Создавайте по-своему",
        connectAgent: "Подключить мой Agent",
        share: "Создать карточку",
      },
    },
    task: {
      backToWallet: "Баланс",
      blankInput: "Расскажите, над чем вы работаете.",
      characterCount: (count, maximum) => `${count}/${maximum}`,
      credits: (credits) => `${credits} кредитов`,
      helpPrompt: "С чем вам помочь?",
      model: {
        summary: "Дополнительно: выбрать модель",
        preference: "Предпочтение модели",
        options: {
          best: "Лучший вариант для задачи",
          balanced: "Сбалансированный помощник",
          fast: "Быстро и по делу",
          coding: "Специалист по коду",
          reasoning: "Более глубокий анализ",
        },
        costNote:
          "В бета-версии каждый вариант расходует 120 Build Credits. Доступны только модели из списка сервера.",
      },
      generate: "Создать",
      generating: "Создаём…",
      errors: {
        insufficientCredits:
          "Для этой задачи нужно 120 Build Credits.",
        walletExpired: "Срок действия этих Build Credits истёк.",
        providerLimit:
          "Этот бета-баланс достиг лимита расходов на провайдера.",
        throttled:
          "Слишком много запросов. Подождите минуту и повторите попытку.",
        inProgress:
          "Задача ещё выполняется. Немного подождите и повторите попытку — один запрос не будет списан дважды.",
        replayExpired:
          "Этот завершённый повтор слишком стар, чтобы показать его снова. Начните новую задачу; провайдер не вызывался повторно.",
        retryConflict:
          "Повтор больше не соответствует исходному запросу. Начните новую задачу.",
        providerUnavailable:
          "ИИ временно недоступен. Если провайдер завершился с ошибкой, 120 кредитов не были списаны.",
        generic:
          "Не удалось создать результат. Повторите попытку чуть позже.",
      },
      empty: {
        title: "Результат появится здесь",
        description:
          "Выберите быстрый старт или опишите задачу. Одна генерация использует 120 Build Credits.",
      },
      result: {
        generatedNow: "Создано только что",
        copy: "Копировать",
        copied: "Скопировано",
        copyError: "Не удалось скопировать",
        save: "Сохранить",
        saving: "Сохраняем…",
        savedToHistory: "Сохранено в истории",
        startAnother: "Начать другую задачу",
        saveError:
          "Этот результат больше нельзя сохранить. Скопируйте его перед выходом со страницы.",
      },
      partner: {
        title: "Подключить мой Agent (необязательно)",
        description:
          "Создайте личный отзывной API-ключ YGF, который использует оставшиеся Credits вашего баланса.",
        action: "Настроить Agent",
      },
      tasks: {
        study: {
          title: "Помощь с учёбой",
          quickStartsLabel: "Быстрый старт для учёбы",
          inputLabel: "Над чем вы работаете?",
          example:
            "Превратите эти заметки в одностраничное пособие и 10 карточек.",
          presets: [
            "Составить учебное пособие",
            "Создать карточки",
            "Проверить мои знания",
            "Объяснить понятие",
          ],
          reviewNote:
            "ИИ может ошибаться. Проверьте результат перед использованием.",
        },
        coding: {
          title: "Помощь с кодом",
          quickStartsLabel: "Быстрый старт для кода",
          inputLabel: "Над чем вы работаете?",
          example:
            "Вставьте ошибку и связанный код. Попросите самое небольшое безопасное исправление.",
          presets: [
            "Объяснить эту ошибку",
            "Улучшить эту функцию",
            "Написать тесты",
            "Сравнить подходы",
          ],
          reviewNote:
            "ИИ может ошибаться. Протестируйте и проверьте результат перед отправкой.",
        },
        career: {
          title: "Помощь с карьерой",
          quickStartsLabel: "Быстрый старт для карьеры",
          inputLabel: "Над чем вы работаете?",
          example:
            "Перепишите этот пункт резюме для стажировки по разработке ПО.",
          presets: [
            "Переписать пункт резюме",
            "Составить первое письмо",
            "Адаптировать моё представление",
            "Создать истории STAR",
          ],
          reviewNote:
            "ИИ может ошибаться. Проверьте результат перед использованием.",
        },
        "pick-my-bowl": {
          title: "Выбрать мой боул",
          quickStartsLabel: "Быстрый старт для выбора боула",
          inputLabel: "Чего вам хочется?",
          example:
            "Предложите сытный вегетарианский боул с лёгкой остротой. Я уточню ингредиенты у сотрудников.",
          presets: [
            "Боул дешевле $16",
            "Больше белка, меньше остроты",
            "Вегетарианский и вкусный",
            "Сытный вечерний боул",
          ],
          reviewNote:
            "ИИ может ошибаться. Проверьте результат перед использованием.",
          safetyNote:
            "Рекомендации по еде носят справочный характер. Уточняйте ингредиенты и аллергены у сотрудников YGF.",
        },
      },
    },
    agent: {
      eyebrow: "Необязательный путь для разработчика",
      title: "Подключите свой Agent",
      description:
        "Используйте личный ключ YGF в ПО с OpenAI-совместимым API. Предпочитаете готовые инструменты ИИ? Они доступны в один клик.",
      controlsLanguageNotice:
        "Расширенные настройки ниже пока доступны на английском языке.",
      useYgfAi: "Использовать YGF AI",
    },
  },
};
