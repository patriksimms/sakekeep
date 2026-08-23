"""Derives the bundled static font cuts from the canonical OFL variable sources.

Google Fonts only publishes variable programs upstream, but pdf-lib embeds
static instances and the browser needs matching web cuts. This script downloads
the pinned variable sources, instances the regular and bold cuts, strips the
optional OpenType layout tables (fontkit encodes them with spacing that does not
match our own advance-width line breaking), and writes both a print TTF for the
PDF renderer and a woff2 for the editor preview.

Run with `bun run fonts:build` — it needs fonttools, provided through uvx.
"""

import hashlib
import io
import json
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

# Pinned tree of github.com/google/fonts so a rebuild is reproducible.
UPSTREAM_COMMIT = "e1118da94a8cb00cf6d06cdac9ef13eb1e5c6ab7"
RAW = f"https://raw.githubusercontent.com/google/fonts/{UPSTREAM_COMMIT}"

PRINT_DIR = Path("assets/fonts")
WEB_DIR = Path("public/fonts")

# family -> upstream directory, source programs, and the web family slug.
FAMILIES = [
    {
        "family": "PlayfairDisplay",
        "slug": "playfair-display",
        "dir": "ofl/playfairdisplay",
        "upright": "PlayfairDisplay[wght].ttf",
        "italic": "PlayfairDisplay-Italic[wght].ttf",
    },
    {
        "family": "Lora",
        "slug": "lora",
        "dir": "ofl/lora",
        "upright": "Lora[wght].ttf",
        "italic": "Lora-Italic[wght].ttf",
    },
    {
        "family": "EBGaramond",
        "slug": "eb-garamond",
        "dir": "ofl/ebgaramond",
        "upright": "EBGaramond[wght].ttf",
        "italic": "EBGaramond-Italic[wght].ttf",
    },
    {
        "family": "Montserrat",
        "slug": "montserrat",
        "dir": "ofl/montserrat",
        "upright": "Montserrat[wght].ttf",
        "italic": "Montserrat-Italic[wght].ttf",
    },
    {
        "family": "Nunito",
        "slug": "nunito",
        "dir": "ofl/nunito",
        "upright": "Nunito[wght].ttf",
        "italic": "Nunito-Italic[wght].ttf",
    },
    {
        # Caveat is a handwriting face and ships no italic program upstream.
        "family": "Caveat",
        "slug": "caveat",
        "dir": "ofl/caveat",
        "upright": "Caveat[wght].ttf",
        "italic": None,
    },
]

# (weight value, upright cut name, italic cut name) matching the existing asset naming.
CUTS = [(400, "Regular", "Italic"), (700, "Bold", "BoldItalic")]


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url) as response:
        return response.read()


def build_cut(source: bytes, weight: int, print_path: Path, web_path: Path) -> None:
    # updateFontNames keeps the instance named after its own weight, so the
    # embedded PDF fonts stay distinguishable in print workflows.
    font = instantiateVariableFont(
        TTFont(io.BytesIO(source)), {"wght": weight}, inplace=False, updateFontNames=True
    )
    font["OS/2"].usWeightClass = weight
    # Our line breaking sums plain advance widths, so kerning and ligature
    # substitution would make the rendered PDF drift from the measured layout.
    for table in ("GSUB", "GPOS", "kern"):
        if table in font:
            del font[table]
    font.flavor = None
    font.save(print_path)
    font.flavor = "woff2"
    font.save(web_path)


def main() -> None:
    PRINT_DIR.mkdir(parents=True, exist_ok=True)
    WEB_DIR.mkdir(parents=True, exist_ok=True)
    checksums: dict[str, str] = {}

    for entry in FAMILIES:
        family, slug = entry["family"], entry["slug"]
        licence = fetch(f"{RAW}/{entry['dir']}/OFL.txt")
        (PRINT_DIR / f"{family}-OFL.txt").write_bytes(licence)

        for style, upstream in (("normal", entry["upright"]), ("italic", entry["italic"])):
            if upstream is None:
                continue
            source = fetch(f"{RAW}/{entry['dir']}/{urllib.parse.quote(upstream)}")
            for weight, upright_cut, italic_cut in CUTS:
                name = f"{family}-{italic_cut if style == 'italic' else upright_cut}-Print.ttf"
                print_path = PRINT_DIR / name
                web_path = WEB_DIR / f"{slug}-{weight}-{style}.woff2"
                build_cut(source, weight, print_path, web_path)
                checksums[name] = hashlib.sha256(print_path.read_bytes()).hexdigest()
                print(f"{name} ({print_path.stat().st_size // 1024} KB) + {web_path.name}")

    Path("assets/fonts/checksums.json").write_text(
        json.dumps(dict(sorted(checksums.items())), indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
