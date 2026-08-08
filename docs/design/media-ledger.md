# YGF Bowl-to-Build media ledger

This ledger records provenance and launch-readiness status without asserting
licenses or permissions that have not been supplied.

## Agent Pass user-provided photo

### `public/media/ygf-user-photo.png`

- Source: user-provided archive `南加大图片.zip`, original
  `IMG_2140.JPG`. The selected frame shows a real ingredient display and was
  chosen after inspecting the supplied contact sheet at
  `/private/tmp/ygf-photos.VaFF6r/contact-sheet-ff.png`.
- Processing: resized from 5712 × 4284 to 1600 × 1200, converted to an
  8-bit sRGB non-interlaced PNG, and exported without EXIF, IPTC, XMP, GPS,
  device, timestamp, comment, text, profile, physical-resolution, or other
  ancillary metadata chunks.
- Visual inspection: the food display is legible at card scale and contains
  no embedded copy, QR code, API credential, university logo, or other
  visible brand mark.
- Runtime use: this sanitized PNG remains the source for Agent Pass artwork
  and the superseded ingredient-tray supporting photo. The public web journey
  now uses the broader fresh-bar frame documented below, while the home-page
  hero uses the separately sourced, responsive YGF-derived static assets.
- Rights status: **user-provided; pending brand-rights confirmation**. Receipt
  of the archive is not treated as a license or a representation that the
  photo is rights-cleared.
- Launch gate: the brand owner must confirm permission for public campaign
  and physical-print use before release. If confirmation is not obtained,
  replace the photo and regenerate and re-proof every Agent Pass output.

### `public/media/ygf-hero-background.jpg`

- Source: metadata-free derivative of `public/media/ygf-user-photo.png`, and
  therefore the same user-provided `IMG_2140.JPG` frame documented above.
- Processing: center-cropped from 1600 × 1200 to 1600 × 1066, encoded as a
  4:2:0 JPEG at 677 KiB, and exported without format metadata. Its dedicated
  filename originally let the hero load eagerly without changing the
  below-fold image's lazy-loading contract.
- Runtime use: superseded home-page background retained as an auditable
  derivative; it is no longer referenced by the runtime after the July 29
  responsive static hero update.
- Rights status and launch gate: identical to the source photo above; a
  derived file does not create or imply usage permission.

### `public/media/ygf-fresh-bar-hero.jpg` and
`public/media/ygf-steps-supporting.jpg`

- Source: user-provided archive `南加大图片.zip`, original
  `IMG_2135 2.JPG`. The frame was selected after reviewing all 235 supplied
  still images plus representative frames from the supplied videos. It shows
  the real store's YANGGUOFU wordmark above a broad, colorful wall of
  vegetables, noodles, tofu, and toppings.
- Processing: the hero source was auto-oriented and resized from 5712 × 4284
  to 2000 × 1500, encoded as a progressive 4:2:0 JPEG at 550,163 bytes, and
  exported by Sharp without source EXIF, IPTC, XMP, GPS, device, timestamp, or
  comment metadata. The supporting derivative is a metadata-stripped,
  progressive 960 × 720 JPEG at 250,276 bytes so cold iPhone/WebKit image
  decoding remains bounded while preserving the same audited frame.
- Visual inspection: no people, faces, USC mark, private QR, redemption code,
  API key, email, or other account data is visible. The full derivative
  retains the YANGGUOFU store wordmark and small ingredient labels as
  authentic location context; responsive cover crops may place the wordmark
  outside the visible viewport.
- Runtime use: source image for the July 29 responsive static home-page hero
  derivatives documented below. Its smaller supporting derivative is, as of
  the August phone-polish pass, the authentic photo in the “Three simple
  steps” journey. The home page loads that supporting use lazily; the
  standalone offer page may load it eagerly because the section appears
  immediately after the introduction.
- Rights status: **user-provided; pending brand-rights confirmation**.
  Receipt of the archive is not treated as a license or as public-use
  approval.
- Launch gate: the brand owner must approve this exact source frame and
  derivative before public campaign use. If approval is not obtained, replace
  it and repeat responsive crop, accessibility, performance, and deployment
  checks.

