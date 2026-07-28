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
- Runtime use: the same sanitized file is the supporting photo in the
  below-fold “From checkout to build mode” section. The home page loads it
  lazily; the standalone offer page may load it eagerly because that section
  appears immediately after the offer introduction.
- Rights status: **user-provided; pending brand-rights confirmation**. Receipt
  of the archive is not treated as a license or a representation that the
  photo is rights-cleared.
- Launch gate: the brand owner must confirm permission for public campaign
  and physical-print use before release. If confirmation is not obtained,
  replace the photo and regenerate and re-proof every Agent Pass output.

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

## Runtime hero

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
  supply real ingredient-counter media; one sanitized photo now supports the
  below-fold web experience and Agent Pass artwork, while this generated bowl
  remains the beta hero.
- Rights status: no license or usage-rights claim is invented or inferred for
  this generated fallback.
- Launch gate: before public launch, a manager must supply and approve a
  rights-cleared real YGF food photograph. Replace this fallback and update
  this ledger with the actual source and permission record.

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
