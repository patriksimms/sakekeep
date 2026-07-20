# PDF/X-4 technical spike

## Result

The prototype renderer uses `pdf-lib` to draw vector geometry and text directly
from the canonical millimetre-based layout schema. Print image masters are
embedded at their source resolution; the editor canvas is never rasterized.

The PDF contains:

- a 216 × 154 mm MediaBox and BleedBox per page;
- a 210 × 148 mm TrimBox offset by the 3 mm bleed;
- fully embedded Inter and Source Serif 4 TrueType static instances under the
  SIL Open Font License. Regular, bold, italic, and bold-italic instances are
  generated from the canonical variable sources because fontkit cannot embed
  the variable tables safely. Full embedding also avoids a fontkit subset bug
  that dropped Inter glyphs in independent renderers. Source Serif print
  instances flatten optional positioning tables that otherwise produced
  malformed spacing through fontkit;
- an `/OutputIntent` with the official PSO Coated v3 (FOGRA51) ICC profile;
- PDF/X-4 identification in the document information and XMP metadata;
- machine-readable per-placement raster metadata containing asset/page/element
  identifiers, source pixel dimensions, placed dimensions in millimetres, and
  calculated effective PPI;
- individual pages, optional crop marks, and live vector/transparency content.

The ECI/ICC profile license permits the profile to be used and embedded without
restriction but prohibits redistributing the profile itself. Consequently,
`bun run setup:icc` downloads the profile from the ICC Profile Registry,
verifies its fixed checksum, and stores it in ignored local state. The export
endpoint returns a clear setup error when the verified profile is absent.

## Honest limitation

The automated preflight checks inspect page boxes, page count, embedded font
programs, the output intent, PDF/X metadata, raster-resolution metadata,
generation freshness, effective image resolution, and unresolved page
problems. The project does not bundle a licensed independent ISO 15930
conformance validator. Therefore the export report calls the result
“structurally verified for the PDF/X-4 target” and records this limitation; the
UI does not claim third-party certification.

Before commercial printing, a printer should validate the PDF using its own
current profile and preflight tooling. This prototype is for local evaluation
and must not be used with real personal data.
