from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

from app.models.schemas import RemovalMode


@dataclass(frozen=True)
class RefinementOptions:
    refine: bool = True
    feather: float = 1.0
    edge_shift: int = 0


def _remove_isolated_specks(mask: np.ndarray, min_area: int) -> np.ndarray:
    binary = (mask >= 0.5).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    if count <= 1:
        return mask
    keep = np.zeros_like(binary)
    height, width = binary.shape
    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        x = int(stats[label, cv2.CC_STAT_LEFT])
        y = int(stats[label, cv2.CC_STAT_TOP])
        w = int(stats[label, cv2.CC_STAT_WIDTH])
        h = int(stats[label, cv2.CC_STAT_HEIGHT])
        touches_edge = x == 0 or y == 0 or x + w == width or y + h == height
        if area >= min_area or touches_edge:
            keep[labels == label] = 1
    # Only erase confident foreground noise; retain soft semantic detail.
    return np.where((binary == 1) & (keep == 0) & (mask > 0.95), 0.0, mask)


def _border_pixels(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    strip = max(1, min(12, round(min(height, width) * 0.015)))
    return np.concatenate(
        (
            image[:strip].reshape(-1, 3),
            image[-strip:].reshape(-1, 3),
            image[:, :strip].reshape(-1, 3),
            image[:, -strip:].reshape(-1, 3),
        ),
        axis=0,
    )


def _connected_uniform_background(
    rgb: np.ndarray,
    semantic_mask: np.ndarray,
    *,
    force: bool,
) -> tuple[np.ndarray | None, float]:
    """Find a flat background without ever treating colour alone as foreground truth.

    Colour similarity only proposes background pixels. A region is removable when it
    is connected to the outer image and is not protected by the semantic subject mask.
    """
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    border = _border_pixels(lab)
    median = np.median(border, axis=0)
    border_distance = np.linalg.norm(border - median, axis=1)
    uniformity = float(np.percentile(border_distance, 75))
    confidence = float(np.clip(1.0 - uniformity / 32.0, 0.0, 1.0))
    if not force and confidence < 0.58:
        return None, confidence
    if force and confidence < 0.30:
        return None, confidence

    distance = np.linalg.norm(lab - median, axis=2)
    tolerance = float(np.clip(np.percentile(border_distance, 90) * 1.65 + 5.0, 9.0, 34.0))

    # Semantic foreground is a hard protection, including colours identical to the background.
    candidate = ((distance <= tolerance) & (semantic_mask < 0.34)).astype(np.uint8)
    count, labels = cv2.connectedComponents(candidate, connectivity=8)
    if count <= 1:
        return None, confidence

    border_labels = np.unique(
        np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1]))
    )
    lookup = np.zeros(count, dtype=bool)
    lookup[border_labels] = True
    lookup[0] = False
    background = lookup[labels]

    # Never erase a pixel that the semantic model considers likely foreground.
    background &= semantic_mask < 0.52
    return background, confidence


def combine_semantic_and_design_mask(
    image: Image.Image,
    semantic_mask: np.ndarray,
    mode: RemovalMode,
) -> tuple[np.ndarray, float]:
    """Fuse semantic understanding with topology for graphics and flat backdrops."""
    mask = np.clip(semantic_mask.astype(np.float32), 0.0, 1.0)
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    force = mode is RemovalMode.design
    background, confidence = _connected_uniform_background(rgb, mask, force=force)
    if background is None:
        return mask, confidence

    structural_foreground = (~background).astype(np.float32)
    if mode is RemovalMode.design:
        # DTF mode is deliberately conservative: visible design regions survive.
        fused = np.maximum(mask, structural_foreground)
    else:
        # Auto mode only adds structural foreground where border confidence is high.
        weight = float(np.clip((confidence - 0.58) / 0.30, 0.0, 1.0))
        fused = np.maximum(mask, structural_foreground * weight)
    return np.clip(fused, 0.0, 1.0), confidence


