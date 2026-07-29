import type { SupportedLocale } from "@/lib/i18n/locales";

interface ClaudeGiftCopy {
  callout: {
    action: string;
    description: string;
    title: string;
  };
  page: {
    action: string;
    actionHint: string;
    backToWallet: string;
    confidentialityNote: string;
    confidentialityTitle: string;
    description: string;
    disclaimer: string;
    expiredDescription: string;
    expiredTitle: string;
    expires: (date: string) => string;
    opened: string;
    ready: string;
    reopenAction: string;
    revealedDescription: string;
    revealedTitle: string;
    revokedDescription: string;
    revokedTitle: string;
    title: string;
  };
}

export const rewardIntlLocales: Record<SupportedLocale, string> = {
  en: "en-US",
  zh: "zh-CN",
  es: "es-US",
  fr: "fr-FR",
  ru: "ru-RU",
};

export const rewardCopy: Record<SupportedLocale, ClaudeGiftCopy> = {
  en: {
    callout: {
      title: "Your code unlocked a Claude Pro gift",
      description:
        "This is a separate, limited promotional gift. Your 3,000 YGF Credits are ready too.",
      action: "View gift safely",
    },
    page: {
      title: "Your Claude Pro gift",
      description:
        "Open this private gift only when you are ready. The destination is operated by Anthropic.",
      opened: "Opened before — safe to retry",
      ready: "Ready to open",
      expires: (date) => `Available until ${date}`,
      action: "Open private gift",
      reopenAction: "Open gift again",
      actionHint:
        "This securely opens the official third-party destination. YGF never displays the private link on this page.",
      confidentialityTitle: "Keep this gift private",
      confidentialityNote:
        "Do not post, forward, screenshot, or share the destination. Anyone who receives a private gift link may be able to use it.",
      disclaimer:
        "Claude and Claude Pro are provided by Anthropic. YGF is not affiliated with, sponsored by, or endorsed by Anthropic. Eligibility and redemption are subject to Anthropic’s terms.",
      revealedTitle: "Gift link opened",
      revealedDescription:
        "If the earlier navigation did not finish, you can safely open the same private destination again. The external gift itself still allows only one redemption.",
      expiredTitle: "This gift has expired",
      expiredDescription:
        "The gift can no longer be opened. Your YGF Credits and wallet are unchanged.",
      revokedTitle: "This gift is unavailable",
      revokedDescription:
        "This promotional gift has been withdrawn. Your YGF Credits and wallet are unchanged.",
      backToWallet: "Back to my YGF wallet",
    },
  },
  zh: {
    callout: {
      title: "你的兑换码还解锁了 Claude Pro 礼赠",
      description:
        "这是单独提供的限量推广礼赠，你的 3,000 杨国福 AI Credits 也已正常到账。",
      action: "安全查看礼赠",
    },
    page: {
      title: "你的 Claude Pro 礼赠",
      description:
        "准备好后再打开这份私人礼赠。目标页面由 Anthropic 运营。",
      opened: "曾经打开过 · 可安全重试",
      ready: "可以打开",
      expires: (date) => `可用至 ${date}`,
      action: "打开私人礼赠",
      reopenAction: "再次打开礼赠",
      actionHint:
        "系统将安全打开官方第三方目标页面；杨国福不会在本页显示私人链接。",
      confidentialityTitle: "请保密这份礼赠",
      confidentialityNote:
        "请勿发布、转发、截图或分享目标页面。任何获得私人礼赠链接的人都可能使用它。",
      disclaimer:
        "Claude 和 Claude Pro 由 Anthropic 提供。杨国福与 Anthropic 不存在关联、赞助或背书关系。资格与兑换以 Anthropic 的条款为准。",
      revealedTitle: "礼赠链接已打开",
      revealedDescription:
        "如果上次跳转没有完成，你可以安全地再次打开同一私人目标页面；第三方礼赠本身仍只能兑换一次。",
      expiredTitle: "这份礼赠已过期",
      expiredDescription:
        "该礼赠已无法打开，你的杨国福 AI Credits 和钱包不受影响。",
      revokedTitle: "这份礼赠目前不可用",
      revokedDescription:
        "该推广礼赠已被撤回，你的杨国福 AI Credits 和钱包不受影响。",
      backToWallet: "返回我的杨国福钱包",
    },
  },
  es: {
    callout: {
      title: "Tu código desbloqueó un regalo de Claude Pro",
      description:
        "Es un regalo promocional limitado e independiente. Tus 3.000 YGF Credits también están listos.",
      action: "Ver el regalo de forma segura",
    },
    page: {
      title: "Tu regalo de Claude Pro",
      description:
        "Abre este regalo privado solo cuando estés listo. El destino es operado por Anthropic.",
      opened: "Abierto antes — es seguro reintentarlo",
      ready: "Listo para abrir",
      expires: (date) => `Disponible hasta ${date}`,
      action: "Abrir regalo privado",
      reopenAction: "Abrir el regalo otra vez",
      actionHint:
        "Esto abre de forma segura el destino oficial de un tercero. YGF nunca muestra el enlace privado en esta página.",
      confidentialityTitle: "Mantén este regalo en privado",
      confidentialityNote:
        "No publiques, reenvíes, captures ni compartas el destino. Cualquier persona que reciba un enlace privado podría usarlo.",
      disclaimer:
        "Claude y Claude Pro son proporcionados por Anthropic. YGF no está afiliado, patrocinado ni respaldado por Anthropic. La elegibilidad y el canje están sujetos a los términos de Anthropic.",
      revealedTitle: "Enlace del regalo abierto",
      revealedDescription:
        "Si la navegación anterior no terminó, puedes volver a abrir de forma segura el mismo destino privado. El regalo externo solo permite un canje.",
      expiredTitle: "Este regalo ha caducado",
      expiredDescription:
        "El regalo ya no se puede abrir. Tus YGF Credits y tu monedero no cambian.",
      revokedTitle: "Este regalo no está disponible",
      revokedDescription:
        "Este regalo promocional se ha retirado. Tus YGF Credits y tu monedero no cambian.",
      backToWallet: "Volver a mi monedero YGF",
    },
  },
  fr: {
    callout: {
      title: "Votre code a débloqué un cadeau Claude Pro",
      description:
        "Il s’agit d’un cadeau promotionnel limité et distinct. Vos 3 000 YGF Credits sont également disponibles.",
      action: "Voir le cadeau en toute sécurité",
    },
    page: {
      title: "Votre cadeau Claude Pro",
      description:
        "N’ouvrez ce cadeau privé que lorsque vous êtes prêt. La destination est exploitée par Anthropic.",
      opened: "Déjà ouvert — nouvelle tentative sûre",
      ready: "Prêt à ouvrir",
      expires: (date) => `Disponible jusqu’au ${date}`,
      action: "Ouvrir le cadeau privé",
      reopenAction: "Ouvrir à nouveau le cadeau",
      actionHint:
        "Cette action ouvre de manière sécurisée la destination officielle d’un tiers. YGF n’affiche jamais le lien privé sur cette page.",
      confidentialityTitle: "Gardez ce cadeau confidentiel",
      confidentialityNote:
        "Ne publiez, transférez, capturez ou partagez pas la destination. Toute personne recevant un lien privé pourrait l’utiliser.",
      disclaimer:
        "Claude et Claude Pro sont fournis par Anthropic. YGF n’est ni affilié, ni sponsorisé, ni approuvé par Anthropic. L’éligibilité et l’utilisation sont soumises aux conditions d’Anthropic.",
      revealedTitle: "Lien du cadeau ouvert",
      revealedDescription:
        "Si la navigation précédente n’a pas abouti, vous pouvez rouvrir en toute sécurité la même destination privée. Le cadeau externe reste utilisable une seule fois.",
      expiredTitle: "Ce cadeau a expiré",
      expiredDescription:
        "Le cadeau ne peut plus être ouvert. Vos YGF Credits et votre portefeuille restent inchangés.",
      revokedTitle: "Ce cadeau n’est pas disponible",
      revokedDescription:
        "Ce cadeau promotionnel a été retiré. Vos YGF Credits et votre portefeuille restent inchangés.",
      backToWallet: "Retour à mon portefeuille YGF",
    },
  },
  ru: {
    callout: {
      title: "Ваш код открыл подарок Claude Pro",
      description:
        "Это отдельный лимитированный промоподарок. Ваши 3 000 YGF Credits также уже доступны.",
      action: "Безопасно посмотреть подарок",
    },
    page: {
      title: "Ваш подарок Claude Pro",
      description:
        "Открывайте этот приватный подарок только тогда, когда будете готовы. Целевая страница управляется Anthropic.",
      opened: "Уже открывался — повтор безопасен",
      ready: "Готов к открытию",
      expires: (date) => `Доступен до ${date}`,
      action: "Открыть приватный подарок",
      reopenAction: "Открыть подарок снова",
      actionHint:
        "Будет безопасно открыта официальная сторонняя страница. YGF не показывает приватную ссылку на этой странице.",
      confidentialityTitle: "Не делитесь этим подарком",
      confidentialityNote:
        "Не публикуйте, не пересылайте, не фотографируйте и не передавайте целевую страницу. Любой, кто получит приватную ссылку, может воспользоваться ею.",
      disclaimer:
        "Claude и Claude Pro предоставляются Anthropic. YGF не связан с Anthropic, не спонсируется и не поддерживается Anthropic. Право на подарок и его активация регулируются условиями Anthropic.",
      revealedTitle: "Ссылка на подарок открыта",
      revealedDescription:
        "Если предыдущий переход не завершился, можно безопасно снова открыть ту же приватную страницу. Сам внешний подарок по-прежнему можно активировать только один раз.",
      expiredTitle: "Срок действия подарка истёк",
      expiredDescription:
        "Подарок больше нельзя открыть. Ваши YGF Credits и кошелёк не изменились.",
      revokedTitle: "Этот подарок недоступен",
      revokedDescription:
        "Промоподарок был отозван. Ваши YGF Credits и кошелёк не изменились.",
      backToWallet: "Вернуться в мой кошелёк YGF",
    },
  },
};
