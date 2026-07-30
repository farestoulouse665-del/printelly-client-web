from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

from app.models.schemas import (
    BackgroundCleanup,
    BlackBackgroundMode,
    RemovalMode,
)
from app.services.background_analysis import BackgroundAnalyzer
from app.services.black_background import remove_black_background


@dataclass(frozen=True)
class RefinementOptions:
    refine: bool = True
    feather: float = 1.0
    edge_shift: int = 0
    background_cleanup: BackgroundCleanup = BackgroundCleanup.normal
    protect_details: bool = True
    remove_haze: bool = True
    background_color: str | None = None
    black_background_mode: BlackBackgroundMode = BlackBackgroundMode.off


@dataclass(frozen=True)
class BackgroundEstimate:
    mask: np.ndarray
    rgb: tuple[int, int, int]
    confidence: float


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
    return np.where((binary == 1) & (keep == 0) & (mask > 0.95), 0.0, mask)


def _remove_low_confidence_residue(mask: np.ndarray, min_area: int) -> np.ndarray:
    """Remove only tiny, disconnected, low-confidence matte fragments.

    Opaque micro-details are preserved. This targets faint provider residue
    without applying destructive erosion to hair, text or logo geometry.
    """
    candidate = (mask >= 0.035).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        candidate,
        connectivity=8,
    )
    if count <= 1:
        return mask
    cleaned = mask.copy()
    height, width = mask.shape
    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area >= min_area:
            continue
        x = int(stats[label, cv2.CC_STAT_LEFT])
        y = int(stats[label, cv2.CC_STAT_TOP])
        w = int(stats[label, cv2.CC_STAT_WIDTH])
        h = int(stats[label, cv2.CC_STAT_HEIGHT])
        touches_edge = x == 0 or y == 0 or x + w == width or y + h == height
        values = mask[labels == label]
        if not touches_edge and values.size and float(np.max(values)) < 0.72:
            cleaned[labels == label] = 0.0
    return cleaned


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


def _edge_connected_mask(binary: np.ndarray) -> np.ndarray:
    """Return components connected to the image border."""
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


def _parse_background_color(value: str | None) -> tuple[int, int, int] | None:
    if not value:
        return None
    text = value.strip().lstrip("#")
    if len(text) != 6:
        return None
    try:
        return tuple(int(text[index : index + 2], 16) for index in (0, 2, 4))
    except ValueError:
        return None


def _colour_alpha(rgb: np.ndarray, background_rgb: tuple[int, int, int]) -> np.ndarray:
    """Lower-bound alpha from C = alpha*F + (1-alpha)*B.

    It exactly recovers common red-on-white and white-on-black anti-aliased edges,
    while semantic protection remains authoritative for same-colour subject regions.
    """
    source = rgb.astype(np.float32)
    background = np.asarray(background_rgb, dtype=np.float32)
    distance = np.abs(source - background)
    possible_range = np.maximum(background, 255.0 - background)
    possible_range = np.maximum(possible_range, 1.0)
    return np.clip(np.max(distance / possible_range, axis=2), 0.0, 1.0)


