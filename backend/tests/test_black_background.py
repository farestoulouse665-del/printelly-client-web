from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

from app.models.schemas import BackgroundCleanup, BlackBackgroundMode
from app.services.black_background import remove_black_background


def canvas(size: int = 80) -> tuple[Image.Image, np.ndarray]:
    image = Image.new("RGB", (size, size), (0, 0, 0))
    semantic = np.zeros((size, size), dtype=np.float32)
    return image, semantic


def test_exterior_black_preserves_semantic_black_hair_and_white_graphics():
    image, semantic = canvas()
    draw = ImageDraw.Draw(image)
    draw.rectangle((24, 25, 55, 70), fill=(145, 145, 145))
    draw.rectangle((27, 17, 52, 32), fill=(0, 0, 0))
    draw.rectangle((8, 8, 19, 12), fill=(255, 255, 255))
    semantic[17:71, 24:56] = 0.96

    result = remove_black_background(
        image,
        semantic,
        BlackBackgroundMode.exterior,
        BackgroundCleanup.normal,
        protect_details=True,
    )

    assert result.alpha[0, 0] < 0.01
    assert result.alpha[22, 35] > 0.90
    assert result.alpha[50, 35] > 0.99
    assert result.alpha[10, 12] > 0.99
    assert result.confidence > 0.90


def test_smart_mode_removes_enclosed_black_panels_but_exterior_mode_does_not():
    image, semantic = canvas()
    draw = ImageDraw.Draw(image)
    draw.rectangle((9, 9, 70, 70), outline=(255, 255, 255), width=2)
    draw.rectangle((31, 26, 49, 67), fill=(150, 150, 150))
    draw.rectangle((33, 20, 47, 31), fill=(0, 0, 0))
    semantic[20:68, 31:50] = 0.97

    exterior = remove_black_background(
        image,
        semantic,
        BlackBackgroundMode.exterior,
        BackgroundCleanup.normal,
        protect_details=True,
    )
    smart = remove_black_background(
        image,
        semantic,
        BlackBackgroundMode.smart,
        BackgroundCleanup.normal,
        protect_details=True,
    )

    assert exterior.alpha[15, 15] > 0.99
    assert smart.alpha[15, 15] < 0.01
    assert smart.alpha[24, 40] > 0.90
    assert smart.alpha[50, 40] > 0.99


def test_smart_mode_preserves_thin_black_typography_inside_white_artwork():
    image, semantic = canvas()
    draw = ImageDraw.Draw(image)
    draw.rectangle((15, 30, 64, 49), fill=(255, 255, 255))
    draw.rectangle((20, 36, 59, 43), fill=(0, 0, 0))

    result = remove_black_background(
        image,
        semantic,
        BlackBackgroundMode.smart,
        BackgroundCleanup.normal,
        protect_details=True,
    )

    assert result.alpha[0, 0] < 0.01
    assert result.alpha[39, 40] > 0.99
    assert result.alpha[32, 20] > 0.99
