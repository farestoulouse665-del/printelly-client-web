from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

from app.models.schemas import RemovalMode
from app.services.mode_detection import choose_effective_mode


def test_auto_promotes_flat_background_graphic_to_design():
    image = Image.new("RGB", (128, 96), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((28, 20, 99, 75), fill=(210, 25, 35))
    draw.text((42, 38), "DTF", fill="black")

    assert choose_effective_mode(image, RemovalMode.auto) is RemovalMode.design


def test_auto_keeps_noisy_photographic_scene_on_safe_product_profile():
    rng = np.random.default_rng(42)
    pixels = rng.integers(0, 256, size=(96, 128, 3), dtype=np.uint8)
    image = Image.fromarray(pixels, mode="RGB")

    assert choose_effective_mode(image, RemovalMode.auto) is RemovalMode.product


def test_explicit_mode_is_never_overridden():
    image = Image.new("RGB", (64, 64), "white")

    assert choose_effective_mode(image, RemovalMode.person) is RemovalMode.person
    assert choose_effective_mode(image, RemovalMode.product) is RemovalMode.product
    assert choose_effective_mode(image, RemovalMode.design) is RemovalMode.design
