#!/usr/bin/env python3
"""
The TurkCyber mark, as geometry.

The header renders <TC/> as live text in JetBrains Mono Bold. Every raster
version of the mark — favicon, app icons, the OpenGraph card — is drawn from
the outlines below, so they are the same letterforms rather than a lookalike.

An earlier icon set was drawn by hand as geometric lowercase "tc/" strokes and
read as three unrelated glyphs. That is the failure this module exists to make
impossible: there is now exactly one source for the mark's shape.

── The outlines ─────────────────────────────────────────────────────────────

Extracted once from JetBrains Mono Bold (700), SIL Open Font License, and
embedded as plain SVG path data so nothing here needs a font file or a font
library at run time. Font coordinate space: 1000 units/em, y-up, 600-unit
advance (it is a monospace).

Regenerating them — only if the brand face itself ever changes:

    npm i @fontsource/jetbrains-mono
    pip install fonttools brotli
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    f = TTFont(".../jetbrains-mono-latin-700-normal.woff2"); f.flavor = None
    gs = f.getGlyphSet(); cmap = f.getBestCmap()
    pen = SVGPathPen(gs); gs[cmap[ord("T")]].draw(pen); pen.getCommands()

── Colour roles ─────────────────────────────────────────────────────────────

Identical to src/components/Logo.astro:

    <  >   faint grey    punctuation, deliberately recessive
    T      warm white    the letterform that carries weight
    C      Turkish red   the identity note, and the ONLY accent
    /      neutral grey  never green

Three saturated colours in a five-glyph mark read as a badge rather than a
wordmark, and a green-white-red tricolour invites institutional readings this
publication has no claim to.
"""

UPM = 1000
CAP = 730
ADVANCE = 600

BG = (12, 15, 16, 255)  # #0c0f10
FG = (241, 245, 244, 255)  # #f1f5f4  warm white
RED = (227, 10, 23, 255)  # #e30a17  Turkish red
SLASH = (168, 178, 174, 255)  # #a8b2ae  neutral grey
BRACKET = (122, 133, 129, 255)  # #7a8581 faint grey

GLYPHS = {
    "T": "M237 0V614H46V730H554V614H363V0Z",
    "C": (
        "M304 -10Q234 -10 181.5 16.5Q129 43 100.5 91.5Q72 140 72 206V524"
        "Q72 591 100.5 639.0Q129 687 181.5 713.5Q234 740 304 740Q375 740 426.5 713.5"
        "Q478 687 507.0 639.0Q536 591 536 524H410Q410 576 382.5 603.0Q355 630 304 630"
        "Q253 630 225.0 603.0Q197 576 197 525V206Q197 155 225.0 127.5Q253 100 304 100"
        "Q355 100 382.5 127.5Q410 155 410 206H536Q536 141 507.0 92.0Q478 43 426.5 16.5"
        "Q375 -10 304 -10Z"
    ),
    "/": "M60 -110 410 830H540L190 -110Z",
    "<": (
        "M524 56 76 267V392L524 603V488L234 354Q214 345 194.5 338.5Q175 332 164 330"
        "Q175 328 195.0 322.0Q215 316 234 307L524 173Z"
    ),
    ">": (
        "M76 56V171L366 305Q386 314 405.5 320.5Q425 327 436 329Q425 331 405.0 336.5"
        "Q385 342 366 351L76 486V603L524 392V267Z"
    ),
}

COLOURS = {"<": BRACKET, ">": BRACKET, "T": FG, "C": RED, "/": SLASH}

#: Full mark. Use wherever five glyphs have room to be legible.
FULL = "<TC/>"
#: Reduced mark. The full composition is illegible in a 16px browser tab —
#: five monospace glyphs give each about three pixels of stem — so the icons
#: drop the brackets. It is the same mark in the same face, not a new symbol.
REDUCED = "TC/"