def _connected_uniform_background(
    rgb: np.ndarray,
    semantic_mask: np.ndarray,
    options: RefinementOptions,
    *,
    force: bool,
) -> BackgroundEstimate | None:
    """Find background through border connectivity, colour and semantic protection."""
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    override = _parse_background_color(options.background_color)
    if override is None:
        border_rgb = _border_pixels(rgb.astype(np.float32))
        background_rgb = tuple(int(round(value)) for value in np.median(border_rgb, axis=0))
        reference = np.median(_border_pixels(lab), axis=0)
    else:
        background_rgb = override
        reference = cv2.cvtColor(
            np.asarray([[background_rgb]], dtype=np.uint8),
            cv2.COLOR_RGB2LAB,
        )[0, 0].astype(np.float32)

    border_distance = np.linalg.norm(_border_pixels(lab) - reference, axis=1)
    uniformity = float(np.percentile(border_distance, 75))
    confidence = 1.0 if override is not None else float(
        np.clip(1.0 - uniformity / 32.0, 0.0, 1.0)
    )
    if override is None and not force and confidence < 0.58:
        return None
    if override is None and force and confidence < 0.30:
        return None

    level_scale = {
        BackgroundCleanup.light: 0.90,
        BackgroundCleanup.normal: 1.00,
        BackgroundCleanup.strong: 1.25,
    }[options.background_cleanup]
    distance = np.linalg.norm(lab - reference, axis=2)
    tolerance = float(
        np.clip((np.percentile(border_distance, 90) * 1.65 + 5.0) * level_scale, 8.0, 42.0)
    )
    semantic_foreground = semantic_mask >= 0.34
    semantic_edge_false_positive = _edge_connected_mask(semantic_foreground)
    semantic_protected = semantic_foreground & ~semantic_edge_false_positive
    candidate = ((distance <= tolerance) & ~semantic_protected).astype(np.uint8)
    count, labels = cv2.connectedComponents(candidate, connectivity=8)
    if count <= 1:
        return None

    border_labels = np.unique(
        np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1]))
    )
    lookup = np.zeros(count, dtype=bool)
    lookup[border_labels] = True
    lookup[0] = False
    background = lookup[labels]

    relaxed_factor = {
        BackgroundCleanup.light: 1.25,
        BackgroundCleanup.normal: 1.60,
        BackgroundCleanup.strong: 2.00,
    }[options.background_cleanup]
    relaxed_tolerance = float(np.clip(tolerance * relaxed_factor + 3.0, 11.0, 60.0))
    semantic_ceiling = 0.20 if options.protect_details else 0.30
    relaxed_semantic_protected = (
        (semantic_mask >= semantic_ceiling) & ~semantic_edge_false_positive
    )
    relaxed_candidate = (
        (distance <= relaxed_tolerance) & ~relaxed_semantic_protected
    ).astype(np.uint8)
    relaxed_count, relaxed_labels = cv2.connectedComponents(
        relaxed_candidate,
        connectivity=8,
    )
    if relaxed_count > 1 and np.any(background):
        seed_labels = np.unique(relaxed_labels[background])
        relaxed_lookup = np.zeros(relaxed_count, dtype=bool)
        relaxed_lookup[seed_labels] = True
        relaxed_lookup[0] = False
        grown = relaxed_lookup[relaxed_labels]
        closed = cv2.morphologyEx(
            grown.astype(np.uint8),
            cv2.MORPH_CLOSE,
            np.ones((3, 3), np.uint8),
        ).astype(bool)
        background |= grown | (closed & relaxed_candidate.astype(bool))

    background &= ~semantic_protected
    return BackgroundEstimate(background, background_rgb, confidence)


def _recover_background_alpha(
    rgb: np.ndarray,
    semantic_mask: np.ndarray,
    estimate: BackgroundEstimate,
    options: RefinementOptions,
) -> np.ndarray:
    colour_alpha = _colour_alpha(rgb, estimate.rgb)
    gamma = {
        BackgroundCleanup.light: 0.78,
        BackgroundCleanup.normal: 1.00,
        BackgroundCleanup.strong: 1.28,
    }[options.background_cleanup]
    recovered = np.power(colour_alpha, gamma).astype(np.float32)
    recovered[estimate.mask] = 0.0

    protection_threshold = 0.42 if options.protect_details else 0.68
    semantic_protection = np.where(
        (semantic_mask >= protection_threshold) & ~estimate.mask,
        semantic_mask,
        0.0,
    )
    semantic_protection = np.where(
        semantic_protection >= 0.85,
        1.0,
        semantic_protection,
    )

    # High-chroma micro-details remain protected even if they are only a few pixels.
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    saturated_detail = (hsv[:, :, 1] >= 32) & (colour_alpha >= 0.08)
    recovered = np.where(saturated_detail, np.maximum(recovered, colour_alpha), recovered)
    return np.clip(np.maximum(recovered, semantic_protection), 0.0, 1.0)


