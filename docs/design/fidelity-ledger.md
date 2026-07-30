# Campaign fidelity ledger

Reference: `docs/design/concepts/poster-a.png`

Renderer: `scripts/render-campaign-assets.mts`

Beta bowl media: `public/media/malatang-hero.png`

This ledger separates design fidelity from launch readiness. A generated file,
green asset test, valid PDF, or clean raster is not manager approval, print
proof, deployed-origin proof, or public-launch approval.

## Concept-to-output decisions

| Concept A element | Implemented treatment | Fidelity status | Evidence / owner gate |
| --- | --- | --- | --- |
| Cream field with warm red/gold accents | Shared cream canvas, red CTA footer, gold corner accent | Matched in renderer tokens | Automated output plus raster review |
| Oversized “Buy a bowl. Build with AI.” | Code-native bold two-line headline | Matched; reflowed per aspect ratio | All six SVGs and both PDFs |
| Bowl weighted to the right | Controlled cover crop of beta bowl image | Composition matched; source not launch-ready | Creative owner must approve a rights-cleared real YGF food photo |
| Study, Coding, Career, Pick My Bowl | Four white cards with red line icons | Matched with vector-native replacements | `data-use-case` contract in every SVG |
| Dominant QR and checkout cue | High-contrast square QR, “Scan to claim,” and “Get your code at checkout.” | Matched with credential clarification | Exact modules decode in integration test |
| Limited campaign explanation | Approved $25+ Build Credits subhead | Matched | Text contract in every asset |
| Legal footer | Complete promotional fine print and full university disclaimer | Expanded from the short concept footer | Text contract and print-raster review |
| Poster-first composition | Derived portrait, card, feed, story, and horizontal scenes | Deliberate responsive reflow | Variant matrix below |

## Deliberate clarifications

1. The visible QR on public creative is a **public campaign QR**. It opens the
   offer page with source attribution and contains no credential. The private
   claim QR is printed separately after a qualifying purchase and is paired
   with the same human-readable code.
2. The full University of Southern California disclaimer replaces any wording
   that could imply sponsorship or administration.
3. Text and line icons remain vector/code-native. System-safe PDF fonts may
   differ slightly from the accepted concept's generated typography.
4. Social formats reflow the composition instead of cropping the poster; every
   variant retains qualification, CTA, QR, and legal copy.
5. The canonical production URL is `https://malatangai.com`. Digital assets
   must be regenerated and decoder-verified for this exact origin; the domain
   change reopens physical print proof.

## Variant ledger

| Output | Source value | Intended placement | Status |
| --- | --- | --- | --- |
| `poster-24x36.svg` / `ygf-poster-24x36.pdf` | `poster-24x36` | Storefront / large board | Generated; physical proof pending |
| `poster-11x17.svg` | `poster-11x17` | Small board / window | Generated; physical proof pending |
| `counter-card-5x7.svg` / `ygf-counter-card-5x7.pdf` | `counter-card-5x7` | Register | Generated; physical proof pending |
| `social-feed-1080x1350.svg` | `social-feed-1080x1350` | Feed | Generated; platform preview pending |
| `social-story-1080x1920.svg` | `social-story-1080x1920` | Story | Generated; platform preview pending |
| `social-horizontal-1200x628.svg` | `social-horizontal-1200x628` | Link/social horizontal | Generated; platform preview pending |

## Verification ledger

| Check | Method | Current evidence | Remaining gate |
| --- | --- | --- | --- |
| Required size/copy/media/icon contract | Vitest integration test | Deterministic renderer outputs | Re-run in release checkout |
| Public URLs | jsQR decodes rasterized exact SVG module geometry | Six source-specific offer URLs | Verify deployed production origin |
| Quiet zones | Geometry contract checks at least four modules | Six SVGs | Scan final printed stock |
| PDF structure and page dimensions | Deterministic byte test plus `pdfinfo` | 1728x2592 pt and 360x504 pt | Vendor proof at 100% |
| Crop, hierarchy, clipping, black-square artifacts | `pdftoppm` raster review | Local design review recorded with release | Manager/creative sign-off |
| Fine-print legibility | Raster review at print-proportional scale | Local review only | Physical 24x36 and 5x7 proof |
| Menu and prices | Not encoded as evidence by the renderer | Not verified | Store manager signs current $25+ offer |
| External account configuration | Not part of assets | Not verified | Named account owners verify production |

