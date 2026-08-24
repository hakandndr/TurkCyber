#!/usr/bin/env python3
"""Generate the existing OG card using the owner-approved horizontal lockup."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

import brandmark as bm

WIDTH, HEIGHT = 1200, 630


def font_path(*candidates: str) -> str:
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    raise FileNotFoundError(f"none of the required system fonts exist: {candidates}")


BOLD_FONT = font_path(
    "C:/Windows/Fonts/seguisb.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
)
REGULAR_FONT = font_path(
    "C:/Windows/Fonts/segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
)
MONO_FONT = font_path(
    "C:/Windows/Fonts/consola.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/System/Library/Fonts/Supplemental/Courier New.ttf",
)


def metadata() -> PngImagePlugin.PngInfo:
    info = PngImagePlugin.PngInfo()
    info.add_text("TurkCyberIdentity", bm.IDENTITY["metadata"]["fingerprint"])
    info.add_text("TurkCyberIdentityVersion", bm.IDENTITY["version"])
    info.add_text("TurkCyberCanonicalMaster", bm.IDENTITY["masters"]["lockup"]["path"])
    return info


def render() -> Image.Image:
    field = bm.IDENTITY["colors"]["field"]
    accent = bm.IDENTITY["colors"]["accent"]
    image = Image.new("RGBA", (WIDTH, HEIGHT), field)
    draw = ImageDraw.Draw(image)

    # Preserve the approved editorial OG composition. The complete owner
    # lockup is composited directly; no replacement wordmark is typeset.
    draw.rectangle((0, 0, 3, HEIGHT), fill=accent)
    x = 92
    lockup = bm.master_artwork("lockup")
    lockup.thumbnail((540, 112), Image.Resampling.LANCZOS)
    image.alpha_composite(lockup, (x, 62))
    draw = ImageDraw.Draw(image)

    title = ImageFont.truetype(BOLD_FONT, 62)
    subtitle = ImageFont.truetype(REGULAR_FONT, 30)
    footer = ImageFont.truetype(MONO_FONT, 26)
    ink = (240, 240, 237, 255)
    muted = (169, 174, 173, 255)
    line = (50, 56, 58, 255)

    draw.text((x, 272), "Dijital güvenlik", font=title, fill=ink)
    draw.text((x, 346), "karmaşık olmak zorunda değil.", font=title, fill=ink)
    draw.text((x, 456), "Rehber · Teknik · Araç", font=subtitle, fill=muted)
    draw.line((x, 528, WIDTH - 92, 528), fill=line, width=1)
    draw.text((x, 556), "turkcyber.com", font=footer, fill=ink)

    project = "A DNDR Labs Project"
    project_width = draw.textlength(project, font=footer)
    draw.text((WIDTH - 92 - project_width, 556), project, font=footer, fill=muted)
    return image


def generate(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / "default.png"
    render().convert("RGB").save(destination, optimize=True, pnginfo=metadata())
    print("wrote", destination)


if __name__ == "__main__":
    destination = Path(sys.argv[1]) if len(sys.argv) > 1 else bm.ROOT / "public" / "og"
    generate(destination)
