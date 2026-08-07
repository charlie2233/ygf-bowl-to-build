import type { SiteLocale } from "@/lib/i18n/site";

export type ReviewFormCopy = Readonly<{
  ariaLabel: string;
  emailLabel: string;
  messageLabel: string;
  ratingLabel: string;
  ratingOptions: readonly Readonly<{ label: string; value: string }>[];
  ratingPrompt: string;
  submitLabel: string;
}>;

type ReviewPageCopy = Readonly<{
  disclosure: string;
  documentLanguage: string;
  form: ReviewFormCopy;
  formHeading: string;
  lead: string;
  title: string;
  warning: string;
}>;

const ratingValues = ["5", "4", "3", "2", "1"] as const;

function ratingOptions(
  labels: readonly [string, string, string, string, string],
) {
  return ratingValues.map((value, index) => ({
    label: `${value} — ${labels[index]}`,
    value,
  }));
}

export const reviewPageCopy: Readonly<Record<SiteLocale, ReviewPageCopy>> = {
  en: {
    documentLanguage: "en",
    title: "Share your YGF experience",
    lead:
      "Tell us what worked well and what we can improve about your meal or AI Credits experience.",
    warning:
      "Do not submit SSNs, payment card numbers, medical data, passwords, full claim codes, or other sensitive information.",
    formHeading: "YGF review form",
    disclosure:
      "This form sends any email you provide, your rating, and your review to Formspree. Formspree may also process technical request data under its own privacy terms while delivering the review to YGF. Do not include a claim code, receipt or payment details, prompts, or other confidential information.",
    form: {
      ariaLabel: "YGF review form",
      emailLabel: "Email (optional, if you want a reply)",
      ratingLabel: "Overall rating",
      ratingPrompt: "Choose a rating",
      ratingOptions: ratingOptions([
        "Excellent",
        "Good",
        "Okay",
        "Needs improvement",
        "Poor",
      ]),
      messageLabel: "Your review",
      submitLabel: "Send review",
    },
  },
  zh: {
    documentLanguage: "zh-CN",
    title: "分享您的 YGF 体验",
    lead: "请告诉我们哪些体验做得好，以及餐食或 AI Credits 服务有哪些可以改进之处。",
    warning:
      "请勿提交社会安全号码、银行卡号、医疗资料、密码、完整兑换码或其他敏感信息。",
    formHeading: "YGF 评价表",
    disclosure:
      "本表单会将您填写的邮箱（如提供）、评分和评价发送至 Formspree。Formspree 在将评价传递给 YGF 时，也可能根据其隐私条款处理技术请求数据。请勿填写兑换码、收据或付款信息、提示词或其他机密信息。",
    form: {
      ariaLabel: "YGF 评价表",
      emailLabel: "邮箱（可选，如需回复）",
      ratingLabel: "总体评分",
      ratingPrompt: "请选择评分",
      ratingOptions: ratingOptions([
        "优秀",
        "良好",
        "一般",
        "有待改进",
        "较差",
      ]),
      messageLabel: "您的评价",
      submitLabel: "发送评价",
    },
  },
  es: {
    documentLanguage: "es",
    title: "Comparte tu experiencia con YGF",
    lead:
      "Cuéntanos qué funcionó bien y qué podemos mejorar de tu experiencia con la comida o los AI Credits.",
    warning:
      "No envíes números del Seguro Social, números de tarjetas de pago, datos médicos, contraseñas, códigos de canje completos ni otra información confidencial.",
    formHeading: "Formulario de reseña de YGF",
    disclosure:
      "Este formulario envía a Formspree el correo que proporciones, tu calificación y tu reseña. Formspree también puede procesar datos técnicos de la solicitud según sus propios términos de privacidad mientras entrega la reseña a YGF. No incluyas códigos de canje, recibos o datos de pago, prompts ni otra información confidencial.",
    form: {
      ariaLabel: "Formulario de reseña de YGF",
      emailLabel: "Correo (opcional, si deseas una respuesta)",
      ratingLabel: "Calificación general",
      ratingPrompt: "Elige una calificación",
      ratingOptions: ratingOptions([
        "Excelente",
        "Buena",
        "Aceptable",
        "Necesita mejoras",
        "Mala",
      ]),
      messageLabel: "Tu reseña",
      submitLabel: "Enviar reseña",
    },
  },
  fr: {
    documentLanguage: "fr",
    title: "Partagez votre expérience YGF",
    lead:
      "Dites-nous ce qui vous a plu et ce que nous pouvons améliorer dans votre expérience du repas ou des AI Credits.",
    warning:
      "N’envoyez pas de numéro de sécurité sociale, de carte de paiement, de données médicales, de mot de passe, de code complet ni d’autres informations sensibles.",
    formHeading: "Formulaire d’avis YGF",
    disclosure:
      "Ce formulaire envoie à Formspree l’adresse e-mail éventuellement fournie, votre note et votre avis. Formspree peut aussi traiter des données techniques de la requête selon ses propres conditions de confidentialité pendant la transmission à YGF. N’incluez pas de code, de reçu ou de données de paiement, de prompts ni d’autres informations confidentielles.",
    form: {
      ariaLabel: "Formulaire d’avis YGF",
      emailLabel: "E-mail (facultatif, si vous souhaitez une réponse)",
      ratingLabel: "Note globale",
      ratingPrompt: "Choisissez une note",
      ratingOptions: ratingOptions([
        "Excellent",
        "Bien",
        "Moyen",
        "À améliorer",
        "Mauvais",
      ]),
      messageLabel: "Votre avis",
      submitLabel: "Envoyer l’avis",
    },
  },
  ru: {
    documentLanguage: "ru",
    title: "Поделитесь впечатлениями о YGF",
    lead:
      "Расскажите, что вам понравилось и что можно улучшить в вашем опыте с блюдом или AI Credits.",
    warning:
      "Не отправляйте номера социального страхования и банковских карт, медицинские данные, пароли, полные коды активации или другую конфиденциальную информацию.",
    formHeading: "Форма отзыва о YGF",
    disclosure:
      "Эта форма отправляет в Formspree указанный вами адрес электронной почты, оценку и отзыв. При доставке отзыва в YGF Formspree также может обрабатывать технические данные запроса в соответствии со своими условиями конфиденциальности. Не указывайте код активации, данные чека или платежа, промпты либо другую конфиденциальную информацию.",
    form: {
      ariaLabel: "Форма отзыва о YGF",
      emailLabel: "Электронная почта (необязательно, если хотите ответ)",
      ratingLabel: "Общая оценка",
      ratingPrompt: "Выберите оценку",
      ratingOptions: ratingOptions([
        "Отлично",
        "Хорошо",
        "Нормально",
        "Нужно улучшить",
        "Плохо",
      ]),
      messageLabel: "Ваш отзыв",
      submitLabel: "Отправить отзыв",
    },
  },
};
