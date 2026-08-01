import type { SiteLocale } from "@/lib/i18n/site";
import type { ShareCardTaskType } from "@/lib/share/card";

type TaskStatus = "completed" | "failed";

export type AuthMessageKey =
  | "callbackError"
  | "anonymousError"
  | "identityAlreadyExists"
  | "providerError"
  | "magicLinkError"
  | "magicLinkSent";

export type RedemptionStateKey =
  | "alreadyUsed"
  | "expired"
  | "revoked"
  | "blocked";

type CustomerPagesCopy = Readonly<{
  auth: Readonly<{
    anonymous: Readonly<{
      apple: string;
      description: string;
      google: string;
      title: string;
      warning: string;
    }>;
    demo: Readonly<{
      continue: string;
      description: string;
      title: string;
    }>;
    messages: Readonly<Record<AuthMessageKey, string>>;
    providerAvailability: Readonly<
      Record<
        "anonymous" | "recovery",
        Readonly<Record<"apple" | "both" | "google", string>>
      >
    >;
    recovery: Readonly<{
      apple: string;
      description: string;
      emailLabel: string;
      emailSubmit: string;
      google: string;
      or: string;
      title: string;
    }>;
  }>;
  history: Readonly<{
    agent: Readonly<{
      action: string;
      description: string;
      title: string;
    }>;
    backToWallet: string;
    emptyAction: string;
    emptyDescription: string;
    emptyTitle: string;
    privacyDescription: string;
    resultNotSaved: string;
    models: Readonly<
      Record<
        "balanced" | "fast" | "coding" | "reasoning" | "campaign",
        string
      >
    >;
    statuses: Readonly<Record<TaskStatus, string>>;
    title: string;
  }>;
  share: Readonly<{
    card: Readonly<{
      campaign: string;
      description: string;
      firstBuild: (taskLabel: string) => string;
      hashtag: string;
      milestone: string;
      taskLabels: Readonly<Record<ShareCardTaskType, string>>;
      uscDisclaimer: string;
    }>;
    controls: Readonly<{
      description: (hasTask: boolean) => string;
      download: string;
      downloaded: string;
      error: string;
      preparing: string;
      preparingStatus: string;
    }>;
    page: Readonly<{
      description: string;
      eyebrow: string;
      title: string;
    }>;
  }>;
  terminal: Readonly<
    Record<
      RedemptionStateKey,
      Readonly<{
        actionLabel: string;
        description: string;
        title: string;
      }>
    >
  >;
}>;

export const customerPageIntlLocales: Record<SiteLocale, string> = {
  en: "en-US",
  zh: "zh-CN",
  es: "es-ES",
  fr: "fr-FR",
  ru: "ru-RU",
};

