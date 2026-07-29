from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from app.models.schemas import RemovalMode


@dataclass(frozen=True)
class RefinementOptions:
    refine: bool = True
    feather: float = 1.0
    edge_shift: int = 0


def _remove_isolated_specks(mask: np.ndarray, min_area: int) -> np.ndarray:
    binary = (mask >= 0.5).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
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
    # Only erase confident one-pixel foreground noise; retain soft semantic detail.
    return np.where((binary == 1) & (keep == 0) & (mask > 0.95), 0.0, mask)


def refine_mask(
    raw_mask: np.ndarray,
    mode: RemovalMode,
    options: RefinementOptions,
) -> np.ndarray:
    mask = np.clip(raw_mask.astype(np.float32), 0.0, 1.0)
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

    # Feather only uncertain boundary pixels. Fully opaque interiors stay unchanged.
    feather = min(3.0, max(0.0, options.feather))
    if feather > 0:
        sigma = max(0.35, feather)
        blurred = cv2.GaussianBlur(mask, (0, 0), sigmaX=sigma, sigmaY=sigma)
        boundary = (mask > 0.01) & (mask < 0.99)
        mask = np.where(boundary, blurred, mask)

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
