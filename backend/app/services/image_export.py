from __future__ import annotations

from io import BytesIO

import cv2
import numpy as np
from PIL import Image, PngImagePlugin


def source_alpha_mask(image: Image.Image) -> np.ndarray:
    """Return the source alpha as a normalized float mask."""
    if "A" not in image.getbands():
        return np.ones((image.height, image.width), dtype=np.float32)
    return np.asarray(image.getchannel("A"), dtype=np.float32) / 255.0


def source_alpha_is_authoritative(image: Image.Image) -> bool:
    """Detect an image that is already genuinely cut out.

    A few accidental transparent pixels must not disable semantic inference. We trust the
    source alpha only when transparency is material and either reaches the image border or
    occupies a substantial part of the canvas.
    """
    if "A" not in image.getbands():
        return False
    alpha = source_alpha_mask(image)
    transparent_ratio = float(np.mean(alpha < 0.98))
    if transparent_ratio < 0.005:
        return False
    border = np.concatenate((alpha[0], alpha[-1], alpha[:, 0], alpha[:, -1]))
    clear_border_ratio = float(np.mean(border < 0.05))
    return (
        (transparent_ratio >= 0.02 and clear_border_ratio >= 0.05)
        or transparent_ratio >= 0.15
    )


def preserve_source_alpha(image: Image.Image, predicted: np.ndarray) -> np.ndarray:
    if "A" not in image.getbands():
        return predicted
    return np.minimum(predicted, source_alpha_mask(image))


def _estimate_border_background(rgb: np.ndarray) -> np.ndarray:
    height, width = rgb.shape[:2]
    strip = max(1, min(12, round(min(height, width) * 0.015)))
    border = np.concatenate(
        (
            rgb[:strip].reshape(-1, 3),
            rgb[-strip:].reshape(-1, 3),
            rgb[:, :strip].reshape(-1, 3),
            rgb[:, -strip:].reshape(-1, 3),
        ),
        axis=0,
    )
    return np.median(border.astype(np.float32), axis=0)


def recover_background_spill(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Recover foreground RGB from C = alpha*F + (1-alpha)*B."""
    boundary = (alpha > 0.045) & (alpha < 0.97)
    if not np.any(boundary):
        return rgb
    source = rgb.astype(np.float32)
    background = _estimate_border_background(rgb)
    alpha_3d = np.clip(alpha[:, :, None], 0.045, 1.0)
    unmixed = (source - (1.0 - alpha_3d) * background) / alpha_3d
    unmixed = np.clip(unmixed, 0.0, 255.0)
    strength = np.where(boundary, 0.82, 0.0)[:, :, None]
    recovered = source * (1.0 - strength) + unmixed * strength
    return np.clip(recovered, 0, 255).astype(np.uint8)


def decontaminate_edges(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Gently correct only the partially transparent fringe RGB."""
    boundary = (alpha > 0.04) & (alpha < 0.96)
    if not np.any(boundary):
        return rgb

    interior_weight = (alpha >= 0.96).astype(np.float32)
    denominator = cv2.GaussianBlur(interior_weight, (0, 0), 1.6)
    cleaned = rgb.astype(np.float32).copy()
    strength = np.clip(1.0 - np.abs(alpha - 0.5) * 2.0, 0.0, 1.0) * 0.32
    strength = np.where(boundary & (denominator > 0.02), strength, 0.0)
    for channel in range(3):
        weighted = rgb[:, :, channel].astype(np.float32) * interior_weight
        nearby = cv2.GaussianBlur(weighted, (0, 0), 1.6)
        estimate = nearby / np.maximum(denominator, 1e-5)
        cleaned[:, :, channel] = (
            cleaned[:, :, channel] * (1.0 - strength) + estimate * strength
        )
    return np.clip(cleaned, 0, 255).astype(np.uint8)


def export_png(
    image: Image.Image,
    alpha: np.ndarray,
    *,
    decontaminate: bool,
    recover_spill: bool = False,
) -> bytes:
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    if recover_spill:
        rgb = recover_background_spill(rgb, alpha)
    if decontaminate:
        rgb = decontaminate_edges(rgb, alpha)
    alpha_u8 = np.round(np.clip(alpha, 0.0, 1.0) * 255).astype(np.uint8)
    rgba = np.dstack((rgb, alpha_u8))

    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("Software", "PRINTELLY Local Background Removal")
    metadata.add_text("Privacy", "Processed locally; no third-party image API")
    save_options: dict[str, object] = {"compress_level": 6, "pnginfo": metadata}
    dpi = image.info.get("dpi")
    if isinstance(dpi, tuple) and len(dpi) == 2 and all(float(value) > 0 for value in dpi):
        save_options["dpi"] = dpi
    icc_profile = image.info.get("icc_profile")
    if isinstance(icc_profile, bytes) and icc_profile:
        save_options["icc_profile"] = icc_profile

    output = BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(output, format="PNG", **save_options)
    payload = output.getvalue()
    verify_png(payload, image.size)
    return payload


def verify_png(payload: bytes, expected_size: tuple[int, int]) -> None:
    with Image.open(BytesIO(payload)) as exported:
        exported.load()
        if exported.format != "PNG" or exported.mode != "RGBA":
            raise RuntimeError("L'export n'est pas un PNG RGBA valide.")
        if exported.size != expected_size:
            raise RuntimeError("Les dimensions de l'export ont changé.")
        if "A" not in exported.getbands():
            raise RuntimeError("Le fichier exporté ne contient pas de canal alpha.")
