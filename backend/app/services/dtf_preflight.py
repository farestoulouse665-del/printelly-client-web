from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from math import sqrt

import cv2
import numpy as np
from PIL import Image


@dataclass(frozen=True)
class PreflightIssue:
    code: str
    severity: str
    title: str
    explanation: str
    location: dict[str, float] | None = None
    automatic_fix: str | None = None

    def as_dict(self) -> dict:
        return {
            "code": self.code,
            "severity": self.severity,
            "title": self.title,
            "explanation": self.explanation,
            "location": self.location,
            "automatic_fix": self.automatic_fix,
        }


@dataclass(frozen=True)
class PreflightResult:
    status: str
    score: int
    width_cm: float
    height_cm: float
    dpi: float
    issues: list[PreflightIssue]
    metrics: dict


def _to_width_cm(width: float, unit: str, target_dpi: int) -> float:
    if unit == "cm":
        return width
    if unit == "mm":
        return width / 10.0
    if unit == "in":
        return width * 2.54
    return width / target_dpi * 2.54


def _small_components(binary: np.ndarray) -> tuple[int, np.ndarray]:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        binary.astype(np.uint8), connectivity=8
    )
    if count <= 1:
        return 0, np.zeros_like(binary, dtype=bool)
    total = binary.size
    area_limit = max(3, round(total * 0.0000025))
    selected = np.zeros(count, dtype=bool)
    number = 0
    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area <= area_limit:
            selected[label] = True
            number += 1
    return number, selected[labels]


def _location(mask: np.ndarray) -> dict[str, float] | None:
    positions = np.argwhere(mask)
    if positions.size == 0:
        return None
    height, width = mask.shape
    y0, x0 = positions.min(axis=0)
    y1, x1 = positions.max(axis=0)
    return {
        "x": round(float(x0 / width), 4),
        "y": round(float(y0 / height), 4),
        "width": round(float((x1 - x0 + 1) / width), 4),
        "height": round(float((y1 - y0 + 1) / height), 4),
    }


