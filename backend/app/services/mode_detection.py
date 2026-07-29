from __future__ import annotations

import cv2
import numpy as np
from PIL import Image

from app.models.schemas import RemovalMode


def _border_pixels(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    strip = max(1, min(12, round(min(height, width) * 0.04)))
    return np.concatenate(
        (
            image[:strip].reshape(-1, 3),
            image[-strip:].reshape(-1, 3),
            image[:, :strip].reshape(-1, 3),
            image[:, -strip:].reshape(-1, 3),
        ),
        axis=0,
    )


def choose_effective_mode(image: Image.Image, requested: RemovalMode) -> RemovalMode:
    """Choose the conservative automatic profile from image structure.

    Only the design profile needs automatic promotion: it combines semantic inference with
    a flat, border-connected background model. Photographic scenes remain on the product
    profile, which is the safer general-purpose fallback.
    """
    if requested is not RemovalMode.auto:
        return requested

    preview = image.convert("RGB")
    preview.thumbnail((256, 256), Image.Resampling.BILINEAR)
    rgb = np.asarray(preview, dtype=np.uint8)
    if rgb.shape[0] < 8 or rgb.shape[1] < 8:
        return RemovalMode.product

    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    border = _border_pixels(lab)
    background = np.median(border, axis=0)
    border_distance = np.linalg.norm(border - background, axis=1)
    full_distance = np.linalg.norm(lab - background, axis=2)
    border_uniformity = float(np.mean(border_distance <= 14.0))
    background_ratio = float(np.mean(full_distance <= 18.0))

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 55, 145)
    edge_density = float(np.mean(edges > 0))

    quantized = (rgb // 32).reshape(-1, 3)
    quantized_colours = int(np.unique(quantized, axis=0).shape[0])
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    saturated_ratio = float(np.mean(hsv[:, :, 1] >= 72))

    has_real_structure = edge_density >= 0.008
    has_separable_background = 0.12 <= background_ratio <= 0.97
    looks_graphic = quantized_colours <= 160 or saturated_ratio >= 0.14
    if (
        border_uniformity >= 0.72
        and has_separable_background
        and has_real_structure
        and looks_graphic
    ):
        return RemovalMode.design
    return RemovalMode.product