## Open launch blockers

- Replace the generated fallback with a rights-cleared real YGF food photo and
  record permission.
- Confirm current menu and prices and the participating location's $25+
  threshold.
- Confirm `https://malatangai.com` is serving the approved release, then
  regenerate and scan every final digital and physical QR.
- Complete physical print and social-platform previews.
- Complete the 10-20 person soft test, staff training, external account
  checks, privacy retention decision, and owner sign-offs in the launch
  checklist.

Any change to copy, URL, image, QR error correction/quiet zone, page
dimensions, or font hierarchy reopens the affected fidelity checks.

## Product UI fidelity closure

References:

- `docs/design/concepts/landing-first-viewport.png`
- `docs/design/concepts/landing-downstream.png`
- `docs/design/concepts/redeem.png`
- `docs/design/concepts/wallet.png`
- `docs/design/concepts/task-study-success.png`

The latest local automated browser review on July 28, 2026 passed all 61
tests: one shared demo setup, 30 desktop Chromium checks at 1536x1024, and 30
iPhone 13/WebKit checks at 390x844. The suite covers responsive overflow, axe,
five-language persistence, 360px French/Russian layout, GSAP initialization,
and reduced motion across public, authenticated core, terminal-error, and
admin states. The in-app browser separately exercised home ->
receipt-fragment claim -> wallet -> Study -> useful result. The receipt
fragment was removed before submission, and the rendered balance changed from
3,000 to 2,880 with no browser warnings or errors.

| Comparison | Reference evidence | Final rendered treatment | Closure |
| --- | --- | --- | --- |
| Above-fold copy | “Buy a bowl. Build with AI.”, qualifying-purchase subhead, claim/how-it-works actions, USC disclaimer | Exact canonical English H1 and approved subhead remain; the explicitly requested secondary action is now `Step 2 Connect my Agent`, while `How it works` remains in navigation | Matched with requested CTA evolution |
| First-viewport composition | Editorial copy left, dominant bowl media, receipt/wallet phone at right | Same visual order and one dominant media frame; phone remains illustrative and explicitly says its claim is not live | Matched |
| Typography and hierarchy | Large dark editorial H1 with restrained supporting copy | Bold system/Geist-compatible display scale, short line lengths, and quieter control type; one H1 per page | Matched |
| Palette and surfaces | Warm cream, true white, burgundy, gold, teal/sage | Shared tokens use the locked values without university colors/marks; the responsive static hero has one cream readability gradient | Matched with accessible media overlay |
| Media treatment | Overhead malatang hero with no embedded words or logos | The first viewport uses separately art-directed desktop/mobile static composites derived from the real YGF ingredient wall; the generated finished bowl is disclosed, the images load eagerly with localized alt text, and the old cinematic video is unused | Responsive static upgrade implemented; source rights and generated-media approval pending |
| Container model | Open landing layout and bounded white workflow/result panels | Marketing stays open; wallet/task/admin use thin borders, 18px radii, restrained shadows, and stable wide containers | Matched |
| Controls and icons | Clear rectangular actions and simple line metaphors | Semantic buttons/links, Lucide or code-native line icons, visible focus, and no model/provider jargon on the default path | Matched |
| Language access | Not present in the accepted concept | Compact native selector adds English, Chinese, Spanish, French, and Russian; selection persists locally and updates document language | Intentional requested enhancement |
| Motion and depth | Static concept frame | Scoped GSAP hero timeline, ScrollTrigger section reveals, and bounded fine-pointer depth; touch receives restrained entrances and reduced-motion remains static | Intentional requested enhancement |
| Redeem state | One obvious code field, receipt cue, short path to credits | QR fragment prefills and disappears; typed code remains available; one terms check plus one confirmation completes the demo claim | Matched with stronger privacy behavior |
| Wallet state | One dominant balance and four task shortcuts | One 3,000-credit balance, exact expiry, correct progress math, four large launch cards, advanced selector collapsed | Matched |
| Task success | Two-column desktop composer/result and stacked mobile result with Q/A rows | Desktop and mobile preserve the same hierarchy, actions, review note, 2,880 balance, structured Q/A flashcards, and post-success YGF Agent CTA | Matched |
| Mobile behavior | One-column flow with readable controls and result cards | 390px view has no horizontal overflow; the header compacts before long translations clip, 360px French/Russian remain bounded, task composer precedes output, and cards/actions wrap without clipping | Matched |