export const customerPagesCopy = {
  en: {
    terminal: {
      alreadyUsed: {
        title: "This code was already used",
        description:
          "If you claimed it earlier, reopen the same browser wallet. If you linked an account, sign in with that same account. An unlinked guest wallet cannot be recovered after browser data is cleared. Staff never need your full code.",
        actionLabel: "Open my wallet",
      },
      expired: {
        title: "This claim has expired",
        description:
          "This code or wallet is outside its available window. Ask YGF staff for privacy-safe help if you believe this is an error.",
        actionLabel: "Try another code",
      },
      revoked: {
        title: "This code is unavailable",
        description:
          "This card code was withdrawn and cannot be redeemed. Ask YGF staff for privacy-safe help if you believe this is an error.",
        actionLabel: "Try another code",
      },
      blocked: {
        title: "Please wait before trying again",
        description:
          "Too many attempts were made in a short period. Wait a few minutes, then enter the printed card code carefully.",
        actionLabel: "Try another code",
      },
    },
    auth: {
      messages: {
        callbackError: "We couldn’t complete sign-in. Please try again.",
        anonymousError:
          "Quick guest access is temporarily unavailable. Your secured claim is still waiting.",
        identityAlreadyExists:
          "That Google or Apple identity already belongs to another YGF account. Your current guest Credits were not moved. To keep this guest wallet, choose a different identity. Only sign out if you intend to use the existing account—the guest wallet will remain separate and may no longer be accessible from this browser.",
        providerError:
          "Sign-in could not start. Please try another option.",
        magicLinkError:
          "We couldn’t send the sign-in link. Check the email and try again.",
        magicLinkSent: "Check your email for a secure sign-in link.",
      },
      providerAvailability: {
        anonymous: {
          both:
            "Google and Apple linking aren’t available yet. Your guest wallet remains safe and usable while setup is completed.",
          google:
            "Google linking isn’t available yet. You can link Apple instead, and your guest wallet remains safe and usable.",
          apple:
            "Apple linking isn’t available yet. You can link Google instead, and your guest wallet remains safe and usable.",
        },
        recovery: {
          both:
            "Google and Apple sign-in aren’t available yet. Use the email Magic Link below.",
          google:
            "Google sign-in isn’t available yet. Continue with Apple or use the email Magic Link below.",
          apple:
            "Apple sign-in isn’t available yet. Continue with Google or use the email Magic Link below.",
        },
      },
      demo: {
        title: "Continue to your Build Credits",
        description:
          "Demo mode keeps the whole flow on this device—no account setup required.",
        continue: "Continue in demo",
      },
      anonymous: {
        title: "Upgrade to connect an Agent",
        description:
          "Your guest wallet already works for YGF web AI. Link a verified identity only for personal Agent keys, recovery, and cross-device access.",
        warning:
          "Until you link an account, clearing this browser’s site data can permanently remove access to this guest wallet.",
        google: "Link Google",
        apple: "Link Apple",
      },
      recovery: {
        title: "Sign in to recover your wallet",
        description:
          "Normal card scans use a guest wallet without a login screen. Choose an account only for recovery or cross-device access.",
        google: "Continue with Google",
        apple: "Continue with Apple",
        or: "or",
        emailLabel: "Email",
        emailSubmit: "Email me a sign-in link",
      },
    },
    history: {
      backToWallet: "‹ Wallet",
      title: "Build history",
      privacyDescription:
        "Prompt text is not retained. Full results appear here only when you explicitly save them.",
      emptyTitle: "No tasks yet",
      emptyDescription:
        "Your completed and failed task metadata will appear here.",
      emptyAction: "Choose a task",
      statuses: {
        completed: "completed",
        failed: "failed",
      },
      resultNotSaved: "Result not saved · prompt not retained",
      models: {
        balanced: "Balanced guide",
        fast: "Fast and focused",
        coding: "Coding specialist",
        reasoning: "Deeper reasoning",
        campaign: "Campaign model",
      },
      agent: {
        title: "Connect my Agent",
        description:
          "Create a personal, revocable YGF API key backed by your wallet’s remaining Credits.",
        action: "Set up Agent",
      },
    },
    share: {
      page: {
        eyebrow: "YGF Bowl-to-Build",
        title: "Create your check-in card",
        description:
          "Preview the public card, then download it as an SVG when you’re ready. If you completed a task, its verified type is added automatically.",
      },
      card: {
        campaign: "YGF Bowl-to-Build",
        milestone: "Today’s bowl powered 3,000 AI Credits.",
        firstBuild: (taskLabel) => `First build: ${taskLabel}`,
        hashtag: "#一碗一算力",
        uscDisclaimer:
          "This promotion is not sponsored, endorsed by, or administered by USC.",
        description: "Public YGF Bowl-to-Build check-in card.",
        taskLabels: {
          study: "Study",
          coding: "Coding",
          career: "Career",
          "pick-my-bowl": "Pick My Bowl",
        },
      },
      controls: {
        description: (hasTask) =>
          `Your card uses only the public campaign milestone${
            hasTask ? " and your verified first completed task" : ""
          }. Nothing is posted automatically.`,
        download: "Download SVG card",
        preparing: "Preparing SVG…",
        preparingStatus: "Preparing your SVG card…",
        downloaded: "Your SVG card downloaded.",
        error: "We couldn’t prepare the card. Please try again.",
      },
    },
  },
  zh: {
    terminal: {
      alreadyUsed: {
        title: "此兑换码已使用",
        description:
          "如果你之前已兑换，请在同一浏览器中重新打开钱包。若已绑定账户，请使用同一账户登录。未绑定的访客钱包在浏览器数据被清除后无法恢复。门店员工绝不需要你的完整兑换码。",
        actionLabel: "打开我的钱包",
      },
      expired: {
        title: "此兑换权益已过期",
        description:
          "此兑换码或钱包已超出有效期。如果你认为有误，请向杨国福员工寻求不泄露隐私的帮助。",
        actionLabel: "尝试其他兑换码",
      },
      revoked: {
        title: "此兑换码不可用",
        description:
          "此卡片兑换码已撤回，无法兑换。如果你认为有误，请向杨国福员工寻求不泄露隐私的帮助。",
        actionLabel: "尝试其他兑换码",
      },
      blocked: {
        title: "请稍后再试",
        description:
          "短时间内尝试次数过多。请等待几分钟，再仔细输入卡片上印刷的兑换码。",
        actionLabel: "尝试其他兑换码",
      },
    },
    auth: {
      messages: {
        callbackError: "无法完成登录，请重试。",
        anonymousError: "访客模式暂时不可用。你已保存的兑换权益仍在等待确认。",
        identityAlreadyExists:
          "该 Google 或 Apple 身份已属于另一个杨国福账户。当前访客 Credits 未转移。若要保留此访客钱包，请选择其他身份；只有在确定要使用原账户时才退出，访客钱包仍会保持独立，并可能无法再从此浏览器访问。",
        providerError: "无法开始登录，请尝试其他方式。",
        magicLinkError: "无法发送登录链接，请检查邮箱后重试。",
        magicLinkSent: "请查收邮箱中的安全登录链接。",
      },
      providerAvailability: {
        anonymous: {
          both:
            "Google 和 Apple 账号关联暂未开放。配置完成前，你的访客钱包仍可安全正常使用。",
          google:
            "Google 账号关联暂未开放，你仍可关联 Apple，访客钱包也可安全正常使用。",
          apple:
            "Apple 账号关联暂未开放，你仍可关联 Google，访客钱包也可安全正常使用。",
        },
        recovery: {
          both:
            "Google 和 Apple 登录暂未开放，请使用下方邮箱 Magic Link。",
          google:
            "Google 登录暂未开放，请使用 Apple 或下方邮箱 Magic Link。",
          apple:
            "Apple 登录暂未开放，请使用 Google 或下方邮箱 Magic Link。",
        },
      },
      demo: {
        title: "继续使用你的 Build Credits",
        description: "演示模式会把整个流程保留在此设备上，无需创建账户。",
        continue: "继续演示",
      },
      anonymous: {
        title: "升级账户以连接 Agent",
        description:
          "你的访客钱包已可使用杨国福网页 AI。仅在需要个人 Agent Key、恢复或跨设备使用时绑定已验证身份。",
        warning:
          "绑定账户前，清除此浏览器的网站数据可能会永久失去此访客钱包。",
        google: "绑定 Google",
        apple: "绑定 Apple",
      },
      recovery: {
        title: "登录以恢复钱包",
        description:
          "普通卡片扫码会直接使用访客钱包，无需登录。只有恢复或跨设备使用时才需要选择账户。",
        google: "使用 Google 继续",
        apple: "使用 Apple 继续",
        or: "或",
        emailLabel: "邮箱",
        emailSubmit: "发送登录链接",
      },
    },
    history: {
      backToWallet: "‹ 钱包",
      title: "创建记录",
      privacyDescription:
        "我们不保留你的原始提示词。只有你主动保存后，完整结果才会显示在这里。",
      emptyTitle: "还没有任务",
      emptyDescription: "已完成和失败任务的基本信息会显示在这里。",
      emptyAction: "选择一个任务",
      statuses: {
        completed: "已完成",
        failed: "失败",
      },
      resultNotSaved: "结果未保存 · 提示词未保留",
      models: {
        balanced: "均衡助手",
        fast: "快速且专注",
        coding: "编程专用",
        reasoning: "深度推理",
        campaign: "活动模型",
      },
      agent: {
        title: "连接我的 Agent",
        description:
          "创建一把个人、可撤销的杨国福 API Key，共享钱包中的剩余 Credits 限额。",
        action: "设置 Agent",
      },
    },
    share: {
      page: {
        eyebrow: "杨国福 Bowl-to-Build",
        title: "生成你的打卡图",
        description:
          "预览公开打卡图，准备好后下载 SVG。如果你已完成任务，系统会自动加入经过验证的任务类型。",
      },
      card: {
        campaign: "杨国福 Bowl-to-Build",
        milestone: "今天这碗，为我的 AI 充了 3,000 Credits。",
        firstBuild: (taskLabel) => `第一个任务：${taskLabel}`,
        hashtag: "#一碗一算力",
        uscDisclaimer: "本活动与 USC 无隶属关系，也未获其赞助或认可。",
        description: "公开的杨国福 Bowl-to-Build 打卡图。",
        taskLabels: {
          study: "学习",
          coding: "编程",
          career: "求职",
          "pick-my-bowl": "下一碗",
        },
      },
      controls: {
        description: (hasTask) =>
          `打卡图只使用公开活动信息${
            hasTask ? "和你第一个已完成任务的类型" : ""
          }，不会自动发布。`,
        download: "下载 SVG 打卡图",
        preparing: "正在生成 SVG…",
        preparingStatus: "正在准备你的 SVG 打卡图…",
        downloaded: "SVG 打卡图已下载。",
        error: "无法生成打卡图，请重试。",
      },
    },
  },
  es: {
    terminal: {
      alreadyUsed: {
        title: "Este código ya se usó",
        description:
          "Si lo canjeaste antes, abre la cartera en el mismo navegador. Si vinculaste una cuenta, inicia sesión con esa misma cuenta. Una cartera de invitado sin vincular no puede recuperarse después de borrar los datos del navegador. El personal nunca necesita tu código completo.",
        actionLabel: "Abrir mi saldo",
      },
      expired: {
        title: "Este canje ha vencido",
        description:
          "Este código o saldo está fuera de su periodo disponible. Pide ayuda al personal de YGF sin compartir información privada si crees que es un error.",
        actionLabel: "Probar otro código",
      },
      revoked: {
        title: "Este código no está disponible",
        description:
          "Este código de tarjeta fue retirado y no puede canjearse. Pide ayuda al personal de YGF sin compartir información privada si crees que es un error.",
        actionLabel: "Probar otro código",
      },
      blocked: {
        title: "Espera antes de intentarlo de nuevo",
        description:
          "Se hicieron demasiados intentos en poco tiempo. Espera unos minutos y escribe con cuidado el código impreso en la tarjeta.",
        actionLabel: "Probar otro código",
      },
    },
    auth: {
      messages: {
        callbackError:
          "No pudimos completar el inicio de sesión. Inténtalo de nuevo.",
        anonymousError:
          "El acceso rápido para invitados no está disponible temporalmente. Tu canje protegido sigue esperando.",
        identityAlreadyExists:
          "Esa identidad de Google o Apple ya pertenece a otra cuenta de YGF. Tus Credits de invitado actuales no se movieron. Para conservar esta cartera de invitado, elige otra identidad. Cierra sesión solo si quieres usar la cuenta existente: la cartera de invitado seguirá separada y podría dejar de estar accesible en este navegador.",
        providerError:
          "No se pudo iniciar la sesión. Prueba con otra opción.",
        magicLinkError:
          "No pudimos enviar el enlace. Revisa el correo e inténtalo de nuevo.",
        magicLinkSent:
          "Revisa tu correo para encontrar el enlace seguro de acceso.",
      },
      providerAvailability: {
        anonymous: {
          both:
            "La vinculación con Google y Apple aún no está disponible. Tu saldo de invitado sigue seguro y listo para usar mientras finaliza la configuración.",
          google:
            "La vinculación con Google aún no está disponible. Puedes vincular Apple y tu saldo de invitado sigue seguro y listo para usar.",
          apple:
            "La vinculación con Apple aún no está disponible. Puedes vincular Google y tu saldo de invitado sigue seguro y listo para usar.",
        },
        recovery: {
          both:
            "El acceso con Google y Apple aún no está disponible. Usa el enlace por correo de abajo.",
          google:
            "El acceso con Google aún no está disponible. Continúa con Apple o usa el enlace por correo de abajo.",
          apple:
            "El acceso con Apple aún no está disponible. Continúa con Google o usa el enlace por correo de abajo.",
        },
      },
      demo: {
        title: "Continúa a tus Build Credits",
        description:
          "El modo de demostración mantiene todo el flujo en este dispositivo, sin crear una cuenta.",
        continue: "Continuar en la demo",
      },
      anonymous: {
        title: "Actualiza tu cuenta para conectar un Agent",
        description:
          "Tu saldo de invitado ya funciona con la IA web de YGF. Vincula una identidad verificada solo para claves personales de Agent, recuperación y acceso entre dispositivos.",
        warning:
          "Hasta que vincules una cuenta, borrar los datos de este sitio puede eliminar para siempre el acceso a este saldo de invitado.",
        google: "Vincular Google",
        apple: "Vincular Apple",
      },
      recovery: {
        title: "Inicia sesión para recuperar tu saldo",
        description:
          "Los escaneos normales usan un saldo de invitado sin pantalla de acceso. Elige una cuenta solo para recuperación o uso entre dispositivos.",
        google: "Continuar con Google",
        apple: "Continuar con Apple",
        or: "o",
        emailLabel: "Correo electrónico",
        emailSubmit: "Enviarme un enlace de acceso",
      },
    },
    history: {
      backToWallet: "‹ Saldo",
      title: "Historial",
      privacyDescription:
        "No conservamos el texto del prompt. Los resultados completos aparecen aquí solo cuando los guardas de forma explícita.",
      emptyTitle: "Aún no hay tareas",
      emptyDescription:
        "Los datos de tus tareas completadas y fallidas aparecerán aquí.",
      emptyAction: "Elegir una tarea",
      statuses: {
        completed: "completada",
        failed: "fallida",
      },
      resultNotSaved: "Resultado no guardado · prompt no conservado",
      models: {
        balanced: "Guía equilibrada",
        fast: "Rápido y preciso",
        coding: "Especialista en código",
        reasoning: "Razonamiento más profundo",
        campaign: "Modelo de campaña",
      },
      agent: {
        title: "Conectar mi Agent",
        description:
          "Crea una clave API personal y revocable de YGF respaldada por los Credits restantes de tu saldo.",
        action: "Configurar Agent",
      },
    },
    share: {
      page: {
        eyebrow: "YGF Bowl-to-Build",
        title: "Crea tu tarjeta para compartir",
        description:
          "Previsualiza la tarjeta pública y descárgala como SVG cuando quieras. Si completaste una tarea, se añade automáticamente su tipo verificado.",
      },
      card: {
        campaign: "YGF Bowl-to-Build",
        milestone: "El bowl de hoy activó 3,000 AI Credits.",
        firstBuild: (taskLabel) => `Primera creación: ${taskLabel}`,
        hashtag: "#一碗一算力",
        uscDisclaimer:
          "Esta promoción no está patrocinada, respaldada ni administrada por USC.",
        description: "Tarjeta pública de YGF Bowl-to-Build.",
        taskLabels: {
          study: "Estudio",
          coding: "Programación",
          career: "Carrera",
          "pick-my-bowl": "Elegir mi bowl",
        },
      },
      controls: {
        description: (hasTask) =>
          `La tarjeta usa solo el hito público de la campaña${
            hasTask ? " y el tipo de tu primera tarea completada" : ""
          }. No se publica nada automáticamente.`,
        download: "Descargar tarjeta SVG",
        preparing: "Preparando SVG…",
        preparingStatus: "Preparando tu tarjeta SVG…",
        downloaded: "Tu tarjeta SVG se descargó.",
        error: "No pudimos preparar la tarjeta. Inténtalo de nuevo.",
      },
    },
  },
  fr: {
    terminal: {
      alreadyUsed: {
        title: "Ce code a déjà été utilisé",
        description:
          "Si vous l’avez déjà activé, rouvrez le solde dans le même navigateur. Si vous avez associé un compte, reconnectez-vous avec ce compte. Un solde invité non associé ne peut pas être récupéré après l’effacement des données du navigateur. Le personnel n’a jamais besoin de votre code complet.",
        actionLabel: "Ouvrir mon solde",
      },
      expired: {
        title: "Cette activation a expiré",
        description:
          "Ce code ou ce solde n’est plus dans sa période de validité. Demandez une aide respectueuse de la confidentialité au personnel YGF si vous pensez qu’il s’agit d’une erreur.",
        actionLabel: "Essayer un autre code",
      },
      revoked: {
        title: "Ce code est indisponible",
        description:
          "Ce code de carte a été retiré et ne peut pas être activé. Demandez une aide respectueuse de la confidentialité au personnel YGF si vous pensez qu’il s’agit d’une erreur.",
        actionLabel: "Essayer un autre code",
      },
      blocked: {
        title: "Patientez avant de réessayer",
        description:
          "Trop de tentatives ont été effectuées en peu de temps. Attendez quelques minutes, puis saisissez soigneusement le code imprimé sur la carte.",
        actionLabel: "Essayer un autre code",
      },
    },
    auth: {
      messages: {
        callbackError:
          "Nous n’avons pas pu terminer la connexion. Réessayez.",
        anonymousError:
          "L’accès invité rapide est temporairement indisponible. Votre activation sécurisée reste en attente.",
        identityAlreadyExists:
          "Cette identité Google ou Apple appartient déjà à un autre compte YGF. Vos Credits invité actuels n’ont pas été déplacés. Pour conserver ce portefeuille invité, choisissez une autre identité. Déconnectez-vous uniquement si vous souhaitez utiliser le compte existant : le portefeuille invité restera séparé et pourrait ne plus être accessible depuis ce navigateur.",
        providerError:
          "La connexion n’a pas pu démarrer. Essayez une autre option.",
        magicLinkError:
          "Nous n’avons pas pu envoyer le lien. Vérifiez l’adresse et réessayez.",
        magicLinkSent:
          "Consultez votre messagerie pour ouvrir le lien sécurisé.",
      },
      providerAvailability: {
        anonymous: {
          both:
            "L’association avec Google et Apple n’est pas encore disponible. Votre solde invité reste sécurisé et utilisable pendant la finalisation de la configuration.",
          google:
            "L’association avec Google n’est pas encore disponible. Vous pouvez associer Apple et votre solde invité reste sécurisé et utilisable.",
          apple:
            "L’association avec Apple n’est pas encore disponible. Vous pouvez associer Google et votre solde invité reste sécurisé et utilisable.",
        },
        recovery: {
          both:
            "La connexion avec Google et Apple n’est pas encore disponible. Utilisez le lien par e-mail ci-dessous.",
          google:
            "La connexion avec Google n’est pas encore disponible. Continuez avec Apple ou utilisez le lien par e-mail ci-dessous.",
          apple:
            "La connexion avec Apple n’est pas encore disponible. Continuez avec Google ou utilisez le lien par e-mail ci-dessous.",
        },
      },
      demo: {
        title: "Accédez à vos Build Credits",
        description:
          "Le mode démo conserve tout le parcours sur cet appareil, sans création de compte.",
        continue: "Continuer en mode démo",
      },
      anonymous: {
        title: "Associez un compte pour connecter un Agent",
        description:
          "Votre solde invité fonctionne déjà avec l’IA web YGF. Associez une identité vérifiée uniquement pour les clés Agent personnelles, la récupération et l’accès multiappareil.",
        warning:
          "Tant que vous n’avez pas associé de compte, effacer les données du site peut supprimer définitivement l’accès à ce solde invité.",
        google: "Associer Google",
        apple: "Associer Apple",
      },
      recovery: {
        title: "Connectez-vous pour récupérer votre solde",
        description:
          "Les scans de carte ordinaires utilisent un solde invité sans écran de connexion. Choisissez un compte uniquement pour la récupération ou l’accès multiappareil.",
        google: "Continuer avec Google",
        apple: "Continuer avec Apple",
        or: "ou",
        emailLabel: "E-mail",
        emailSubmit: "M’envoyer un lien de connexion",
      },
    },
    history: {
      backToWallet: "‹ Solde",
      title: "Historique",
      privacyDescription:
        "Le texte du prompt n’est pas conservé. Les résultats complets apparaissent ici uniquement lorsque vous les enregistrez explicitement.",
      emptyTitle: "Aucune tâche",
      emptyDescription:
        "Les métadonnées de vos tâches terminées et échouées apparaîtront ici.",
      emptyAction: "Choisir une tâche",
      statuses: {
        completed: "terminée",
        failed: "échouée",
      },
      resultNotSaved: "Résultat non enregistré · prompt non conservé",
      models: {
        balanced: "Guide équilibré",
        fast: "Rapide et ciblé",
        coding: "Spécialiste du code",
        reasoning: "Raisonnement approfondi",
        campaign: "Modèle de campagne",
      },
      agent: {
        title: "Connecter mon Agent",
        description:
          "Créez une clé API YGF personnelle et révocable, limitée par les Credits restants de votre solde.",
        action: "Configurer Agent",
      },
    },
    share: {
      page: {
        eyebrow: "YGF Bowl-to-Build",
        title: "Créez votre carte à partager",
        description:
          "Prévisualisez la carte publique, puis téléchargez-la au format SVG. Si vous avez terminé une tâche, son type vérifié est ajouté automatiquement.",
      },
      card: {
        campaign: "YGF Bowl-to-Build",
        milestone: "Le bowl du jour a activé 3 000 AI Credits.",
        firstBuild: (taskLabel) => `Première création : ${taskLabel}`,
        hashtag: "#一碗一算力",
        uscDisclaimer:
          "Cette promotion n’est ni sponsorisée, ni approuvée, ni administrée par USC.",
        description: "Carte publique YGF Bowl-to-Build.",
        taskLabels: {
          study: "Études",
          coding: "Programmation",
          career: "Carrière",
          "pick-my-bowl": "Choisir mon bowl",
        },
      },
      controls: {
        description: (hasTask) =>
          `La carte utilise uniquement l’étape publique de la campagne${
            hasTask ? " et le type vérifié de votre première tâche terminée" : ""
          }. Rien n’est publié automatiquement.`,
        download: "Télécharger la carte SVG",
        preparing: "Préparation du SVG…",
        preparingStatus: "Préparation de votre carte SVG…",
        downloaded: "Votre carte SVG a été téléchargée.",
        error: "Impossible de préparer la carte. Réessayez.",
      },
    },
  },
  ru: {
    terminal: {
      alreadyUsed: {
        title: "Этот код уже использован",
        description:
          "Если вы уже активировали его, откройте баланс в том же браузере. Если вы привязали аккаунт, войдите в тот же аккаунт. Гостевой баланс без привязки нельзя восстановить после очистки данных браузера. Сотрудникам никогда не нужен ваш полный код.",
        actionLabel: "Открыть мой баланс",
      },
      expired: {
        title: "Срок активации истёк",
        description:
          "Срок действия этого кода или баланса закончился. Если вы считаете, что произошла ошибка, обратитесь к сотруднику YGF, не раскрывая личные данные.",
        actionLabel: "Попробовать другой код",
      },
      revoked: {
        title: "Этот код недоступен",
        description:
          "Код этой карты был отозван и не может быть активирован. Если вы считаете, что произошла ошибка, обратитесь к сотруднику YGF, не раскрывая личные данные.",
        actionLabel: "Попробовать другой код",
      },
      blocked: {
        title: "Подождите перед новой попыткой",
        description:
          "За короткое время было слишком много попыток. Подождите несколько минут и внимательно введите напечатанный на карте код.",
        actionLabel: "Попробовать другой код",
      },
    },
    auth: {
      messages: {
        callbackError: "Не удалось завершить вход. Повторите попытку.",
        anonymousError:
          "Быстрый гостевой доступ временно недоступен. Сохранённая активация по-прежнему ожидает подтверждения.",
        identityAlreadyExists:
          "Эта идентификация Google или Apple уже принадлежит другому аккаунту YGF. Текущие гостевые Credits не перемещались. Чтобы сохранить этот гостевой кошелёк, выберите другую учётную запись. Выходите только если хотите использовать существующий аккаунт: гостевой кошелёк останется отдельным и может стать недоступен в этом браузере.",
        providerError:
          "Не удалось начать вход. Попробуйте другой вариант.",
        magicLinkError:
          "Не удалось отправить ссылку. Проверьте адрес и повторите попытку.",
        magicLinkSent: "Проверьте почту и откройте безопасную ссылку для входа.",
      },
      providerAvailability: {
        anonymous: {
          both:
            "Привязка Google и Apple пока недоступна. До завершения настройки гостевой баланс остаётся защищённым и доступным.",
          google:
            "Привязка Google пока недоступна. Можно привязать Apple, а гостевой баланс остаётся защищённым и доступным.",
          apple:
            "Привязка Apple пока недоступна. Можно привязать Google, а гостевой баланс остаётся защищённым и доступным.",
        },
        recovery: {
          both:
            "Вход через Google и Apple пока недоступен. Используйте ссылку по электронной почте ниже.",
          google:
            "Вход через Google пока недоступен. Продолжите через Apple или используйте ссылку по электронной почте ниже.",
          apple:
            "Вход через Apple пока недоступен. Продолжите через Google или используйте ссылку по электронной почте ниже.",
        },
      },
      demo: {
        title: "Перейдите к своим Build Credits",
        description:
          "Демо-режим сохраняет весь процесс на этом устройстве — аккаунт не нужен.",
        continue: "Продолжить в демо",
      },
      anonymous: {
        title: "Привяжите аккаунт для подключения Agent",
        description:
          "Гостевой баланс уже работает с веб-инструментами ИИ YGF. Привязывайте подтверждённый аккаунт только для личных ключей Agent, восстановления и доступа с разных устройств.",
        warning:
          "Пока аккаунт не привязан, очистка данных сайта может навсегда удалить доступ к гостевому балансу.",
        google: "Привязать Google",
        apple: "Привязать Apple",
      },
      recovery: {
        title: "Войдите, чтобы восстановить баланс",
        description:
          "Обычное сканирование карты использует гостевой баланс без экрана входа. Выбирайте аккаунт только для восстановления или доступа с разных устройств.",
        google: "Продолжить с Google",
        apple: "Продолжить с Apple",
        or: "или",
        emailLabel: "Эл. почта",
        emailSubmit: "Отправить ссылку для входа",
      },
    },
    history: {
      backToWallet: "‹ Баланс",
      title: "История",
      privacyDescription:
        "Текст запроса не сохраняется. Полные результаты появляются здесь, только если вы сохранили их сами.",
      emptyTitle: "Задач пока нет",
      emptyDescription:
        "Здесь появятся данные о завершённых и неудачных задачах.",
      emptyAction: "Выбрать задачу",
      statuses: {
        completed: "завершено",
        failed: "ошибка",
      },
      resultNotSaved: "Результат не сохранён · запрос не сохранён",
      models: {
        balanced: "Сбалансированный помощник",
        fast: "Быстро и по делу",
        coding: "Специалист по коду",
        reasoning: "Углублённое рассуждение",
        campaign: "Модель кампании",
      },
      agent: {
        title: "Подключить мой Agent",
        description:
          "Создайте личный отзывной API-ключ YGF с лимитом оставшихся Credits на балансе.",
        action: "Настроить Agent",
      },
    },
    share: {
      page: {
        eyebrow: "YGF Bowl-to-Build",
        title: "Создайте карточку для публикации",
        description:
          "Просмотрите публичную карточку и скачайте её как SVG. Если задача уже завершена, её подтверждённый тип добавится автоматически.",
      },
      card: {
        campaign: "YGF Bowl-to-Build",
        milestone: "Сегодняшний боул активировал 3 000 AI Credits.",
        firstBuild: (taskLabel) => `Первая задача: ${taskLabel}`,
        hashtag: "#一碗一算力",
        uscDisclaimer:
          "Эта акция не спонсируется, не поддерживается и не администрируется USC.",
        description: "Публичная карточка YGF Bowl-to-Build.",
        taskLabels: {
          study: "Учёба",
          coding: "Программирование",
          career: "Карьера",
          "pick-my-bowl": "Мой боул",
        },
      },
      controls: {
        description: (hasTask) =>
          `Карточка использует только публичное достижение кампании${
            hasTask ? " и тип первой завершённой задачи" : ""
          }. Ничего не публикуется автоматически.`,
        download: "Скачать SVG-карточку",
        preparing: "Подготовка SVG…",
        preparingStatus: "Подготавливаем SVG-карточку…",
        downloaded: "SVG-карточка скачана.",
        error: "Не удалось подготовить карточку. Повторите попытку.",
      },
    },
  },
} satisfies Record<SiteLocale, CustomerPagesCopy>;
