export type PublicFaqItem = Readonly<{
  answer: string;
  question: string;
}>;

export type LegalSection = Readonly<{
  body?: readonly string[];
  bullets?: readonly string[];
  title: string;
}>;

export const uscShortDisclaimer =
  "For the USC community. Not affiliated with or endorsed by USC.";

export const uscFullDisclaimer =
  "This promotion is offered by YGF for the USC community and is not sponsored, endorsed by, or administered by the University of Southern California.";

export const promotionalFinePrint =
  "Limited-time YGF promotional Build Credits. Qualifying purchase required. Each distinct eligible code grants 3,000 Credits once; multiple distinct cards may top up one wallet. A successful new-card top-up sets the entire wallet to expire 14 days later. Non-transferable. No cash value. Eligible AI tasks only. Terms and privacy apply.";

export const sensitiveDataWarning =
  "Do not submit SSNs, payment card numbers, medical data, or confidential school information.";

export const foodSafetyNotice =
  "Food suggestions are informational only. Please confirm ingredients/allergens with YGF staff.";

export const publicFaq: readonly PublicFaqItem[] = [
  {
    question: "Who’s eligible?",
    answer:
      "Guests who spend $25+ in one transaction and receive a distinct code at checkout. Each eligible code may be redeemed once.",
  },
  {
    question: "Is this official USC?",
    answer: uscFullDisclaimer,
  },
  {
    question: "When do credits expire?",
    answer:
      "A first redemption or successful new-card top-up sets the whole wallet to expire 14 days later. Older remaining Credits share that wallet expiry. Retrying the same code does not extend it.",
  },
  {
    question: "Can I add more than one card?",
    answer:
      "Yes. One Google or Apple identity can accumulate multiple distinct 3,000-Credit cards in one wallet. Each distinct code grants once; retrying the same code never grants Credits again.",
  },
  {
    question: "Do I need a school email?",
    answer:
      "No. A receipt scan can create a private guest wallet in this browser without a login screen. Sign in with Google or Apple and combine the guest wallet only if you want recovery, cross-device access, or an Agent API key.",
  },
  {
    question: "What are Build Credits?",
    answer:
      "Build Credits are limited, non-transferable, have no cash value, and can be used only for eligible AI tasks.",
  },
  {
    question: "What can I use them for?",
    answer:
      "Use Build Credits for study help, coding help, career tasks, and smarter bowl picks.",
  },
  {
    question: "Do I need an API key?",
    answer:
      "No. The ready-made YGF AI tools are the main experience. Creating a personal API key is an optional advanced feature for software that accepts an OpenAI-compatible API.",
  },
  {
    question: "Is my receipt code an API key?",
    answer:
      "No. A receipt code can only claim promotional credits. Never paste it into an Agent. Any optional developer key is created separately after redemption and can be revoked.",
  },
  {
    question: "Can I rely on every AI output?",
    answer:
      "AI outputs may be inaccurate—review before relying on them.",
  },
  {
    question: "What information should I avoid sharing?",
    answer: sensitiveDataWarning,
  },
  {
    question: "How should I use Pick My Bowl suggestions?",
    answer: foodSafetyNotice,
  },
];

export const promotionalTerms: readonly LegalSection[] = [
  {
    title: "The offer",
    body: [promotionalFinePrint],
  },
  {
    title: "Qualifying purchase",
    body: [
      "Spend $25+ in one transaction. Get your code at checkout. Staff only hand the code after the receipt threshold is met.",
    ],
  },
  {
    title: "Redemption and use",
    bullets: [
      "Each distinct eligible code grants 3,000 Credits once. One Google or Apple identity may accumulate multiple distinct cards in one wallet; retrying the same code never grants Credits again.",
      "Build Credits are non-transferable and have no cash value.",
      "Build Credits are limited to eligible YGF AI tools and allowlisted Agent API requests.",
      "Each successful new-card top-up sets the entire wallet to expire 14 days from that top-up. Older remaining Credits share the updated wallet expiry; a same-code retry does not extend it.",
      "The AI-provider cost budget remains $3 per Google or Apple identity across its combined wallet and personal keys. Adding another card does not reset that budget.",
      "Optional personal API keys share the wallet’s limits and expiry and may be revoked, rotated, or rate-limited.",
      "Keep personal API keys private. Do not place them in URLs, public repositories, public chats, analytics, or frontend code.",
    ],
  },
  {
    title: "AI outputs",
    body: [
      "AI outputs may be inaccurate—review before relying on them.",
      sensitiveDataWarning,
      foodSafetyNotice,
    ],
  },
  {
    title: "University relationship",
    body: [uscFullDisclaimer],
  },
];

