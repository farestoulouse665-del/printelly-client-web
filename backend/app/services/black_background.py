from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

from app.models.schemas import BackgroundCleanup, BlackBackgroundMode


@dataclass(frozen=True)
class BlackBackgroundResult:
    alpha: np.ndarray
    confidence: float
    removed_ratio: float


def _edge_connected(binary: np.ndarray) -> np.ndarray:
    count, labels = cv2.connectedComponents(binary.astype(np.uint8), connectivity=8)
    if count <= 1:
        return np.zeros_like(binary, dtype=bool)
    border_labels = np.unique(
        np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1]))
    )
    lookup = np.zeros(count, dtype=bool)
    lookup[border_labels] = True
    lookup[0] = False
    return lookup[labels]


def _semantic_and_detail_protection(
    gray: np.ndarray,
    semantic_mask: np.ndarray,
    protect_details: bool,
) -> np.ndarray:
    semantic = np.clip(semantic_mask.astype(np.float32), 0.0, 1.0)
    protected = semantic >= (0.14 if protect_details else 0.34)
    if not protect_details:
        return protected

    # Recover fine dark structures next to a subject: hair, beard, eyelashes and outlines.
    core = (semantic >= 0.46).astype(np.uint8)
    near_subject = cv2.dilate(core, np.ones((7, 7), np.uint8), iterations=1).astype(bool)
    gradient = cv2.magnitude(
        cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3),
        cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3),
    )
    subject_detail = near_subject & (gradient >= 12.0)

    # Black typographic strokes surrounded by light pixels are structure, not backdrop.
    bright = (gray >= 112.0).astype(np.uint8)
    near_bright = cv2.dilate(bright, np.ones((5, 5), np.uint8), iterations=1).astype(bool)
    outlined_detail = near_bright & (gradient >= 18.0)
    return protected | subject_detail | outlined_detail


def _smart_components(
    candidate: np.ndarray,
    gray: np.ndarray,
    semantic_mask: np.ndarray,
) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        candidate.astype(np.uint8),
        connectivity=8,
    )
    if count <= 1:
        return np.zeros_like(candidate, dtype=bool)

    height, width = candidate.shape
    pixel_count = height * width
    border_labels = set(
        int(value)
        for value in np.unique(
            np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1]))
        )
        if value
    )
    gradient = cv2.magnitude(
        cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3),
        cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3),
    )
    selected = np.zeros(count, dtype=bool)
    minimum_region = max(48, int(pixel_count * 0.00035))
    dominant_region = max(minimum_region, int(pixel_count * 0.01))

    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if label in border_labels:
            selected[label] = True
            continue
        if area < minimum_region:
            continue
        region = labels == label
        semantic_mean = float(np.mean(semantic_mask[region]))
        edge_fraction = float(np.mean(gradient[region] >= 20.0))
        if semantic_mean < 0.08 and (
            area >= dominant_region or edge_fraction < 0.18
        ):
            selected[label] = True
    return selected[labels]


def remove_black_background(
    image: Image.Image,
    semantic_mask: np.ndarray,
    mode: BlackBackgroundMode,
    cleanup: BackgroundCleanup,
    *,
    protect_details: bool,
) -> BlackBackgroundResult:
    """Create a black-background matte without deleting dark subject details.

    Exterior mode only follows black regions connected to the canvas border.
    Smart mode additionally removes large enclosed black backdrop regions, while
    semantic subject pixels and high-contrast typography remain protected.
    """
    semantic = np.clip(semantic_mask.astype(np.float32), 0.0, 1.0)
    if mode is BlackBackgroundMode.off:
        return BlackBackgroundResult(semantic, 0.0, 0.0)

    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    high = {
        BackgroundCleanup.light: 46.0,
        BackgroundCleanup.normal: 64.0,
        BackgroundCleanup.strong: 82.0,
    }[cleanup]
    protected = _semantic_and_detail_protection(gray, semantic, protect_details)
    candidate = (gray <= high) & ~protected

    if mode is BlackBackgroundMode.exterior:
        background = _edge_connected(candidate)
    else:
        background = _smart_components(candidate, gray, semantic)

    # A soft luminance key retains anti-aliased gray edge pixels without a black halo.
    low = 2.0
    matte = np.clip((gray - low) / max(1.0, high - low), 0.0, 1.0)
    matte = matte * matte * (3.0 - 2.0 * matte)
    alpha = np.ones_like(semantic, dtype=np.float32)
    alpha[background] = matte[background]

    # The semantic model stays authoritative for hair, beard and dark clothing.
    semantic_protection = np.where(protected, np.maximum(semantic, 0.92), 0.0)
    alpha = np.maximum(alpha, semantic_protection).astype(np.float32)

    border = np.concatenate((gray[0], gray[-1], gray[:, 0], gray[:, -1]))
    confidence = float(np.mean(border <= high))
    removed_ratio = float(np.mean(alpha < 0.05))
    return BlackBackgroundResult(
        np.clip(alpha, 0.0, 1.0),
        confidence,
        removed_ratio,
    )
