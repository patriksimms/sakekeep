# Material implementation decisions

## 2026-07-18 — Prototype architecture

- TanStack Start server routes expose a JSON and multipart HTTP API. Domain
  modules are framework-independent so state-machine, validation, generation,
  geometry, and preflight behavior can be tested without a browser.
- PostgreSQL is the source of truth. RustFS stores source image masters,
  previews, decorative assets, and export artifacts. A small repository adapter
  is the only layer that coordinates records and objects.
- Public share tokens are deterministically derived with HMAC-SHA-256 from the
  project UUID and a local secret. Only a SHA-256 digest is stored in PostgreSQL.
  This retains stable organizer links without storing usable tokens in routine
  database rows and provides 192 bits of encoded token entropy.
- Canonical layout geometry uses millimetres relative to the 210 × 148 mm trim
  box. Negative coordinates and values beyond trim are allowed for bleed.
- Fabric.js is an interaction adapter only. The canonical versioned schema is
  reconstructed after every transform and persisted with optimistic revisions.
- Uploads are normalized with Sharp. Metadata is stripped by re-encoding,
  orientation is applied, safe embedded RGB ICC profiles are retained on the
  original-resolution print master, and an sRGB WebP preview is generated.
  Untagged and CMYK sources are converted to tagged sRGB masters.
- PDF export uses `pdf-lib` and embeds bundled fonts plus an ICC output intent.
  The early technical spike and its precise PDF/X-4 limitation are recorded in
  `docs/PDF_PIPELINE.md`; the UI never claims certification that is not
  structurally verified.

## 2026-07-18 — Verification-driven hardening

- Print exports fully embed static Inter and Source Serif 4 instances generated
  from the bundled OFL variable sources. Independent Poppler rendering exposed
  dropped Inter glyphs in fontkit's subset encoder; full embedding trades a
  larger PDF for reliable text fidelity.
- Source Serif 4 print derivatives keep the full glyph set while flattening
  optional OpenType positioning features. Independent rendering exposed
  malformed word spacing when those tables passed through fontkit.
- The official PSO Coated v3 profile is checksum-verified during setup but is
  not committed because ECI permits embedding and use while prohibiting profile
  redistribution.
- Form and layout autosaves are serialized client-side and remain guarded by
  server revision checks. This coalesces rapid edits without weakening conflict
  detection.
- Contributor IndexedDB access is lazy and browser-only so the public route can
  render on the server without touching browser globals.
- shadcn/Base UI primitives retain their native semantics. Navigation and
  downloads are rendered as actual links with shared button styling instead of
  button primitives masquerading as anchors.
- Every placed raster is represented by a structured PDF catalog record with
  source pixel dimensions, physical placement, and effective PPI. This makes
  resolution verification independent of the editor and human report.
- `bun audit` reports one moderate esbuild advisory only in drizzle-kit's
  legacy development CLI dependency (`@esbuild-kit` → esbuild 0.18). The
  application/build path uses patched esbuild 0.25.12; there are no high or
  critical findings. This dev-only residual is retained rather than forcing an
  incompatible transitive override.
