import type { CampaignLocale } from "@/lib/i18n/campaign";

export type RedeemErrorKey =
  | "anonymousUnavailable"
  | "codeInvalid"
  | "codeUnavailable"
  | "generic"
  | "qrInvalid"
  | "serviceUnavailable"
  | "termsRequired"
  | "validationThrottled";

export type RedeemCopy = Readonly<{
  backToOffer: string;
  form: Readonly<{
    codeHint: string;
    codeLabel: string;
    consentAnd: string;
    consentPrefix: string;
    errors: Readonly<Record<RedeemErrorKey, string>>;
    fallbackSignIn: string;
    pendingDescription: string;
    pendingEyebrow: string;
    pendingHint: string;
    pendingSubmit: string;
    pendingSubmitting: string;
    pendingTitle: string;
    privacyLabel: string;
    opensInNewTab: string;
    rule: string;
    scannedStatus: string;
    submit: string;
    submitting: string;
    termsLabel: string;
  }>;
  intro: string;
  next: Readonly<{
    description: string;
    title: string;
  }>;
  preview: Readonly<{
    ariaLabel: string;
    cardCode: string;
    example: string;
    privateSide: string;
    reward: string;
    title: string;
  }>;
  title: string;
}>;

export const redeemCopy: Record<CampaignLocale, RedeemCopy> = {
  en: {
    backToOffer: "Back to offer",
    title: "Unlock 3,000 AI Credits",
    intro:
      "Scan the private QR on your YGF AI card or enter its 8-character code.",
    preview: {
      ariaLabel: "Illustrative YGF AI card with an example code",
      title: "YGF AI Card",
      privateSide: "Private redemption side",
      reward: "Reward",
      cardCode: "Example card code",
      example: "Example only — use the private code on your own card",
    },
    next: {
      title: "What happens next",
      description:
        "Every valid code adds 3,000 credits in this browser. Selected special codes may also include a Claude Pro gift. Then choose Study, Coding, Career, or Pick My Bowl—no login screen.",
    },
    form: {
      codeLabel: "8-character card code",
      codeHint: "Printed beneath the private QR on your card.",
      scannedStatus:
        "Code scanned ✓ — review the terms, then unlock your credits.",
      consentPrefix: "I agree to the",
      termsLabel: "promotional terms",
      consentAnd: "and",
      privacyLabel: "privacy notice",
      opensInNewTab: "opens in a new tab",
      submit: "Unlock 3,000 credits",
      submitting: "Checking card…",
      rule: "One code per person · Credits expire 14 days after redemption.",
      fallbackSignIn: "Use account sign-in instead",
      pendingEyebrow: "Card claim secured",
      pendingTitle: "Ready to unlock 3,000 AI Credits",
      pendingDescription:
        "Your private card code stayed protected while you signed in.",
      pendingSubmit: "Confirm and unlock credits",
      pendingSubmitting: "Adding credits…",
      pendingHint: "One confirmation finishes your claim.",
      errors: {
        codeInvalid: "Enter the 8-character card code.",
        codeUnavailable:
          "That code is invalid or unavailable. Check the card and try again.",
        termsRequired:
          "Agree to the promotional terms and privacy notice to continue.",
        qrInvalid:
          "That private QR is not valid. Enter the code printed on your card.",
        validationThrottled:
          "Too many checks were made. Wait a few minutes, then try again.",
        serviceUnavailable:
          "Claims are temporarily unavailable. Your saved claim is safe—try again shortly.",
        anonymousUnavailable:
          "Quick guest access is unavailable. Your secured claim is still ready; use account sign-in instead.",
        generic: "We couldn’t complete the claim. Please try again.",
      },
    },
  },
  zh: {
    backToOffer: "返回活动页",
    title: "解锁 3,000 AI Credits",
    intro: "扫描杨国福 AI 算力卡背面的私人二维码，或输入卡片上的 8 位兑换码。",
    preview: {
      ariaLabel: "带有示例兑换码的杨国福 AI 算力卡示意图",
      title: "杨国福 AI 算力卡",
      privateSide: "私人兑换面",
      reward: "可领取",
      cardCode: "示例兑换码",
      example: "仅作示例——请使用您自己卡片上的私人兑换码",
    },
    next: {
      title: "接下来会发生什么",
      description:
        "每个有效兑换码都会在此浏览器中加入 3,000 杨国福 AI Credits；部分特别兑换码还可能附带一份 Claude Pro 礼赠。然后直接选择学习、编程、求职或下一碗，无需登录。",
    },
    form: {
      codeLabel: "卡片上的 8 位兑换码",
      codeHint: "印在卡片私人二维码的下方。",
      scannedStatus: "已扫描兑换码 ✓ 请确认条款，然后解锁 Credits。",
      consentPrefix: "我同意",
      termsLabel: "活动条款",
      consentAnd: "和",
      privacyLabel: "隐私声明",
      opensInNewTab: "在新标签页打开",
      submit: "解锁 3,000 Credits",
      submitting: "正在检查卡片…",
      rule: "每人限兑换一次 · Credits 在兑换后 14 天到期。",
      fallbackSignIn: "改用账户登录",
      pendingEyebrow: "卡片权益已安全保存",
      pendingTitle: "可以解锁 3,000 AI Credits",
      pendingDescription: "登录期间，您的私人兑换码一直受到安全保护。",
      pendingSubmit: "确认并解锁 Credits",
      pendingSubmitting: "正在加入 Credits…",
      pendingHint: "再确认一次即可完成兑换。",
      errors: {
        codeInvalid: "请输入卡片上的 8 位兑换码。",
        codeUnavailable: "此兑换码无效或不可用。请检查卡片后重试。",
        termsRequired: "请同意活动条款和隐私声明后继续。",
        qrInvalid: "此私人二维码无效。请改为输入卡片上印刷的兑换码。",
        validationThrottled: "检查次数过多。请等待几分钟后重试。",
        serviceUnavailable: "兑换服务暂时不可用。已保存的权益仍然安全，请稍后重试。",
        anonymousUnavailable:
          "访客模式暂时不可用。您的权益仍已安全保存，请改用账户登录。",
        generic: "暂时无法完成兑换，请重试。",
      },
    },
  },
  es: {
    backToOffer: "Volver a la oferta",
    title: "Desbloquea 3,000 créditos de IA",
    intro:
      "Escanea el QR privado de tu tarjeta YGF AI o escribe su código de 8 caracteres.",
    preview: {
      ariaLabel: "Tarjeta YGF AI ilustrativa con un código de ejemplo",
      title: "Tarjeta YGF AI",
      privateSide: "Lado privado de canje",
      reward: "Recompensa",
      cardCode: "Código de ejemplo",
      example: "Solo es un ejemplo; usa el código privado de tu propia tarjeta",
    },
    next: {
      title: "Qué sucede después",
      description:
        "Cada código válido añade 3,000 créditos en este navegador. Algunos códigos especiales seleccionados también pueden incluir un regalo de Claude Pro. Después elige Estudio, Programación, Carrera o Elige mi bowl, sin iniciar sesión.",
    },
    form: {
      codeLabel: "Código de 8 caracteres",
      codeHint: "Está impreso debajo del QR privado de tu tarjeta.",
      scannedStatus:
        "Código escaneado ✓ Revisa los términos y desbloquea tus créditos.",
      consentPrefix: "Acepto los",
      termsLabel: "términos de la promoción",
      consentAnd: "y el",
      privacyLabel: "aviso de privacidad",
      opensInNewTab: "se abre en una pestaña nueva",
      submit: "Desbloquear 3,000 créditos",
      submitting: "Comprobando la tarjeta…",
      rule:
        "Un código por persona · Los créditos vencen 14 días después del canje.",
      fallbackSignIn: "Usar inicio de sesión",
      pendingEyebrow: "Canje protegido",
      pendingTitle: "Todo listo para desbloquear 3,000 créditos de IA",
      pendingDescription:
        "El código privado de tu tarjeta estuvo protegido mientras iniciabas sesión.",
      pendingSubmit: "Confirmar y desbloquear",
      pendingSubmitting: "Añadiendo créditos…",
      pendingHint: "Una confirmación completa el canje.",
      errors: {
        codeInvalid: "Escribe el código de 8 caracteres de la tarjeta.",
        codeUnavailable:
          "Ese código no es válido o no está disponible. Revisa la tarjeta e inténtalo de nuevo.",
        termsRequired:
          "Acepta los términos de la promoción y el aviso de privacidad para continuar.",
        qrInvalid:
          "Ese QR privado no es válido. Escribe el código impreso en tu tarjeta.",
        validationThrottled:
          "Se hicieron demasiadas comprobaciones. Espera unos minutos e inténtalo de nuevo.",
        serviceUnavailable:
          "El canje no está disponible temporalmente. Tu solicitud guardada está segura; inténtalo más tarde.",
        anonymousUnavailable:
          "El acceso rápido para invitados no está disponible. Tu solicitud está protegida; usa el inicio de sesión.",
        generic: "No pudimos completar el canje. Inténtalo de nuevo.",
      },
    },
  },
  fr: {
    backToOffer: "Retour à l’offre",
    title: "Débloquez 3 000 crédits IA",
    intro:
      "Scannez le QR privé de votre carte YGF AI ou saisissez son code à 8 caractères.",
    preview: {
      ariaLabel: "Carte YGF AI illustrative avec un code d’exemple",
      title: "Carte YGF AI",
      privateSide: "Face privée d’activation",
      reward: "Avantage",
      cardCode: "Code d’exemple",
      example:
        "Exemple uniquement — utilisez le code privé de votre propre carte",
    },
    next: {
      title: "Et ensuite ?",
      description:
        "Chaque code valide ajoute 3 000 crédits dans ce navigateur. Certains codes spéciaux sélectionnés peuvent aussi inclure un cadeau Claude Pro. Choisissez ensuite Études, Code, Carrière ou Choisir mon bowl, sans connexion.",
    },
    form: {
      codeLabel: "Code de carte à 8 caractères",
      codeHint: "Il est imprimé sous le QR privé de votre carte.",
      scannedStatus:
        "Code scanné ✓ Vérifiez les conditions, puis débloquez vos crédits.",
      consentPrefix: "J’accepte les",
      termsLabel: "conditions de la promotion",
      consentAnd: "et la",
      privacyLabel: "politique de confidentialité",
      opensInNewTab: "s’ouvre dans un nouvel onglet",
      submit: "Débloquer 3 000 crédits",
      submitting: "Vérification de la carte…",
      rule:
        "Un code par personne · Les crédits expirent 14 jours après l’activation.",
      fallbackSignIn: "Utiliser la connexion au compte",
      pendingEyebrow: "Activation sécurisée",
      pendingTitle: "Prêt à débloquer 3 000 crédits IA",
      pendingDescription:
        "Le code privé de votre carte est resté protégé pendant la connexion.",
      pendingSubmit: "Confirmer et débloquer",
      pendingSubmitting: "Ajout des crédits…",
      pendingHint: "Une confirmation termine l’activation.",
      errors: {
        codeInvalid: "Saisissez le code à 8 caractères de la carte.",
        codeUnavailable:
          "Ce code est invalide ou indisponible. Vérifiez la carte et réessayez.",
        termsRequired:
          "Acceptez les conditions de la promotion et la politique de confidentialité pour continuer.",
        qrInvalid:
          "Ce QR privé n’est pas valide. Saisissez le code imprimé sur votre carte.",
        validationThrottled:
          "Trop de vérifications ont été effectuées. Attendez quelques minutes et réessayez.",
        serviceUnavailable:
          "L’activation est temporairement indisponible. Votre demande enregistrée reste protégée ; réessayez plus tard.",
        anonymousUnavailable:
          "L’accès invité rapide est indisponible. Votre demande reste protégée ; utilisez la connexion au compte.",
        generic: "Nous n’avons pas pu terminer l’activation. Réessayez.",
      },
    },
  },
  ru: {
    backToOffer: "Назад к предложению",
    title: "Получите 3 000 AI Credits",
    intro:
      "Отсканируйте приватный QR на карте YGF AI или введите 8-значный код с карты.",
    preview: {
      ariaLabel: "Пример карты YGF AI с демонстрационным кодом",
      title: "Карта YGF AI",
      privateSide: "Приватная сторона активации",
      reward: "Начисление",
      cardCode: "Пример кода",
      example: "Это пример — используйте приватный код со своей карты",
    },
    next: {
      title: "Что будет дальше",
      description:
        "Каждый действительный код добавляет 3 000 Credits в этом браузере. Некоторые специальные коды также могут включать подарок Claude Pro. Затем выберите Учёбу, Программирование, Карьеру или Мой боул — вход не нужен.",
    },
    form: {
      codeLabel: "8-значный код карты",
      codeHint: "Он напечатан под приватным QR на вашей карте.",
      scannedStatus:
        "Код отсканирован ✓ Проверьте условия и получите Credits.",
      consentPrefix: "Я принимаю",
      termsLabel: "условия акции",
      consentAnd: "и",
      privacyLabel: "уведомление о конфиденциальности",
      opensInNewTab: "откроется в новой вкладке",
      submit: "Получить 3 000 Credits",
      submitting: "Проверяем карту…",
      rule:
        "Один код на человека · Credits действуют 14 дней после активации.",
      fallbackSignIn: "Войти в аккаунт",
      pendingEyebrow: "Активация защищена",
      pendingTitle: "Можно получить 3 000 AI Credits",
      pendingDescription:
        "Приватный код карты оставался защищённым во время входа.",
      pendingSubmit: "Подтвердить и получить Credits",
      pendingSubmitting: "Добавляем Credits…",
      pendingHint: "Одно подтверждение завершит активацию.",
      errors: {
        codeInvalid: "Введите 8-значный код с карты.",
        codeUnavailable:
          "Этот код недействителен или недоступен. Проверьте карту и повторите попытку.",
        termsRequired:
          "Примите условия акции и уведомление о конфиденциальности, чтобы продолжить.",
        qrInvalid:
          "Этот приватный QR недействителен. Введите код, напечатанный на карте.",
        validationThrottled:
          "Слишком много проверок. Подождите несколько минут и повторите попытку.",
        serviceUnavailable:
          "Активация временно недоступна. Сохранённая заявка защищена — повторите попытку позже.",
        anonymousUnavailable:
          "Быстрый гостевой доступ недоступен. Ваша заявка защищена — войдите в аккаунт.",
        generic: "Не удалось завершить активацию. Повторите попытку.",
      },
    },
  },
};