### Intentional product clarifications

1. The accepted task concept shows 2,760 credits, while the implemented first
   result shows 2,880. The product contract spends exactly 120 credits per
   task, so 3,000 minus one successful task must be 2,880.
2. The final task and wallet pages retain the shared workspace navigation so
   Wallet, History, Help, and sign-out remain consistently reachable.
3. Superseded on 2026-07-27: the external OpenRouter handoff was removed.
   Completed tasks now link only to the first-party YGF Agent setup; the legacy
   page redirects internally and the legacy event POST is retired.
4. Mobile retains the complete result instead of hiding content behind an
   arbitrary “show more” control; reading order and touch targets remain
   accessible.
5. The browser matrix now uses desktop Chromium and an iPhone 13/WebKit
   project rather than emulating mobile Safari in Chromium. Both passed
   locally. Firefox, physical device/camera behavior, and
   assistive-technology manual review remain external coverage.
6. The 2026-07-28 home enhancement keeps redemption as Step 1 and promotes
   the already built first-party Agent setup as Step 2. It adds no external
   partner claim and does not make API knowledge part of redemption.
7. The initial browser-native motion layer was superseded on 2026-07-28 by
   locked `gsap` and `@gsap/react` dependencies. The runtime is bundled
   locally with scoped cleanup and responsive/reduced-motion branches; no CDN,
   remote motion runtime, Three.js, or Remotion dependency is used.
8. The later 2026-07-29 static refresh supersedes the cinematic hero. The
   runtime does not load the old WebM, MP4, or poster. Desktop and mobile now
   receive separate static compositions, so reduced motion, data saving,
   autoplay restrictions, and no-JavaScript do not change the hero content.

### Superseded July 29 cinematic hero verification

This section preserves historical evidence for the retired implementation; it
does not describe current runtime media. The selected Sora 2 Pro output is an
eight-second 1280 × 720 bowl animation.
The runtime uses a 13.433-second forward/reverse encode so the loop returns to
its starting composition without the original hard reset. End-to-start SSIM
improved from 0.378 on the direct loop to 0.918 on the selected encode. The
runtime MP4 is 2,122,006 bytes and the WebM is 1,796,349 bytes; both are
silent. Four representative content frames plus an exact first/last seam pair
were inspected with stable bowl geometry, ingredients, chopsticks, and
background. No person, embedded word, logo, private QR, redemption code, API
key, or university mark appears.

| Check | Concept intent | Implemented treatment |
| --- | --- | --- |
| Composition | Food-led motion without displacing the offer | Bowl remains on the right; existing copy and phone hierarchy stay unchanged |
| Start-up | No blank or black first paint | Eager 1280 × 720 WebP poster is present before client hydration and remains until `playing` |
| Motion policy | Motion must not be mandatory | Reduced motion, browser-reported data saver/2G, play rejection, and no-JavaScript retain the poster |
| Performance | Cinematic motion without the 4.9 MB source payload | WebM is preferred, MP4 is fallback, audio is removed, and background-tab playback pauses |
| Accessibility | Preserve localized image meaning and let users stop motion | Poster keeps accurate localized alt text; the video is `aria-hidden` and muted; a localized keyboard-accessible control pauses/resumes it |
| Responsive crop | Keep offer legible on desktop and phone | Poster and video share the same cover crop and cream readability layer at each breakpoint |

The accepted local in-app-browser playback captures are retained as review
evidence at:

