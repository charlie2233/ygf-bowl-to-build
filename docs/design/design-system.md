# YGF Bowl-to-Build campaign design system

The executable source of truth is
`scripts/render-campaign-assets.mts`. It builds every campaign variant from
one token set and one shared scene model; generated SVG/PDF files should not be
hand-edited.

## Core tokens

| Token | Value | Use |
| --- | --- | --- |
| Cream | `#F6F0E4` | Main field |
| Ink | `#16261F` | Headline, QR dark modules, primary text |
| Accent red | `#D84A32` | CTA field, labels, line icons |
| Gold | `#E8B94A` | Warm campaign accent |
| Sage | `#667868` | Supporting copy |
| White | `#FFFFFF` | QR quiet zone, cards, text on red |
| Typeface | Inter, Avenir Next, Helvetica, Arial, sans-serif | Code-native vector text and PDF fallback |

The hierarchy is intentionally spare: campaign label, large two-line
headline, short qualifying-offer explanation, four use-case cards, public QR
CTA, then complete fine print. Avoid extra stacked microcopy.

## Web interaction and localization

- The public first viewport presents **01 Claim Build Credits** as the primary
  path and **02 Connect my Agent** as the secondary path. The Agent path is
  advanced and does not replace scan/code redemption.
- English, Simplified Chinese, Spanish, French, and Russian share the same
  layout and typed content structure. The visible locale code and globe wrap
  a native language `select`; the document `lang` must follow the selection.
- Use only subtle entrance, scroll-reveal, image-depth, and phone-tilt motion.
  The native Web Animations API and CSS 3D implementation is dependency-free;
  do not load GSAP, Three.js, Remotion, or remote scripts solely for decorative
  movement.
- Disable pointer parallax on coarse/touch pointers. Under
  `prefers-reduced-motion: reduce`, render every section immediately and remove
  decorative transforms.
- Long French and Russian copy must reflow without shrinking controls below
  usable touch sizes or introducing horizontal overflow at 320px.

## Approved copy

- Headline: **Buy a bowl. Build with AI.**
- Subhead: **Spend $16+ at YGF and unlock limited Build Credits for study
  help, coding help, career tasks, and smarter bowl picks.**
- CTA: **Scan to claim**
- Checkout cue: **Get your code at checkout.**
- Use cases: Study, Coding, Career, Pick My Bowl.
- Promotional fine print: **Limited-time YGF promotional Build Credits.
  Qualifying purchase required. One redemption per person/account.
  Non-transferable. No cash value. Expires 14 days after redemption. Eligible
  AI tasks only. Terms and privacy apply.**
- University disclaimer: **This promotion is offered by YGF for the USC
  community and is not sponsored, endorsed by, or administered by the
  University of Southern California.**

Do not shorten the fine print or substitute language that implies an official
USC program.

## Asset matrix and public QR sources

| File | Output size | Public QR |
| --- | --- | --- |
| `poster-24x36.svg` | 24in x 36in | `/offer?utm_source=poster-24x36` |
| `poster-11x17.svg` | 11in x 17in | `/offer?utm_source=poster-11x17` |
| `counter-card-5x7.svg` | 5in x 7in | `/offer?utm_source=counter-card-5x7` |
| `social-feed-1080x1350.svg` | 1080 x 1350 | `/offer?utm_source=social-feed-1080x1350` |
| `social-story-1080x1920.svg` | 1080 x 1920 | `/offer?utm_source=social-story-1080x1920` |
| `social-horizontal-1200x628.svg` | 1200 x 628 | `/offer?utm_source=social-horizontal-1200x628` |

The print PDFs are exactly 24x36 inches and 5x7 inches. They have no bleed or
crop marks; a print vendor must not infer them. Print at 100% and obtain a
physical proof. If bleed is required, add it as a new reviewed output token
rather than scaling the current artwork.

## QR rules

- Public campaign QRs contain only the HTTPS offer URL plus the asset-specific
  source. They never contain a promo code.
- A private claim QR belongs only on a secured claim row and resolves to
  `/redeem#code=<same-code>` as its paired human-readable code.
- The admin UI produces the one-time CSV for a pending database batch. After
  placing that download in ignored, mode-0600 `private/`,
  `scripts/render-private-claims.mts --input private/<admin-download>.csv
  --out private/<batch>.claims.html` consumes it without creating or
  registering codes. The printable letter-size sheet uses
  `renderPrivateClaimRowSvg` for eight 3.5x2-inch rows per page. The renderer
  publishes mode 0600, refuses overwrite, and must never write into `public/`.
- Preserve at least a four-module white quiet zone on every side.
- Use solid, high-contrast square modules. Do not add a logo, gradient,
  rounded module treatment, decorative frame, or image over the finder
  patterns.
- Keep the public QR visually separated from the bowl image and line icons.
- Decode the exact generated module geometry in automated tests and scan the
  final physical proof under store lighting.

## Photography and illustration

The bowl remains the only first-viewport photographic focal point. Keep its
controlled cover crop, with ingredients recognizable and no embedded text,
university mark, or third-party logo. A single supporting real YGF
ingredient-counter frame may appear below the fold; keep it metadata-free and
visually secondary to the campaign offer. `public/media/malatang-hero.png` is
a generated beta fallback and must be replaced before public launch by a
**rights-cleared real YGF food photo** approved by the brand owner. Update the
media and fidelity ledgers, then regenerate every affected output.

Study, Coding, Career, and Pick My Bowl use simple code-native red line icons.
Maintain consistent stroke, round caps/joins, and a white card field. Do not
replace them with emoji, raster clip art, or official school iconography.

## Accessibility and production

- Keep text as SVG/PDF text; never flatten campaign copy into the bowl image.
- Maintain ink/cream and white/red contrast and a strong reading order.
- Social crops must retain headline, qualification, QR CTA, and full legal
  copy inside the artboard.
- Proof fine print at its intended physical size; screen zoom is not evidence
  of print legibility.
- SVGs include an accessible title/description. Social publishing still needs
  platform alt text describing the offer and noting the QR destination.

Regenerate and verify:

```sh
node scripts/render-campaign-assets.mts
node scripts/render-campaign-assets.mts --verify-only
```

For a real production origin, pass the same reviewed HTTPS `--origin` value to
both commands and record it in the release evidence. The verifier reads the
existing artifacts without modifying them; integration tests render fixtures
under a temporary root. A changed URL requires new physical proofs.
