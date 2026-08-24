#!/usr/bin/env python3
"""Derive display and icon assets directly from owner-approved raster masters."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import PngImagePlugin

import brandmark as bm


def png_metadata(source_kind: str) -> PngImagePlugin.PngInfo:
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("TurkCyberIdentity", bm.IDENTITY["metadata"]["fingerprint"])
    metadata.add_text("TurkCyberIdentityVersion", bm.IDENTITY["version"])
    metadata.add_text("TurkCyberCanonicalMaster", bm.IDENTITY["masters"][source_kind]["path"])
    return metadata


def generate(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    brand_dir = output_dir / "brand"
    brand_dir.mkdir(parents=True, exist_ok=True)

    lockup = bm.master_artwork("lockup")
    lockup.save(brand_dir / "turkcyber-lockup.webp", "WEBP", lossless=True, method=6)
    print("wrote brand/turkcyber-lockup.webp", lockup.size)

    emblem = bm.master_artwork("emblem")
    emblem.save(brand_dir / "turkcyber-emblem.webp", "WEBP", lossless=True, method=6)
    print("wrote brand/turkcyber-emblem.webp", emblem.size)

    favicon_ratio = float(bm.IDENTITY["safeAreas"]["faviconRatio"])
    for size in (16, 32):
        filename = f"favicon-{size}.png"
        bm.fit_on_square("opticalEmblem", size, favicon_ratio).save(
            output_dir / filename,
            "PNG",
            optimize=True,
            pnginfo=png_metadata("opticalEmblem"),
        )
        print("wrote", filename, (size, size))

    app_ratio = float(bm.IDENTITY["safeAreas"]["appIconRatio"])
    for size, filename in ((180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")):
        bm.fit_on_square("emblem", size, app_ratio).save(
            output_dir / filename,
            "PNG",
            optimize=True,
            pnginfo=png_metadata("emblem"),
        )
        print("wrote", filename, (size, size))


if __name__ == "__main__":
    destination = Path(sys.argv[1]) if len(sys.argv) > 1 else bm.ROOT / "public"
    generate(destination)
