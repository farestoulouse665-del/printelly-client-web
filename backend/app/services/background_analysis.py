from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

from app.models.schemas import BackgroundCleanup


@dataclass(frozen=True)
class BackgroundAnalysis:
    """Deterministic description of a border-connected background."""

    background_mask: np.ndarray
    protected_mask: np.ndarray
    risk_mask: np.ndarray
    background_rgb: tuple[int, int, int]
    confidence: float
    border_coverage: float
    colour_tolerance: float


class InteriorRegionProtector:
    """Protect semantic subject pixels and enclosed same-colour regions."""

    def build(
        self,
        rgb: np.ndarray,
        semantic_mask: np.ndarray,
        colour_candidate: np.ndarray,
        *,
        protect_details: bool,
    ) -> np.ndarray:
        semantic = np.clip(semantic_mask.astype(np.float32), 0.0, 1.0)
        strong_subject = semantic >= (0.34 if protect_details else 0.58)

        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
        gradient = cv2.magnitude(
            cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3),
            cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3),
        )
        subject_core = (semantic >= 0.58).astype(np.uint8)
        near_subject = cv2.dilate(
            subject_core,
            np.ones((5, 5), np.uint8),
            iterations=1,
        ).astype(bool)
        fine_detail = near_subject & (semantic >= 0.10) & (gradient >= 14.0)

        # A background-coloured region enclosed inside the artwork is not background.
        connected = _edge_connected(colour_candidate)
        enclosed_same_colour = colour_candidate & ~connected
        return strong_subject | fine_detail | enclosed_same_colour


class BackgroundAnalyzer:
    """Estimate a real background using colour, semantics and border topology.

    Version 2 deliberately treats colour as only one signal. A pixel is removable
    only when it is compatible with the border model, not protected by the subject,
    and connected to a confirmed border seed.
    """

    version = "2.0"

    def __init__(self, protector: InteriorRegionProtector | None = None) -> None:
        self.protector = protector or InteriorRegionProtector()

    def analyze(
        self,
        image: Image.Image,
        semantic_mask: np.ndarray,
        cleanup: BackgroundCleanup,
        *,
        protect_details: bool,
        force: bool,
        background_color: str | None = None,
    ) -> BackgroundAnalysis | None:
        rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
        semantic = np.clip(semantic_mask.astype(np.float32), 0.0, 1.0)
        if semantic.shape != rgb.shape[:2]:
            raise ValueError(
                f"Masque de taille {semantic.shape}, image de taille {rgb.shape[:2]}."
            )

        border = _border_mask(rgb.shape[0], rgb.shape[1])
        override = _parse_background_color(background_color)
        lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)

        safe_border = border & (semantic < 0.22)
        safe_count = int(np.count_nonzero(safe_border))
        minimum_safe = max(24, int(np.count_nonzero(border) * 0.12))
        fallback_used = safe_count < minimum_safe
        sample_mask = border if fallback_used else safe_border
        samples_rgb = rgb[sample_mask].astype(np.float32)
        samples_lab = lab[sample_mask]
        if samples_rgb.size == 0:
            return None

        if override is None:
            reference_rgb = tuple(
                int(round(value)) for value in np.median(samples_rgb, axis=0)
            )
            reference_lab = np.median(samples_lab, axis=0)
        else:
            reference_rgb = override
            reference_lab = cv2.cvtColor(
                np.asarray([[reference_rgb]], dtype=np.uint8),
                cv2.COLOR_RGB2LAB,
            )[0, 0].astype(np.float32)

        sample_distance = np.linalg.norm(samples_lab - reference_lab, axis=1)
        uniformity = float(np.percentile(sample_distance, 75))
        sample_quality = 0.72 if fallback_used else 1.0
        confidence = (
            1.0
            if override is not None
            else float(np.clip(1.0 - uniformity / 34.0, 0.0, 1.0))
            * sample_quality
        )
        if override is None and not force and confidence < 0.58:
            return None
        if override is None and force and confidence < 0.30:
            return None

        level_scale = {
            BackgroundCleanup.light: 0.88,
            BackgroundCleanup.normal: 1.0,
            BackgroundCleanup.strong: 1.22,
        }[cleanup]
        distance = np.linalg.norm(lab - reference_lab, axis=2)
        tolerance = float(
            np.clip(
                (np.percentile(sample_distance, 90) * 1.55 + 5.0) * level_scale,
                8.0,
                40.0,
            )
        )
        strict_candidate = distance <= tolerance
        protected = self.protector.build(
            rgb,
            semantic,
            strict_candidate,
            protect_details=protect_details,
        )
        strict_candidate &= ~protected
        background = _edge_connected(strict_candidate)

        # Grow only from confirmed seeds. Strong gradients and semantic evidence are
        # barriers, so expansion cannot jump through a subject contour.
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
        gradient = cv2.magnitude(
            cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3),
            cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3),
        )
        relaxed_factor = {
            BackgroundCleanup.light: 1.20,
            BackgroundCleanup.normal: 1.52,
            BackgroundCleanup.strong: 1.85,
        }[cleanup]
        relaxed_tolerance = float(np.clip(tolerance * relaxed_factor + 2.0, 11.0, 56.0))
        relaxed_candidate = (
            (distance <= relaxed_tolerance)
            & (semantic < (0.20 if protect_details else 0.32))
            & (gradient < 42.0)
            & ~protected
        )
        background |= _grow_from_seeds(relaxed_candidate, background)
        background &= ~protected

        border_coverage = float(np.mean(background[border])) if np.any(border) else 0.0
        confidence = float(np.clip(confidence * (0.55 + 0.45 * border_coverage), 0.0, 1.0))
        risk = (
            ~background
            & (distance <= relaxed_tolerance)
            & (semantic >= 0.10)
            & (semantic < 0.58)
        )
        return BackgroundAnalysis(
            background_mask=background,
            protected_mask=protected,
            risk_mask=risk,
            background_rgb=reference_rgb,
            confidence=confidence,
            border_coverage=border_coverage,
            colour_tolerance=tolerance,
        )


def _border_mask(height: int, width: int) -> np.ndarray:
    strip = max(1, min(12, round(min(height, width) * 0.015)))
    mask = np.zeros((height, width), dtype=bool)
    mask[:strip] = True
    mask[-strip:] = True
    mask[:, :strip] = True
    mask[:, -strip:] = True
    return mask


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


def _grow_from_seeds(candidate: np.ndarray, seeds: np.ndarray) -> np.ndarray:
    if not np.any(seeds):
        return np.zeros_like(candidate, dtype=bool)
    count, labels = cv2.connectedComponents(candidate.astype(np.uint8), connectivity=8)
    if count <= 1:
        return np.zeros_like(candidate, dtype=bool)
    seed_labels = np.unique(labels[seeds])
    lookup = np.zeros(count, dtype=bool)
    lookup[seed_labels] = True
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
