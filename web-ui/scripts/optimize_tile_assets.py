#!/usr/bin/env python3

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
TILES_DIR = ROOT / "public" / "tiles"
ATLAS_IMAGE_NAME = "tiles-atlas.png"
ATLAS_META_NAME = "tiles-atlas.json"
ATLAS_SOURCE_NAMES = {ATLAS_IMAGE_NAME, "tiles-atlas-1.png"}
TARGET_TILE_WIDTH = 132
TARGET_TILE_HEIGHT = 228
ATLAS_PADDING = 4
ATLAS_COLUMNS = 6
CARD_RADIUS = 14

ATLAS_ORDER = [
    *(f"{num}{suit}" for suit in ("t", "s") for num in range(1, 10)),
    "东",
    "南",
    "西",
    "北",
    "中变",
    "发",
    "白",
    "back",
]


def _smooth_resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    upscale_size = (max(size[0] * 2, 1), max(size[1] * 2, 1))
    return image.resize(upscale_size, Image.Resampling.LANCZOS).resize(
        size, Image.Resampling.LANCZOS
    )


def _vertical_alpha_gradient(
    size: tuple[int, int], top_alpha: int, bottom_alpha: int
) -> Image.Image:
    width, height = size
    gradient = Image.new("L", size, 0)
    pixels = gradient.load()

    for y in range(height):
        ratio = y / max(height - 1, 1)
        alpha = round(top_alpha + (bottom_alpha - top_alpha) * ratio)
        for x in range(width):
            pixels[x, y] = alpha

    return gradient


def _rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def _apply_overlay(
    image: Image.Image, color: tuple[int, int, int], alpha_mask: Image.Image
) -> Image.Image:
    overlay = Image.new("RGBA", image.size, (*color, 0))
    overlay.putalpha(alpha_mask)
    return Image.alpha_composite(image, overlay)


def _soften_and_round_alpha(image: Image.Image) -> Image.Image:
    rounded = _rounded_mask(image.size, CARD_RADIUS)
    alpha = image.getchannel("A").filter(ImageFilter.GaussianBlur(0.35))
    alpha = ImageChops.multiply(alpha, rounded)
    image.putalpha(alpha)
    return image


def _refine_card_body(image: Image.Image, is_back: bool) -> Image.Image:
    result = image.copy()
    card_mask = result.getchannel("A")

    glossy_mask = _vertical_alpha_gradient(result.size, 36 if is_back else 42, 0)
    glossy_mask = ImageChops.multiply(glossy_mask, card_mask)
    result = _apply_overlay(result, (255, 255, 255), glossy_mask)

    body_lift = _vertical_alpha_gradient(result.size, 20 if is_back else 26, 0)
    body_lift = ImageChops.multiply(body_lift, card_mask)
    result = _apply_overlay(result, (250, 248, 240), body_lift)

    bottom_shadow = Image.new("L", result.size, 0)
    shadow_draw = ImageDraw.Draw(bottom_shadow)
    shadow_top = int(result.height * 0.74)
    shadow_draw.rectangle((0, shadow_top, result.width, result.height), fill=255)
    bottom_shadow = bottom_shadow.filter(ImageFilter.GaussianBlur(18))
    bottom_shadow = ImageChops.multiply(bottom_shadow, card_mask)
    bottom_shadow = ImageEnhance.Brightness(bottom_shadow).enhance(0.12 if is_back else 0.16)
    result = _apply_overlay(result, (18, 24, 28), bottom_shadow)

    edge_shadow = Image.new("L", result.size, 0)
    edge_draw = ImageDraw.Draw(edge_shadow)
    edge_draw.rounded_rectangle(
        (1, 1, result.width - 2, result.height - 2),
        radius=max(CARD_RADIUS - 2, 4),
        outline=90,
        width=2,
    )
    edge_shadow = edge_shadow.filter(ImageFilter.GaussianBlur(3))
    edge_shadow = ImageChops.multiply(edge_shadow, card_mask)
    edge_shadow = ImageEnhance.Brightness(edge_shadow).enhance(0.18 if is_back else 0.22)
    result = _apply_overlay(result, (12, 18, 22), edge_shadow)

    return result