def parse_path(d):
    """Flatten an SVG path (M/L/H/V/Q/Z only — all these glyphs use) to contours."""
    tokens, i, n = [], 0, len(d)
    while i < n:
        c = d[i]
        if c.isalpha():
            tokens.append(c)
            i += 1
        elif c in " ,":
            i += 1
        else:
            j = i + 1 if d[i] in "+-" else i
            while j < n and (d[j].isdigit() or d[j] == "."):
                j += 1
            tokens.append(float(d[i:j]))
            i = j

    contours, pts, cur, start, cmd, k = [], [], (0.0, 0.0), (0.0, 0.0), None, 0
    while k < len(tokens):
        t = tokens[k]
        if isinstance(t, str):
            cmd = t
            k += 1
            if cmd == "Z":
                if pts:
                    contours.append(pts)
                pts, cur = [], start
            continue
        if cmd == "M":
            cur = start = (tokens[k], tokens[k + 1])
            pts = [cur]
            k += 2
            cmd = "L"  # implicit lineto for any further coordinate pairs
        elif cmd == "L":
            cur = (tokens[k], tokens[k + 1])
            pts.append(cur)
            k += 2
        elif cmd == "H":
            cur = (tokens[k], cur[1])
            pts.append(cur)
            k += 1
        elif cmd == "V":
            cur = (cur[0], tokens[k])
            pts.append(cur)
            k += 1
        elif cmd == "Q":
            cx, cy, x, y = tokens[k : k + 4]
            for s in range(1, 13):
                u = s / 12
                m = 1 - u
                pts.append(
                    (
                        m * m * cur[0] + 2 * m * u * cx + u * u * x,
                        m * m * cur[1] + 2 * m * u * cy + u * u * y,
                    )
                )
            cur = (x, y)
            k += 4
        else:
            k += 1
    if pts:
        contours.append(pts)
    return contours


def _fit_slash(x, y):
    """
    Scale the slash uniformly about its centre so it fits the cap height.

    JetBrains Mono's slash runs from below the baseline to above the cap. Left
    alone it reads as a stray diagonal towering over the letters, which is
    wrong for a mark whose accent is meant to be the C.
    """
    lo, hi = -110.0, 830.0
    factor = CAP / (hi - lo)
    cx = 300.0
    cy = (lo + hi) / 2
    return cx + (x - cx) * factor, (CAP / 2) + (y - cy) * factor


def mark_contours(text, origin_x, baseline_y, em, y_down=True):
    """
    Contours for `text`, laid out from `origin_x` on `baseline_y`.

    `em` is the type size in target units. Returns
    `[(character, colour, [(x, y), ...]), ...]` — one entry per contour, in
    paint order, with y already flipped for a screen coordinate system unless
    `y_down` is False.
    """
    scale = em / UPM
    step = (ADVANCE / UPM) * em
    out = []
    for index, char in enumerate(text):
        ox = origin_x + index * step
        for contour in parse_path(GLYPHS[char]):
            pts = []
            for x, y in contour:
                if char == "/":
                    x, y = _fit_slash(x, y)
                px = ox + x * scale
                py = baseline_y - y * scale if y_down else baseline_y + y * scale
                pts.append((px, py))
            out.append((char, COLOURS[char], pts))
    return out


def mark_width(text, em):
    return len(text) * (ADVANCE / UPM) * em


def cap_height(em):
    return (CAP / UPM) * em


def draw_mark(draw, text, origin_x, baseline_y, em, scale=1.0, offset=(0.0, 0.0)):
    """Paint the mark onto a Pillow ImageDraw. `scale`/`offset` apply last."""
    ox, oy = offset
    for _char, colour, contour in mark_contours(text, origin_x, baseline_y, em):
        draw.polygon([((x * scale) + ox, (y * scale) + oy) for x, y in contour], fill=colour)


def hex_of(colour):
    return "#%02x%02x%02x" % colour[:3]