class DTFPreflightAnalyzer:
    """Analyze a rendered design without mutating its pixels."""

    def analyze(
        self,
        payload: bytes,
        *,
        width: float,
        height: float | None,
        unit: str,
        target_dpi: int,
    ) -> PreflightResult:
        with Image.open(BytesIO(payload)) as source:
            source.load()
            image = source.convert("RGBA")
            info = dict(source.info)
        rgba = np.asarray(image, dtype=np.uint8)
        pixel_height, pixel_width = rgba.shape[:2]
        alpha = rgba[:, :, 3]
        foreground = alpha >= 16
        opaque = alpha >= 250
        semi = (alpha > 0) & (alpha < 250)

        width_cm = _to_width_cm(width, unit, target_dpi)
        if height is None:
            height_cm = width_cm * pixel_height / pixel_width
        else:
            height_cm = _to_width_cm(height, unit, target_dpi)
        dpi_x = pixel_width / max(width_cm / 2.54, 0.001)
        dpi_y = pixel_height / max(height_cm / 2.54, 0.001)
        dpi = min(dpi_x, dpi_y)

        issues: list[PreflightIssue] = []
        if np.all(alpha == 255):
            issues.append(
                PreflightIssue(
                    "missing_transparency",
                    "error",
                    "Aucune transparence réelle",
                    "Le fichier est entièrement opaque. Le fond doit être supprimé avant impression.",
                    automatic_fix="background_removal",
                )
            )
        if dpi < 150:
            issues.append(
                PreflightIssue(
                    "dpi_critical",
                    "error",
                    "Résolution insuffisante",
                    f"Le fichier atteint seulement {dpi:.0f} DPI à cette taille.",
                    automatic_fix="resolution_enhancement",
                )
            )
        elif dpi < 300:
            issues.append(
                PreflightIssue(
                    "dpi_low",
                    "warning",
                    "Résolution à vérifier",
                    f"Le fichier atteint {dpi:.0f} DPI; 300 DPI est recommandé.",
                    automatic_fix="resolution_enhancement",
                )
            )

        foreground_pixels = int(np.count_nonzero(foreground))
        semi_ratio = float(np.mean(semi))
        very_low = (alpha > 0) & (alpha < 24)
        if semi_ratio > 0.08:
            issues.append(
                PreflightIssue(
                    "excessive_semTransparency",
                    "warning",
                    "Beaucoup de zones semi-transparentes",
                    "Certaines zones peuvent produire une sous-couche blanche irrégulière.",
                    _location(semi),
                    "review_alpha",
                )
            )
        if float(np.mean(very_low)) > 0.005:
            issues.append(
                PreflightIssue(
                    "very_low_opacity",
                    "warning",
                    "Pixels presque invisibles",
                    "Des pixels de très faible opacité risquent de créer des résidus imprimés.",
                    _location(very_low),
                    "remove_low_opacity",
                )
            )

        isolated_count, isolated_mask = _small_components(foreground)
        if isolated_count >= 5:
            issues.append(
                PreflightIssue(
                    "isolated_pixels",
                    "warning",
                    "Pixels isolés détectés",
                    f"{isolated_count} petits groupes doivent être vérifiés avant impression.",
                    _location(isolated_mask),
                    "residue_cleanup",
                )
            )

        margin = max(1, round(min(pixel_width, pixel_height) * 0.005))
        border_zone = np.zeros_like(foreground)
        border_zone[:margin] = True
        border_zone[-margin:] = True
        border_zone[:, :margin] = True
        border_zone[:, -margin:] = True
        touches = foreground & border_zone
        if np.any(touches):
            issues.append(
                PreflightIssue(
                    "content_touches_canvas",
                    "warning",
                    "Design proche du bord",
                    "Une partie visible touche presque le canevas et peut être coupée.",
                    _location(touches),
                    "add_transparent_margin",
                )
            )

        distance = cv2.distanceTransform(foreground.astype(np.uint8), cv2.DIST_L2, 5)
        thin_visible = foreground & (distance < 1.5)
        thin_ratio = float(np.count_nonzero(thin_visible) / max(1, foreground_pixels))
        printed_pixel_mm = 25.4 / max(dpi, 1)
        estimated_min_detail_mm = round(printed_pixel_mm * 2.0, 3)
        if thin_ratio > 0.18 and estimated_min_detail_mm < 0.25:
            issues.append(
                PreflightIssue(
                    "fine_details",
                    "info",
                    "Détails fins présents",
                    "Vérifiez les traits les plus fins dans la prévisualisation de sous-couche.",
                    _location(thin_visible),
                    None,
                )
            )

        rgb = rgba[:, :, :3].astype(np.float32)
        edge_band = semi & (alpha >= 24)
        white_edge = edge_band & (np.mean(rgb, axis=2) > 242)
        black_edge = edge_band & (np.mean(rgb, axis=2) < 10)
        halo_ratio = float(
            np.count_nonzero(white_edge | black_edge) / max(1, np.count_nonzero(edge_band))
        )
        if halo_ratio > 0.35 and np.count_nonzero(edge_band) > 50:
            issues.append(
                PreflightIssue(
                    "edge_halo",
                    "warning",
                    "Halo de bord possible",
                    "Des contours très blancs ou noirs subsistent dans les pixels anti-aliasés.",
                    _location(white_edge | black_edge),
                    "decontaminate_edges",
                )
            )

        severity_penalty = {"info": 2, "warning": 9, "error": 28}
        score = max(0, 100 - sum(severity_penalty[item.severity] for item in issues))
        if any(item.severity == "error" for item in issues):
            status = "correction_required"
        elif any(item.severity == "warning" for item in issues):
            status = "review"
        else:
            status = "ready"
        metrics = {
            "pixel_width": pixel_width,
            "pixel_height": pixel_height,
            "dpi_x": round(dpi_x, 2),
            "dpi_y": round(dpi_y, 2),
            "foreground_ratio": round(float(np.mean(foreground)), 6),
            "opaque_ratio": round(float(np.mean(opaque)), 6),
            "semi_transparent_ratio": round(semi_ratio, 6),
            "isolated_component_count": isolated_count,
            "thin_detail_ratio": round(thin_ratio, 6),
            "estimated_min_detail_mm": estimated_min_detail_mm,
            "halo_ratio": round(halo_ratio, 6),
            "icc_profile_present": bool(info.get("icc_profile")),
            "true_alpha": bool(np.any(alpha < 255)),
            "dimensions_preserved": True,
        }
        return PreflightResult(
            status=status,
            score=score,
            width_cm=round(width_cm, 3),
            height_cm=round(height_cm, 3),
            dpi=round(dpi, 2),
            issues=issues,
            metrics=metrics,
        )

    @staticmethod
    def white_underbase_preview(payload: bytes) -> bytes:
        """Return an informative grayscale preview, never the production PNG."""
        with Image.open(BytesIO(payload)) as source:
            alpha = source.convert("RGBA").getchannel("A")
        preview = Image.new("RGBA", alpha.size, (0, 0, 0, 255))
        white = Image.new("RGBA", alpha.size, (255, 255, 255, 255))
        preview.alpha_composite(Image.composite(white, preview, alpha))
        output = BytesIO()
        preview.convert("RGB").save(output, format="JPEG", quality=90, optimize=True)
        return output.getvalue()


preflight_analyzer = DTFPreflightAnalyzer()