- `/Users/hanfei/.codex/visualizations/2026/07/28/019fa7bf-2822-7bd1-ba39-644549df5dc7/video-hero/desktop-playing-iab.png`
- `/Users/hanfei/.codex/visualizations/2026/07/28/019fa7bf-2822-7bd1-ba39-644549df5dc7/video-hero/iphone-playing-iab.png`

The July 29 production deployment was then inspected at
`https://malatangai.com`. Both viewports loaded the preferred WebM, reached
`readyState=4`, advanced playback time, paused without time drift, resumed,
and had `scrollWidth === innerWidth`. The mobile motion control ended at
124 px and the headline began at 140 px, leaving a visible non-overlapping
gap. Accepted production captures are retained at:

- `/Users/hanfei/.codex/visualizations/2026/07/28/019fa7bf-2822-7bd1-ba39-644549df5dc7/video-hero/production-desktop-playing.png`
- `/Users/hanfei/.codex/visualizations/2026/07/28/019fa7bf-2822-7bd1-ba39-644549df5dc7/video-hero/production-iphone-playing.png`

The current hero does not reference this poster, WebM, or MP4. Reintroducing
any of them requires a new performance, motion-policy, accessibility, and
deployed-browser review.

### July 29 responsive YGF-derived static hero

The current first viewport uses two purpose-built static JPEGs derived from
the real ingredient-wall source:

- `public/media/ygf-authentic-hero-desktop-v2.jpg`: 1672 × 941 and 203,071
  bytes;
- `public/media/ygf-authentic-hero-mobile-v2.jpg`: 1122 × 1402 and 169,063
  bytes; and
- source `public/media/ygf-fresh-bar-hero.jpg`: 2000 × 1500 and 550,163
  bytes, derived from user-supplied `IMG_2135 2.JPG`.

The archive audit covered all 235 supplied still images plus representative
frames from every supplied video and found no finished malatang bowl photo.
The ingredient display is real YGF-supplied context; the finished bowl in both
new frames is AI-generated. The composites must not be represented as
unmodified documentary photography or proof of an actually served dish.

The desktop and portrait compositions are selected through a responsive
`<picture>` boundary at 820px instead of making one landscape image survive an
extreme mobile cover crop. Both are static and eager, retain localized alt
text and the cream readability layer, and contain no people, embedded
campaign words, USC mark, private QR, redemption code, API key, email, or
other account data. No new or invented logo was added. The retired cinematic
poster and video files are not loaded by the current hero.

| Check | Intended current treatment | Remaining evidence |
| --- | --- | --- |
| Desktop composition | Calm copy field with the generated bowl weighted right against the authentic ingredient display | Inspect the production build at 1440 × 900 across all five locales |
| Mobile composition | Dedicated portrait art with the bowl below the copy instead of a narrow landscape slice | Inspect at 390 × 844 and 360 × 800 with no horizontal overflow |
| Accessibility and motion | Localized meaningful alt text, no autoplay control, and the same content under reduced motion | Run axe, keyboard, reduced-motion, and no-JavaScript browser checks |
| Payload | 203,071-byte desktop JPEG or 169,063-byte mobile JPEG; no hero WebM/MP4 request | Confirm request selection and absence of old video requests in browser evidence |
| Content safety | No embedded copy, USC mark, claim secret, QR, key, email, or person | Preserve visual review evidence for both exact files |
| Approval | Honest AI-bowl disclosure and real-source provenance | Creative/brand owner approves source rights and both final composites |

Above-the-fold copy is unchanged: H1, $25+ offer, 3,000 Credits, 14-day
duration, Step 1 redemption, optional Step 2 Agent connection, special gift
note, and USC non-endorsement text remain separate HTML content.

### Superseded July 29 direct authentic cover-photo verification

The cover refresh was checked against both the previous rendered home page and
the selected source image. The complete user archive was audited before the
choice: 235 still images plus representative frames from every supplied video.
No finished malatang bowl photograph was present, so the closest faithful,
authentic option is `IMG_2135 2.JPG`, a wide YANGGUOFU fresh-ingredient wall.
Its metadata-free runtime derivative is 2000 × 1500 and 550,163 bytes.