### `public/media/ygf-authentic-hero-desktop-v2.jpg` and
`public/media/ygf-authentic-hero-mobile-v2.jpg`

- Source: AI-enhanced campaign composites derived from the real YGF
  ingredient-wall derivative `public/media/ygf-fresh-bar-hero.jpg`. The
  supplied store display remains the location and ingredient reference, while
  the finished malatang bowl was generated because the supplied archive did
  not contain a finished-bowl photograph. These files are therefore not
  represented as unmodified documentary photography or as photographs of an
  actual served YGF bowl.
- Processing: the desktop JPEG is 1672 × 941 and 203,071 bytes. The mobile
  portrait JPEG is 1122 × 1402 and 169,063 bytes. The two art-directed frames
  were generated separately rather than forcing one landscape crop to cover
  both aspect ratios, then compressed as sRGB JPEGs for the web.
- Card-print derivative: `public/media/ygf-authentic-hero-mobile-card.png` is a
  lossless PNG conversion of the existing mobile composite for the static
  redemption-card renderer, which requires a PNG photo source. It does not
  alter the composition or add new visual content and inherits the same source,
  disclosure, and approval status.
- Visual inspection: both frames contain the ingredient display and one
  finished bowl, with no people, embedded campaign copy, USC mark, private QR,
  redemption code, API key, email, or other account data. No new or invented
  logo was added.
- Runtime use: these are the current home-page first-viewport media. The
  desktop image loads by default; a responsive `<picture>` source selects the
  portrait image at 820px and below. Both are static, eagerly loaded hero
  media with localized alternative text and a cream readability layer. This
  avoids shipping a background video and keeps the same complete experience
  for reduced-motion, data-saver, autoplay-restricted, and no-JavaScript
  contexts.
- Rights and disclosure status: **user-provided store-photo source plus
  AI-generated bowl; pending creative/brand approval**. The brand owner must
  approve public use of the source photo, the generated bowl treatment, and
  the final desktop/mobile composites. If approval is not obtained, replace
  both derivatives and repeat responsive, accessibility, performance, and
  deployed-origin visual checks.

## Agent Pass production inspection

- Public SVG review: all four fronts and the shared empty back were inspected
  at card scale. The supplied food remains the dominant front visual; Chinese
  and English labels render; red, gold, and cream hierarchy is intact; and no
  front contains a redemption target, human claim, API key, or university
  mark.
- Imposition review:
  `output/agent-pass/previews/fronts-letter-preview.png`,
  `backs-letter-preview.png`, `fronts-a4-preview.png`, and
  `backs-a4-preview.png` were inspected for card order, 2 × 4 placement, cut
  marks, clipping, shared-back alignment, and the 10 mm gutters that keep trim
  marks outside neighboring artwork.
- PDF review: all nine PDFs were parsed successfully. Individual cards report
  242.646 × 153.071 points (85.6 × 54 mm), Letter sheets report 612 × 792
  points, and A4 sheets report 595.276 × 841.890 points. Every page is one
  full-page, 300-DPI DeviceRGB raster: 1011×638 pixels for a card, 2550×3300
  for Letter, and 2480×3508 for A4. `pdffonts` reports no embedded fonts and
  structural checks reject PDF font resources and text-showing operators.
  Independent `pdftoppm` rasterization of Letter front/back sheets matched the
  renderer previews without black boxes or missing glyphs.
- Protected-back review: the fixture-only private back was visually inspected
  outside the repository. Its code and QR were decoder-tested from the final
  300-DPI PDF page raster against the same `/redeem` fragment. Shared and
  private backs retain the visible scratch/open, scan, and start-using sequence
  plus `刮开后请勿拍照分享`. The private portrait Letter/A4 2×4 sheets use
  100%-scale long-edge duplexing; each back is reflected into its paired front
  position, including blank tail slots. No real claim batch or plaintext
  credential was created in the repository.
- Remaining gate: these checks are local screen/raster evidence, not a
  physical print proof or brand approval. Print at 100 percent, scan every
  proof under store lighting, verify front/back registration, and obtain
  rights confirmation before distribution.