def _guided_filter(guide: np.ndarray, source: np.ndarray, radius: int, eps: float) -> np.ndarray:
    kernel = (radius * 2 + 1, radius * 2 + 1)
    mean_guide = cv2.boxFilter(guide, cv2.CV_32F, kernel, borderType=cv2.BORDER_REFLECT)
    mean_source = cv2.boxFilter(source, cv2.CV_32F, kernel, borderType=cv2.BORDER_REFLECT)
    corr_guide = cv2.boxFilter(guide * guide, cv2.CV_32F, kernel, borderType=cv2.BORDER_REFLECT)
    corr_cross = cv2.boxFilter(guide * source, cv2.CV_32F, kernel, borderType=cv2.BORDER_REFLECT)
    variance = corr_guide - mean_guide * mean_guide
    covariance = corr_cross - mean_guide * mean_source
    a = covariance / (variance + eps)
    b = mean_source - a * mean_guide
    mean_a = cv2.boxFilter(a, cv2.CV_32F, kernel, borderType=cv2.BORDER_REFLECT)
    mean_b = cv2.boxFilter(b, cv2.CV_32F, kernel, borderType=cv2.BORDER_REFLECT)
    return mean_a * guide + mean_b


def _edge_aware_alpha(rgb: np.ndarray, mask: np.ndarray, feather: float) -> np.ndarray:
    """Refine only the trimap's unknown band; interiors and true background stay fixed."""
    hard = (mask >= 0.5).astype(np.uint8)
    radius = max(1, min(8, round(2 + feather * 1.5)))
    kernel_size = radius * 2 + 1
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    sure_foreground = cv2.erode(hard, kernel, iterations=1).astype(bool) & (mask >= 0.90)
    sure_background = cv2.erode(1 - hard, kernel, iterations=1).astype(bool) & (mask <= 0.10)
    unknown = ~(sure_foreground | sure_background)

    guide = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    refined = _guided_filter(guide, mask.astype(np.float32), radius, 1e-3)
    alpha = np.where(unknown, refined, mask)
    alpha[sure_foreground] = np.maximum(alpha[sure_foreground], 0.995)
    alpha[sure_background] = np.minimum(alpha[sure_background], 0.005)
    return np.clip(alpha, 0.0, 1.0)


def refine_mask(
    raw_mask: np.ndarray,
    image: Image.Image,
    mode: RemovalMode,
    options: RefinementOptions,
) -> np.ndarray:
    mask, _ = combine_semantic_and_design_mask(image, raw_mask, mode)
    if not options.refine:
        return mask

    height, width = mask.shape
    pixels = height * width
    min_area_ratio = 0.000002 if mode is RemovalMode.design else 0.00001
    mask = _remove_isolated_specks(mask, max(2, int(pixels * min_area_ratio)))

    if options.edge_shift:
        kernel = np.ones((3, 3), np.uint8)
        iterations = min(3, abs(options.edge_shift))
        if options.edge_shift > 0:
            mask = cv2.dilate(mask, kernel, iterations=iterations)
        else:
            mask = cv2.erode(mask, kernel, iterations=iterations)

    feather = min(3.0, max(0.0, options.feather))
    if feather > 0:
        rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
        mask = _edge_aware_alpha(rgb, mask, feather)

    return np.clip(mask, 0.0, 1.0).astype(np.float32)


def mask_warnings(mask: np.ndarray) -> list[str]:
    warnings: list[str] = []
    foreground = float(np.mean(mask > 0.5))
    transparent = float(np.mean(mask < 0.01))
    uncertain = float(np.mean((mask >= 0.05) & (mask <= 0.95)))
    if foreground < 0.003:
        warnings.append("Le sujet détecté semble presque vide.")
    if foreground > 0.985 or transparent < 0.002:
        warnings.append("Très peu d'arrière-plan a été supprimé.")
    if uncertain > 0.35:
        warnings.append("De nombreuses zones sont ambiguës; vérifiez le masque.")
    border = np.concatenate((mask[0], mask[-1], mask[:, 0], mask[:, -1]))
    if float(np.mean(border > 0.5)) > 0.75:
        warnings.append("Le sujet touche fortement les bords de l'image.")
    return warnings
