#!/usr/bin/env python3
"""
Generate the PNG icon fallbacks from the same geometry as public/favicon.svg.

The SVG is the source of truth for the mark. This script mirrors its geometry
in a 32-unit coordinate space and rasterises at 4x before downsampling, which
is why the output is smooth without needing an SVG rasteriser installed.

Run only when the mark changes:  python3 scripts/generate-icons.py
"""
from PIL import Image, ImageDraw

BG = (12, 15, 16, 255)      # #0c0f10
FG = (241, 245, 244, 255)   # #f1f5f4
ACCENT = (33, 230, 122, 255)  # #21e67a
SS = 8  # supersample factor


def draw_mark(size: int, transparent_bg: bool = False) -> Image.Image:
    s = size * SS
    k = s / 32.0  # scale from the 32-unit design space
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if not transparent_bg:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=6 * k, fill=BG)

    w = round(2.6 * k)          # letter stroke
    wa = round(2.8 * k)         # accent stroke

    # "t" — vertical stem with a foot, plus the crossbar
    d.line([(7 * k, 9.5 * k), (7 * k, 20.7 * k)], fill=FG, width=w)
    d.line([(7 * k, 20.7 * k), (11.3 * k, 23.1 * k)], fill=FG, width=w)
    d.line([(4.4 * k, 13 * k), (10.5 * k, 13 * k)], fill=FG, width=w)

    # "c" — arc open to the right
    cx, cy, r = 19.3 * k, 17.8 * k, 4.6 * k
    d.arc([cx - r, cy - r, cx + r, cy + r], start=62, end=298, fill=FG, width=w)

    # accent slash
    d.line([(28 * k, 8.5 * k), (24 * k, 24 * k)], fill=ACCENT, width=wa)

    # Round the stroke ends, and the stem/foot join so it reads as one
    # continuous letterform rather than two overlapping segments.
    for (px, py, radius) in [
        (7 * k, 9.5 * k, w / 2),
        (7 * k, 20.7 * k, w / 2),
        (11.3 * k, 23.1 * k, w / 2),
        (4.4 * k, 13 * k, w / 2),
        (10.5 * k, 13 * k, w / 2),
        (28 * k, 8.5 * k, wa / 2),
        (24 * k, 24 * k, wa / 2),
    ]:
        colour = ACCENT if radius == wa / 2 else FG
        d.ellipse([px - radius, py - radius, px + radius, py + radius], fill=colour)

    return img.resize((size, size), Image.LANCZOS)


for size, name in [(180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
    draw_mark(size).save(f"public/{name}")
    print("wrote", name, size)
