#!/usr/bin/env python3
"""
Generate the default OpenGraph card, public/og/default.png.

Per-article OG generation was deliberately NOT automated: a build-time
rasteriser is an extra toolchain dependency and a fragile one, and a broken
generator is worse than one good default card. See ARCHITECTURE.md,
"Social images".

The card is drawn with DejaVu Sans because it has complete Turkish coverage and
ships with the image toolchain. The site's own faces (Space Grotesk / IBM Plex)
are webfonts and are not required here.
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (9, 11, 12)
PANEL = (12, 15, 16)
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

# Left accent rule.
d.rectangle([0, 0, 8, H], fill=GREEN)

mark = ImageFont.truetype(MONO, 104)
title = ImageFont.truetype(BOLD, 62)
sub = ImageFont.truetype(REG, 30)
foot = ImageFont.truetype(MONO, 26)

x = 92

# <tc/> — brackets muted, letters light, slash green.
parts = [("<", MUTED), ("tc", TEXT), ("/", GREEN), (">", MUTED)]
cx = x
for text, colour in parts:
    d.text((cx, 92), text, font=mark, fill=colour)
    cx += d.textlength(text, font=mark)

d.text((x, 268), "Dijital güvenlik", font=title, fill=TEXT)
d.text((x, 344), "karmaşık olmak zorunda değil.", font=title, fill=TEXT)

d.text((x, 452), "Türkçe dijital güvenlik rehberleri", font=sub, fill=MUTED)

d.line([x, 528, W - 92, 528], fill=(38, 45, 44), width=1)
d.text((x, 556), "turkcyber.com", font=foot, fill=CYAN)

label = "A DNDR Labs Project"
d.text((W - 92 - d.textlength(label, font=foot), 556), label, font=foot, fill=MUTED)

img.save("public/og/default.png", optimize=True)
print("wrote public/og/default.png")
