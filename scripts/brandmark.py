#!/usr/bin/env python3
"""Validate and derive assets from the owner-approved TurkCyber raster masters.

The PNG files under ``src/brand/masters`` are canonical. This module performs
only transparent-edge cleanup, cropping, scaling and output composition; it
contains no replacement logo geometry, fonts or aesthetic reconstruction.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IDENTITY_PATH = ROOT / "src" / "brand" / "identity.json"


def load_identity() -> dict:
    with IDENTITY_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


IDENTITY = load_identity()
MASTER_ORDER = ("emblem", "lockup", "presentation", "opticalEmblem")


def project_path(value: str) -> Path:
    return ROOT / value


def sha256(path: Path) -> str:
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


def calculate_fingerprint() -> str:
    digest = hashlib.sha256()
    for index, kind in enumerate(MASTER_ORDER):
        if index:
            digest.update(bytes([0]))
        digest.update(project_path(IDENTITY["masters"][kind]["path"]).read_bytes())
    return f"sha256:{digest.hexdigest()}"


def validate_identity() -> None:
    for kind in MASTER_ORDER:
        record = IDENTITY["masters"][kind]
        path = project_path(record["path"])
        if not path.is_file():
            raise ValueError(f"owner master is missing: {path}")
        with Image.open(path) as image:
            if list(image.size) != record["dimensions"]:
                raise ValueError(f"{kind} dimensions changed: {image.size}")
        if sha256(path) != record["sha256"]:
            raise ValueError(f"{kind} owner-master hash mismatch")
    if calculate_fingerprint() != IDENTITY["metadata"]["fingerprint"]:
        raise ValueError("owner visual master-pack fingerprint mismatch")


def load_master(kind: str) -> Image.Image:
    return Image.open(project_path(IDENTITY["masters"][kind]["path"])).convert("RGBA")


def clean_and_crop(image: Image.Image, threshold: int = 200, padding: int = 4) -> Image.Image:
    """Remove only near-transparent generation specks, then crop to artwork."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    cleaned_alpha = alpha.point(lambda value: value if value >= threshold else 0)
    rgba.putalpha(cleaned_alpha)
    bounds = cleaned_alpha.getbbox()
    if bounds is None:
        raise ValueError("owner artwork contains no visible pixels")
    left, top, right, bottom = bounds
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(rgba.width, right + padding)
    bottom = min(rgba.height, bottom + padding)
    return rgba.crop((left, top, right, bottom))


def master_artwork(kind: str) -> Image.Image:
    return clean_and_crop(load_master(kind))


def fit_on_square(kind: str, size: int, ratio: float) -> Image.Image:
    field = IDENTITY["colors"]["field"]
    canvas = Image.new("RGBA", (size, size), field)
    artwork = master_artwork(kind)
    limit = max(1, round(size * ratio))
    artwork.thumbnail((limit, limit), Image.Resampling.LANCZOS)
    x = (size - artwork.width) // 2
    y = (size - artwork.height) // 2
    canvas.alpha_composite(artwork, (x, y))
    return canvas


validate_identity()
