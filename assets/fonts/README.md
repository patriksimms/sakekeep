# Bundled print fonts

The PDF renderer fully embeds TrueType static instances for regular, bold,
italic, and bold-italic text. The instances were generated at a 14 pt optical
size from these canonical variable programs:

- `Inter-Variable.ttf`
- `SourceSerif4-Variable.ttf`

Both are sourced from the canonical
[Google Fonts repository](https://github.com/google/fonts) and are distributed
under the SIL Open Font License 1.1. The corresponding license text is stored
beside each font.

The Source Serif print variants retain the full glyph set but remove optional
OpenType layout features that fontkit otherwise encodes with visibly incorrect
spacing. The variable sources and unflattened static instances are kept to make
the derivation auditable. Pinned SHA-256 checksums for the renderer inputs:

```text
498710021840b3cbf1be145397d3e56649d0a418b8079322003a0c6097e306e7  Inter-Regular.ttf
1d58165e1871c6df50c0f3d37ddb80377284e9329bbb3217bf3f02c72db87ad2  Inter-Bold.ttf
a4072ad2eee7c5566cc26094207baa1df29fc0cb0038bf92e83818d09674652d  Inter-Italic.ttf
9411cc61b1337bd6f4166666a8c780c673c7a713ec299fe00078043320212804  Inter-BoldItalic.ttf
d84494ac7477384795500d8b75f4d71a7e7d7e34886b4d0d76651f5221cf2903  SourceSerif4-Regular-Print.ttf
4c0b76868d1cd82576c8a681d75db8bca35e527e16baa9dba2c562dc16003554  SourceSerif4-Bold-Print.ttf
140f0571a6e30d67ceb87d47e41f279f661c5fef4667b36c39cc2951f1c3e207  SourceSerif4-Italic-Print.ttf
9ead09fbc69be4b745588b1a5d78904e8d25070cdd457e3d1999c5eeb37b05f9  SourceSerif4-BoldItalic-Print.ttf
```