Browser verification used the in-app Playwright browser against both the local
Next development server and a successful `next build` / `next start`
production server. The final desktop Chromium and iPhone WebKit matrix passed
81/81 tests. Native CSS viewports were 1440 × 900 and 390 × 844. Production
screenshots with no development badge are recorded as local-only review
evidence at:

- `/Users/hanfei/.codex/visualizations/2026/07/28/019fa7bf-2822-7bd1-ba39-644549df5dc7/cover-refresh/ygf-fresh-cover-production-desktop.png`
- `/Users/hanfei/.codex/visualizations/2026/07/28/019fa7bf-2822-7bd1-ba39-644549df5dc7/cover-refresh/ygf-fresh-cover-production-mobile.png`

Comparison ledger:

| Check | Previous cover | Verified refresh |
| --- | --- | --- |
| Food focal point | Tight raw-marinated-meat trays dominated the visible right half | Broad rows of fresh greens, noodles, tofu, mushrooms, corn, and toppings establish the choose-a-bowl experience |
| Copy contrast | Cream scrim protected the left copy | Same scrim and copy colors remain; headline, body, guidance, and actions stay immediately legible |
| Phone separation | Dark phone edge crossed similarly dark/red food texture | Black phone frame stays distinct against pale cabbage, noodles, and stainless surfaces |
| Desktop crop | `52% center` emphasized meat trays | `55% 40%` keeps ingredient variety across the 1440 × 900 first viewport |
| Mobile crop | Faded meat texture was difficult to identify | `50% top` retains recognizable golden tofu balls and ingredient rows below the copy at 390 × 844 |
| Responsive bounds | No overflow | `scrollWidth === innerWidth` at desktop/mobile and across all five localized home states |
| Motion/accessibility | GSAP and reduced-motion wiring already accepted | Image still loads eagerly with localized alt; reduced motion returns `transform: none` for hero and phone |

Above-the-fold copy diff: **none**. H1, $25+ offer, 3,000 Credits,
14-day duration, Step 1 redemption, optional Step 2 Agent connection, special
gift note, and USC non-endorsement text are unchanged in every locale.

This was an intermediate direct-photo implementation and is retained as
historical evidence. The current composite keeps the authentic ingredient
wall while adding a disclosed generated bowl; brand approval of the source
rights and generated treatment remains an external launch gate.

### July 28 GSAP visual verification

The accepted references remain
`docs/design/concepts/landing-first-viewport.png` at 1536x1024 and
`docs/design/concepts/landing-downstream.png` at 864x1821. Fresh local
production-build renders were captured with Playwright Chromium at the same
1536x1024 first-viewport size and at a true 390x844 CSS-pixel mobile viewport,
plus a mobile full-page image. Rendering used non-secret placeholder Supabase
configuration and did not claim live backend proof. All captures were
inspected directly with `view_image`; neither viewport overflowed or emitted a
page error, and the production images contain no Next.js development badge.

- Copy, typography, warm palette, dominant bowl crop, phone placement, open
  container model, and section order remain aligned with the references.
- The requested language selector and numbered Agent Step 2 are the only
  material first-viewport information additions; claim remains Step 1 and
  visually dominant.
- The first GSAP attempt initialized before the parent scope ref existed; the
  motion controller now runs as a hook owned by that scope and is proven by
  the browser runtime contract.
- Long Russian navigation overflow was removed by compacting the mobile header
  before 480px while retaining YGF, language selection, and Redeem.
- Text opacity animation was removed after axe detected transient contrast
  failures. Transform-only entrances preserve the GSAP choreography with full
  contrast and immediate actionability.

### Above-the-fold copy diff

No material copy mismatch remains:

- H1: exact canonical text.
- Offer: qualifying purchase language and $25+ detail remain consistent.
- Primary action: `Claim Build Credits`.
- Secondary action: `Connect my Agent` (numbered Step 2); `How it works`
  remains in the public navigation.
- Disclaimer: YGF for the USC community, with no USC sponsorship or
  endorsement claim.

The live production origin, real rights-cleared YGF photo, manager-verified
menu/prices/allergens, external account configuration, physical print proof,
staff training, and 10-20-person soft test remain launch gates rather than
fidelity defects.