def combine_semantic_and_design_mask(
    image: Image.Image,
    semantic_mask: np.ndarray,
    mode: RemovalMode,
    options: RefinementOptions | None = None,
    *,
    background_analyzer: BackgroundAnalyzer | None = None,
    diagnostics: dict[str, float] | None = None,
) -> tuple[np.ndarray, float]:
    """Fuse semantic understanding, topology and flat-background alpha recovery."""
    options = options or RefinementOptions()
    mask = np.clip(semantic_mask.astype(np.float32), 0.0, 1.0)
    if options.black_background_mode is not BlackBackgroundMode.off:
        black_result = remove_black_background(
            image,
            mask,
            options.black_background_mode,
            options.background_cleanup,
            protect_details=options.protect_details,
        )
        return black_result.alpha, black_result.confidence
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    force = mode is RemovalMode.design or options.background_color is not None
    if background_analyzer is None:
        estimate = _connected_uniform_background(rgb, mask, options, force=force)
    else:
        analysis = background_analyzer.analyze(
            image,
            mask,
            options.background_cleanup,
            protect_details=options.protect_details,
            force=force,
            background_color=options.background_color,
        )
        estimate = (
            None
            if analysis is None
            else BackgroundEstimate(
                analysis.background_mask,
                analysis.background_rgb,
                analysis.confidence,
            )
        )
        if diagnostics is not None and analysis is not None:
            diagnostics["background_confidence"] = analysis.confidence
            diagnostics["background_border_coverage"] = analysis.border_coverage
            diagnostics["background_risk_ratio"] = float(np.mean(analysis.risk_mask))
    if estimate is None:
        return mask, 0.0

    if mode is RemovalMode.design and options.remove_haze:
        fused = _recover_background_alpha(rgb, mask, estimate, options)
    else:
        structural_foreground = (~estimate.mask).astype(np.float32)
        if mode is RemovalMode.design:
            fused = np.maximum(mask, structural_foreground)
        else:
            weight = float(np.clip((estimate.confidence - 0.58) / 0.30, 0.0, 1.0))
            fused = np.maximum(mask, structural_foreground * weight)
    return np.clip(fused, 0.0, 1.0), estimate.confidence


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
    hard = (mask >= 0.5).astype(np.uint8)
    radius = max(1, min(8, round(2 + feather * 1.5)))
    kernel = np.ones((radius * 2 + 1, radius * 2 + 1), np.uint8)
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
    diagnostics: dict[str, float] | None = None,
    *,
    background_analyzer: BackgroundAnalyzer | None = None,
) -> np.ndarray:
    mask, background_confidence = combine_semantic_and_design_mask(
        image,
        raw_mask,
        mode,
        options,
        background_analyzer=background_analyzer,
        diagnostics=diagnostics,
    )
    if diagnostics is not None and options.black_background_mode is not BlackBackgroundMode.off:
        diagnostics["black_background_confidence"] = background_confidence
    if not options.refine:
        return mask

    pixels = mask.shape[0] * mask.shape[1]
    min_area_ratio = 0.000002 if mode is RemovalMode.design else 0.00001
    mask = _remove_isolated_specks(mask, max(2, int(pixels * min_area_ratio)))
    residue_area_ratio = 0.000002 if mode is RemovalMode.design else 0.000006
    mask = _remove_low_confidence_residue(
        mask,
        max(3, int(pixels * residue_area_ratio)),
    )

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


def residual_haze_ratio(image: Image.Image, mask: np.ndarray) -> float:
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    border = _border_pixels(rgb.astype(np.float32))
    background_rgb = tuple(int(round(value)) for value in np.median(border, axis=0))
    colour_alpha = _colour_alpha(rgb, background_rgb)
    haze = (mask > 0.04) & (mask < 0.90) & (colour_alpha < 0.18)
    return float(np.mean(haze))


def mask_warnings(mask: np.ndarray, image: Image.Image | None = None) -> list[str]:
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
    if image is not None and residual_haze_ratio(image, mask) > 0.015:
        warnings.append("Un léger voile de l'ancien fond peut encore être présent.")
    border = np.concatenate((mask[0], mask[-1], mask[:, 0], mask[:, -1]))
    if float(np.mean(border > 0.5)) > 0.75:
        warnings.append("Le sujet touche fortement les bords de l'image.")
    return warnings