export const privacySections: readonly LegalSection[] = [
  {
    title: "What YGF processes",
    body: [
      "YGF processes an account identifier, redemption activity, and prompts you submit to provide this promotional AI service. A scan-first guest wallet uses a Supabase anonymous user identifier; YGF receives an email only if you later sign in with a provider or use an email-based account.",
      "When you choose to combine a guest wallet with a Google or Apple account, YGF creates a 10-minute, one-use merge intent. The database stores a digest rather than the bearer value, together with bounded source-session and provider metadata. Secure destination-session cookies are buffered until a service-only transaction atomically moves the wallet records and tombstones the former guest owner.",
      "History stores task type, generated title, an optional user-saved result, usage, and timestamps.",
      "If you create a developer key, YGF stores a keyed digest, a short prefix and last four characters, ownership, expiry, revocation, and usage/accounting records. YGF does not store the full plaintext key.",
      "Agent request accounting stores a keyed request fingerprint, selected allowlisted model, status, credits, provider cost, and timestamps. The raw request prompt is not stored in a separate database column.",
      "If you contact YGF, the applicable form processes the email and request text you provide. The review form processes a rating, review text, and an optional email if you want a reply.",
    ],
  },
  {
    title: "Why it is processed",
    body: [
      "This information is used to provide the promotional AI service, deliver wallet access, prevent fraud, and restore access.",
    ],
  },
  {
    title: "Sharing",
    body: [
      "Supabase processes authentication, account identifiers, and campaign database records on YGF’s behalf.",
      "To generate a website or Agent result, YGF sends the prompt you submit, a non-PII HMAC safety identifier, and the minimum request context needed directly to OpenAI. OpenAI processes that request to return an output. The OpenAI credential remains on YGF’s server.",
      "The privacy and staff issue-report forms send the email and request text you enter to Formspree. The review form sends your rating, review text, and any optional email you provide. Formspree may also process technical request data under its own privacy terms while delivering these submissions to YGF.",
    ],
  },
  {
    title: "Current retention facts",
    body: [
      "HMAC-derived abuse signals rotate every five minutes. Persisted redemption-attempt rows have an explicit per-record expiry. Raw IP addresses and full plaintext codes are never stored.",
      "Event metadata has a 90-day retain_until default.",
      "Wallet credits expire after 14 days, but that is not the same as record deletion.",
      "Raw request prompts are not stored in a separate prompt column. Saved web outputs persist when explicitly saved.",
      "YGF sends store:false with OpenAI Chat Completions, which disables application-state storage but is not a zero-retention promise. OpenAI's default abuse-monitoring logs may retain request content for up to 30 days. OpenAI API data is not used for training by default unless the account opts in. Zero Data Retention is not claimed as configured.",
      "A successful Agent response payload is stored in Postgres for a logical 15-minute idempotent replay window. A provider response can repeat or echo submitted input, so the replay payload can contain text derived from the request even though the raw request prompt is not stored as its own field.",
      "After the logical replay window expires, response payload tombstoning is lazy and may be delayed while the gateway is idle. A reviewed, indexed, bounded scheduled cleanup job is still a production launch gate and is not claimed as configured.",
      "Personal API key plaintext is returned only when a key is created or rotated. Only its keyed digest and non-secret display metadata persist.",
      "A guest wallet remains tied to this browser until Google or Apple sign-in and the wallet combine both finish. Clearing browser site data can permanently remove access before then. Supabase anonymous-user cleanup is not automatic in this codebase.",
      "An account-merge intent becomes unusable after 10 minutes or after its first successful use. That expiry is not itself a promise that its audit record has already been physically deleted.",
      "The current beta has no fixed deletion deadline or self-service deletion for account, redemption, ledger, history, saved-output, privacy/contact, or review/feedback records.",
      "A manager-approved, technically enforced retention/deletion schedule is a launch gate before accepting live redemptions.",
      "Long-lived dietary or allergy histories are avoided unless they are truly needed.",
    ],
  },
  {
    title: "Sensitive information",
    body: [
      "AI outputs may be inaccurate—review before relying on them.",
      sensitiveDataWarning,
      foodSafetyNotice,
    ],
  },
  {
    title: "University relationship",
    body: [uscFullDisclaimer],
  },
];

export const creatorSections: readonly LegalSection[] = [
  {
    title: "Disclose the relationship",
    body: [
      "If you received a free meal, promo credits, or any other benefit from YGF, clearly disclose that relationship in your post.",
    ],
    bullets: [
      "ad",
      "sponsored",
      "YGF invited me / gave me a free meal / gave me promo credits",
    ],
  },
  {
    title: "Describe the offer accurately",
    bullets: [
      "Spend $25+ in one transaction.",
      "Get your code at checkout.",
      "Each distinct code grants once. A successful new-card top-up sets the whole wallet to expire 14 days later.",
      "Build Credits are limited, non-transferable, and have no cash value.",
    ],
  },
  {
    title: "Keep the university relationship clear",
    body: [
      uscShortDisclaimer,
      "Do not use USC shields or official wordmarks, and do not imply official school sponsorship.",
    ],
  },
];

export const staffSections: readonly LegalSection[] = [
  {
    title: "At checkout",
    bullets: [
      "Confirm the guest spent $25+ in one transaction.",
      "Staff only hand the code after the receipt threshold is met.",
      "Each distinct code grants once. A guest may add multiple qualifying cards to one Google or Apple account wallet.",
    ],
  },
  {
    title: "Keep the claim simple",
    bullets: [
      "Do not ask for a full profile.",
      "Collect only what is needed to prevent fraud, restore access, and deliver wallet access.",
      "Do not require a USC email.",
    ],
  },
  {
    title: "Protect sensitive information",
    body: [
      sensitiveDataWarning,
      "Do not request financial account information, protected health information, confidential USC records, or anything a guest would not want retained by a service provider.",
    ],
  },
  {
    title: "Code troubleshooting",
    body: [
      "If the page reports an invalid, already used, or expired code, do not guess at its state or promise a replacement.",
      "Reissue or revocation requires manager approval and must use the approved manager workflow.",
      "For privacy-safe escalation, report only the issue category, approximate time, and non-secret context. Do not ask guests to share full codes, receipts, prompts, or sensitive data.",
      "Do not put a full code, receipt, prompt, or sensitive information in the staff issue report.",
    ],
  },
  {
    title: "Food suggestions",
    body: [foodSafetyNotice],
  },
  {
    title: "University relationship",
    body: [uscFullDisclaimer],
  },
];