def _enhance_tile_graphics(image: Image.Image, is_back: bool) -> Image.Image:
    if is_back:
        return ImageEnhance.Contrast(image).enhance(1.03)

    enhanced = ImageEnhance.Contrast(image).enhance(1.08)
    enhanced = ImageEnhance.Color(enhanced).enhance(1.03)
    enhanced = ImageEnhance.Sharpness(enhanced).enhance(1.16)
    return enhanced.filter(ImageFilter.UnsharpMask(radius=0.9, percent=90, threshold=2))


def normalize_tile(path: Path) -> None:
    is_back = path.stem == "back"
    image = Image.open(path).convert("RGBA")
    bbox = image.getbbox()
    cropped = image.crop(bbox) if bbox else image

    scale = min(
        TARGET_TILE_WIDTH / cropped.width,
        TARGET_TILE_HEIGHT / cropped.height,
    )
    new_width = max(1, round(cropped.width * scale))
    new_height = max(1, round(cropped.height * scale))

    fitted = _smooth_resize(cropped, (new_width, new_height)).filter(
        ImageFilter.UnsharpMask(radius=0.8, percent=70, threshold=3)
    )

    canvas = Image.new("RGBA", (TARGET_TILE_WIDTH, TARGET_TILE_HEIGHT), (0, 0, 0, 0))
    offset_x = (TARGET_TILE_WIDTH - new_width) // 2
    offset_y = (TARGET_TILE_HEIGHT - new_height) // 2
    canvas.alpha_composite(fitted, (offset_x, offset_y))
    canvas = _soften_and_round_alpha(canvas)
    canvas = _refine_card_body(canvas, is_back=is_back)
    canvas = _enhance_tile_graphics(canvas, is_back=is_back)
    canvas = _soften_and_round_alpha(canvas)
    canvas.save(path, optimize=True)


def rebuild_atlas() -> None:
    atlas_entries: list[tuple[str, Image.Image]] = []
    for key in ATLAS_ORDER:
        asset_path = TILES_DIR / f"{key}.png"
        if not asset_path.exists():
            raise FileNotFoundError(f"Missing tile asset for atlas: {asset_path}")
        atlas_entries.append((key, Image.open(asset_path).convert("RGBA")))

    max_width = max(image.width for _, image in atlas_entries)
    max_height = max(image.height for _, image in atlas_entries)
    rows = math.ceil(len(atlas_entries) / ATLAS_COLUMNS)
    atlas_width = ATLAS_COLUMNS * max_width + (ATLAS_COLUMNS - 1) * ATLAS_PADDING
    atlas_height = rows * max_height + (rows - 1) * ATLAS_PADDING
    atlas = Image.new("RGBA", (atlas_width, atlas_height), (0, 0, 0, 0))

    frames: dict[str, dict[str, int]] = {}
    for index, (key, image) in enumerate(atlas_entries):
        column = index % ATLAS_COLUMNS
        row = index // ATLAS_COLUMNS
        x = column * (max_width + ATLAS_PADDING)
        y = row * (max_height + ATLAS_PADDING)
        atlas.paste(image, (x, y))
        frames[key] = {"x": x, "y": y, "w": image.width, "h": image.height}

    atlas.save(TILES_DIR / ATLAS_IMAGE_NAME, optimize=True)
    (TILES_DIR / ATLAS_META_NAME).write_text(
        json.dumps(
            {
                "meta": {
                    "image": ATLAS_IMAGE_NAME,
                    "width": atlas_width,
                    "height": atlas_height,
                    "padding": ATLAS_PADDING,
                    "columns": ATLAS_COLUMNS,
                    "rows": rows,
                },
                "frames": frames,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> None:
    for tile_path in sorted(TILES_DIR.glob("*.png")):
        if tile_path.name in ATLAS_SOURCE_NAMES or tile_path.name == ".DS_Store":
            continue
        normalize_tile(tile_path)

    rebuild_atlas()


if __name__ == "__main__":
    main()
