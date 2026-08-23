#!/usr/bin/env python3
"""
Generate the default OpenGraph card, public/og/default.png.

Per-article OG generation was deliberately NOT automated: a build-time
rasteriser is an extra toolchain dependency and a fragile one, and a broken
generator is worse than one good default card. See ARCHITECTURE.md,
"Social images".

The MARK is drawn from scripts/brandmark.py — the same JetBrains Mono Bold
outlines the header renders as live text — so the card carries the real
wordmark rather than a monospace impersonation of it. The card has room for
all five glyphs, so it uses the full <TC/> rather than the icons' reduced TC/.

The COPY is set in DejaVu Sans, which has complete Turkish coverage and ships
with the image toolchain. The site's own text faces are webfonts and are not
worth a toolchain dependency for one static card.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import brandmark as bm  # noqa: E402

W, H = 1200, 630
BG = (9, 11, 12)
TEXT = (241, 245, 244)
MUTED = (142, 153, 149)
GREEN = (33, 230, 122)
CYAN = (0, 200, 255)

BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# Soft accent glow, top-left — the same restrained depth the hero uses.
glow = Image.new("RGB", (W, H), BG)
gd = ImageDraw.Draw(glow)
gd.ellipse([-260, -340, 640, 360], fill=(14, 26, 21))
gd.ellipse([760, -300, 1400, 240], fill=(10, 22, 28))
img = Image.blend(img, glow, 0.55)
d = ImageDraw.Draw(img)

# Left accent rule. The brand green survives here, in furniture rather than
# inside the mark itself.
d.rectangle([0, 0, 8, H], fill=GREEN)

x = 92

# <TC/> — real outlines, drawn at 4x and downsampled so the curves stay clean.
SS = 4
EM = 116
mark_w = int(bm.mark_width(bm.FULL, EM)) + 8
mark_h = 200
layer = Image.new("RGBA", (mark_w * SS, mark_h * SS), (0, 0, 0, 0))
bm.draw_mark(ImageDraw.Draw(layer), bm.FULL, 4.0, 150.0, EM, scale=SS)
img.paste(
    layer.resize((mark_w, mark_h), Image.LANCZOS),
    (x, 78),
    layer.resize((mark_w, mark_h), Image.LANCZOS),
)
d = ImageDraw.Draw(img)

title = ImageFont.truetype(BOLD, 62)
sub = ImageFont.truetype(REG, 30)
foot = ImageFont.truetype(MONO, 26)

d.text((x, 268), "Dijital güvenlik", font=title, fill=TEXT)
d.text((x, 344), "karmaşık olmak zorunda değil.", font=title, fill=TEXT)

d.text((x, 452), "Türkçe dijital güvenlik rehberleri · 2005'ten bugüne", font=sub, fill=MUTED)

d.line([x, 528, W - 92, 528], fill=(38, 45, 44), width=1)
d.text((x, 556), "turkcyber.com", font=foot, fill=CYAN)

label = "A DNDR Labs Project"
d.text((W - 92 - d.textlength(label, font=foot), 556), label, font=foot, fill=MUTED)

img.save(os.path.join(sys.argv[1] if len(sys.argv) > 1 else "public/og", "default.png"), optimize=True)
print("wrote og/default.png")
