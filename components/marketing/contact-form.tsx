type ContactFormProps = Readonly<{
  ariaLabel: string;
  idPrefix: string;
  messageLabel: string;
  submitLabel: string;
}>;

const FORMSPREE_ENDPOINT = "https://formspree.io/f/mbdzrwbo";

export function ContactForm({
  ariaLabel,
  idPrefix,
  messageLabel,
  submitLabel,
}: ContactFormProps) {
  const emailId = `${idPrefix}-email`;
  const messageId = `${idPrefix}-message`;

  return (
    <form
      action={FORMSPREE_ENDPOINT}
      aria-label={ariaLabel}
      className="contact-form"
      method="post"
    >
      <div className="contact-form__field">
        <label htmlFor={emailId}>Email</label>
        <input
          autoComplete="email"
          id={emailId}
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </div>
      <div className="contact-form__field">
        <label htmlFor={messageId}>{messageLabel}</label>
        <textarea
          id={messageId}
          maxLength={2000}
          name="message"
          required
          rows={6}
        />
      </div>
      <button className="button button--primary button--medium" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}