## Generated bowl media

### `public/media/ygf-cinematic-hero-poster.webp`,
`public/media/ygf-cinematic-hero.webm`, and
`public/media/ygf-cinematic-hero.mp4`

- Source: a generated cinematic concept derived from
  `public/media/malatang-hero.png`, then animated with OpenAI Sora 2 Pro as an
  eight-second, 1280 × 720 landing-page background. The requested Seedance 2.0
  runtime was not available in the connected tool environment, so this is
  explicitly recorded as a Sora output rather than a Seedance output.
- Processing: the selected concept was reduced to a 1280 × 720 WebP poster.
  The generated H.264/AAC source was converted to a 13.433-second
  forward/reverse loop, then exported as a silent H.264 MP4 with fast-start
  metadata (2,122,006 bytes) and a silent VP9 WebM alternative (1,796,349
  bytes). Neither runtime video contains an audio stream.
- Visual inspection: a four-frame contact sheet plus an exact first/last seam
  pair were checked for food morphing, flicker, extra limbs/people, text,
  logos, private claim material, API keys, and QR codes. Bowl geometry,
  toppings, background, and chopsticks remain stable. The forward/reverse
  encode improved end-to-start SSIM from 0.378 to 0.918 and removes the hard
  crop reset in the direct loop.
- Historical runtime use: this poster/video set previously provided the
  home-page hero. It is superseded by the responsive static assets above and
  is not referenced by the current hero runtime. The files remain in the
  repository only as auditable generated-media history; reintroducing them
  would reopen performance, reduced-motion, autoplay, accessibility, and
  deployed-browser review.
- Status: superseded generated campaign media, not represented as a real YGF
  dish or location and not approved for renewed runtime use.

### `public/media/malatang-hero.png`

- Source: generated image output
  `exec-c7ae4c8e-d3a1-428d-8a6e-3639a251dcc9.png` from the accepted campaign
  design session.
- Status: generated beta fallback; not represented as a photograph of a real
  YGF dish or location.
- Visual inspection: inspected after copying at its original 1536 × 1024
  landscape resolution. The 3:2 frame has an overhead malatang bowl weighted
  to the right, useful negative space on the left, and enough bowl context for
  a controlled cover crop. No embedded text, wordmark, university mark, or
  other visible logo was found.
- Supplied-media audit: the provided `南加大杨国福` materials contained a cost
  workbook, but no standalone food photograph and no photograph embedded in
  that workbook was found. A later user-provided `南加大图片.zip` archive did
  supply real ingredient-counter media. The sanitized PNG supports the
  below-fold experience and Agent Pass artwork, while the YGF-derived
  responsive composites documented above provide the home-page background.
  This earlier generated bowl remains in wallet/share and rendered campaign
  collateral.
- Rights status: no license or usage-rights claim is invented or inferred for
  this generated fallback.
- Launch gate: before public launch, a manager must approve the user-supplied
  hero photo and either approve or replace this generated bowl wherever it
  remains in wallet/share and rendered campaign collateral. Record the actual
  permission decision and regenerate affected outputs.

## Accepted design references

These generated images are repository-local design references, not runtime
photography:

| Repository path | Generated source |
| --- | --- |
| `docs/design/concepts/landing-first-viewport.png` | `exec-e009da64-c2fb-469d-b77d-b6def39842bc.png` |
| `docs/design/concepts/landing-downstream.png` | `exec-c504aeff-4d56-47a2-b892-6afe45bc3e1d.png` |
| `docs/design/concepts/redeem.png` | `exec-523f16f9-cb7f-457e-b7a4-ae8e1b1a89af.png` |
| `docs/design/concepts/wallet.png` | `exec-d31f710b-31ab-4be1-962e-2edf8a6fc24b.png` |
| `docs/design/concepts/task-study-success.png` | `exec-1448e727-c190-4636-b0e3-83fcd666b4ae.png` |
| `docs/design/concepts/poster-a.png` | `exec-c7f0e848-b716-40d8-ac09-505fc1c09b3c.png` |

No external source path is required to view or implement these accepted
references.
