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
| Limited campaign explanation | Approved $16+ Build Credits subhead | Matched | Text contract in every asset |
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
5. The canonical beta URL is `https://build.ygf.example`. A production-domain
   change requires regeneration, decoder verification, and new print proof.

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
| Menu and prices | Not encoded as evidence by the renderer | Not verified | Store manager signs current $16+ offer |
| External account configuration | Not part of assets | Not verified | Named account owners verify production |

## Open launch blockers

- Replace the generated fallback with a rights-cleared real YGF food photo and
  record permission.
- Confirm current menu and prices and the participating location's $16+
  threshold.
- Replace the example origin with the approved production origin, if
  different, and regenerate/scan every QR.
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

The latest local automated browser review on July 27, 2026 passed all 41
tests: one shared demo setup, 20 desktop Chromium checks at 1536x1024, and 20
iPhone 13/WebKit checks at 390x844. The suite covers responsive overflow and
axe checks across public, authenticated core, terminal-error, and admin
states. The in-app browser separately exercised home ->
receipt-fragment claim -> wallet -> Study -> useful result. The receipt
fragment was removed before submission, and the rendered balance changed from
3,000 to 2,880 with no browser warnings or errors.

| Comparison | Reference evidence | Final rendered treatment | Closure |
| --- | --- | --- | --- |
| Above-fold copy | “Buy a bowl. Build with AI.”, qualifying-purchase subhead, claim/how-it-works actions, USC disclaimer | Exact canonical H1, approved subhead, both actions, and non-affiliation line remain in the first viewport | Matched |
| First-viewport composition | Editorial copy left, dominant bowl media, receipt/wallet phone at right | Same visual order and one dominant media frame; phone remains illustrative and explicitly says its claim is not live | Matched |
| Typography and hierarchy | Large dark editorial H1 with restrained supporting copy | Bold system/Geist-compatible display scale, short line lengths, and quieter control type; one H1 per page | Matched |
| Palette and surfaces | Warm cream, true white, burgundy, gold, teal/sage | Shared tokens use the locked values without gradients, glows, or university colors/marks | Matched |
| Media treatment | Overhead malatang image with no embedded words or logos | Controlled responsive cover crop with meaningful alt text on the hero; generated fallback remains a named launch blocker | Matched for beta; source replacement pending |
| Container model | Open landing layout and bounded white workflow/result panels | Marketing stays open; wallet/task/admin use thin borders, 18px radii, restrained shadows, and stable wide containers | Matched |
| Controls and icons | Clear rectangular actions and simple line metaphors | Semantic buttons/links, Lucide or code-native line icons, visible focus, and no model/provider jargon on the default path | Matched |
| Redeem state | One obvious code field, receipt cue, short path to credits | QR fragment prefills and disappears; typed code remains available; one terms check plus one confirmation completes the demo claim | Matched with stronger privacy behavior |
| Wallet state | One dominant balance and four task shortcuts | One 3,000-credit balance, exact expiry, correct progress math, four large launch cards, advanced selector collapsed | Matched |
| Task success | Two-column desktop composer/result and stacked mobile result with Q/A rows | Desktop and mobile preserve the same hierarchy, actions, review note, 2,880 balance, structured Q/A flashcards, and post-success YGF Agent CTA | Matched |
| Mobile behavior | One-column flow with readable controls and result cards | 390px view has no horizontal overflow; public header compacts, task composer precedes output, cards/actions wrap without clipping | Matched |

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

### Above-the-fold copy diff

No material copy mismatch remains:

- H1: exact canonical text.
- Offer: qualifying purchase language and $16+ detail remain consistent.
- Primary action: `Claim Build Credits`.
- Secondary action: `How it works`.
- Disclaimer: YGF for the USC community, with no USC sponsorship or
  endorsement claim.

The live production origin, real rights-cleared YGF photo, manager-verified
menu/prices/allergens, external account configuration, physical print proof,
staff training, and 10-20-person soft test remain launch gates rather than
fidelity defects.
