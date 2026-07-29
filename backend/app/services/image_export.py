from __future__ import annotations

from io import BytesIO

import cv2
import numpy as np
from PIL import Image, PngImagePlugin


def preserve_source_alpha(image: Image.Image, predicted: np.ndarray) -> np.ndarray:
    if "A" not in image.getbands():
        return predicted
    source_alpha = np.asarray(image.getchannel("A"), dtype=np.float32) / 255.0
    # Existing transparency is authoritative and can never become opaque.
    return np.minimum(predicted, source_alpha)


def decontaminate_edges(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Gently correct only the partially transparent fringe RGB."""
    boundary = (alpha > 0.04) & (alpha < 0.96)
    if not np.any(boundary):
        return rgb

    interior_weight = (alpha >= 0.96).astype(np.float32)
    denominator = cv2.GaussianBlur(interior_weight, (0, 0), 1.6)
    cleaned = rgb.astype(np.float32).copy()
    # Keep genuine semi-transparent colour: correction is strongest only near 50% alpha.
    strength = np.clip(1.0 - np.abs(alpha - 0.5) * 2.0, 0.0, 1.0) * 0.42
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
) -> bytes:
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    if decontaminate:
        rgb = decontaminate_edges(rgb, alpha)
    alpha_u8 = np.round(np.clip(alpha, 0.0, 1.0) * 255).astype(np.uint8)
    rgba = np.dstack((rgb, alpha_u8))

    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("Software", "PRINTELLY Local Background Removal")
    metadata.add_text("Privacy", "Processed locally; no third-party image API")
    save_options: dict[str, object] = {
        "compress_level": 6,
        "pnginfo": metadata,
    }
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
