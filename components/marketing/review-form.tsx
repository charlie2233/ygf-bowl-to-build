import type { ReviewFormCopy } from "@/lib/i18n/review";

const YGF_REVIEW_FORM_ENDPOINT = "https://formspree.io/f/xbgrdldk";

export function ReviewForm({ copy }: Readonly<{ copy: ReviewFormCopy }>) {
  return (
    <form
      acceptCharset="UTF-8"
      action={YGF_REVIEW_FORM_ENDPOINT}
      aria-label={copy.ariaLabel}
      className="contact-form"
      method="post"
    >
      <input name="form_type" type="hidden" value="ygf-review" />
      <div className="contact-form__field">
        <label htmlFor="ygf-review-email">{copy.emailLabel}</label>
        <input
          autoComplete="email"
          id="ygf-review-email"
          maxLength={254}
          name="email"
          type="email"
        />
      </div>
      <div className="contact-form__field">
        <label htmlFor="ygf-review-rating">{copy.ratingLabel}</label>
        <select id="ygf-review-rating" name="rating" required>
          <option value="">{copy.ratingPrompt}</option>
          {copy.ratingOptions.map(({ label, value }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="contact-form__field">
        <label htmlFor="ygf-review-message">{copy.messageLabel}</label>
        <textarea
          id="ygf-review-message"
          maxLength={2000}
          name="message"
          required
          rows={6}
        />
      </div>
      <button className="button button--primary button--medium" type="submit">
        {copy.submitLabel}
      </button>
    </form>
  );
}
