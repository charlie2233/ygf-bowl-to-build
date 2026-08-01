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

- The public first viewport presents **Step 1 Claim Build Credits** as the
  primary path and **Step 2 Connect my Agent** as the secondary path. The Agent path is
  advanced and does not replace scan/code redemption.
- English, Simplified Chinese, Spanish, French, and Russian share the same
  layout and typed content structure. The visible locale code and globe wrap
  a native language `select`; the document `lang` must follow the selection.
- Use only subtle entrance, scroll-reveal, image-depth, and phone-tilt motion.
  The locally bundled GSAP layer uses scoped `useGSAP` timelines and
  ScrollTrigger cleanup; do not add Three.js, Remotion, CDN scripts, or pinned
  scenes. The hero itself is responsive static media; do not introduce
  autoplay video or a motion-only version of the offer.
- Disable pointer parallax on coarse/touch pointers. Under
  `prefers-reduced-motion: reduce`, render every section immediately and remove
  decorative transforms.
- Long French and Russian copy must reflow without shrinking controls below
  usable touch sizes or introducing horizontal overflow at 320px.

## Approved copy

- Headline: **Buy a bowl. Build with AI.**
- Subhead: **Spend $25+ at YGF and unlock limited Build Credits for study
  help, coding help, career tasks, and smarter bowl picks.**
- CTA: **Scan to claim**
- Checkout cue: **Get your code at checkout.**
- Use cases: Study, Coding, Career, Pick My Bowl.
- Promotional fine print: **Limited-time YGF promotional Build Credits.
  Qualifying purchase required. Each distinct eligible code grants 3,000
  Credits once; multiple distinct cards may top up one wallet. A successful
  new-card top-up sets the entire wallet to expire 14 days later.
  Non-transferable. No cash value. Eligible AI tasks only. Terms and privacy
  apply.**
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

The first viewport uses two art-directed, static JPEGs:
`public/media/ygf-authentic-hero-desktop-v2.jpg` (1672 × 941; 203,071 bytes)
and `public/media/ygf-authentic-hero-mobile-v2.jpg` (1122 × 1402; 169,063
bytes). A responsive `<picture>` selects the portrait composition at 820px
and below instead of forcing the landscape image through an extreme mobile
crop. Keep the desktop bowl weighted to the right, the mobile bowl low enough
to preserve the copy field, the cream readability gradient intact, and both
frames free of embedded copy, people, private claim material, or university
marks. Both images are AI-enhanced derivatives of the real YGF ingredient
display at `public/media/ygf-fresh-bar-hero.jpg`; the finished bowl is
generated and must be disclosed as such rather than represented as an
unmodified store photograph. The retired cinematic WebM/MP4/poster set is
not part of the current runtime. The separate real ingredient-counter PNG may
appear below the fold, where it stays visually secondary to the campaign
offer. Brand approval for the user-supplied source and the generated bowl
treatment remains required before launch.
`public/media/malatang-hero.png` remains a generated beta image in wallet/share
and rendered collateral; approve or replace it, update both ledgers, and
regenerate every affected output.

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
