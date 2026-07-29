from __future__ import annotations

import json
import re
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

from app.schemas.api import ExportCreateIn
from app.services.dtf_preflight import preflight_analyzer


def _safe_stem(name: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9._-]+", "-", Path(name).stem).strip("._-")
    return value[:80] or "design"


class ExportService:
    def render(self, source_png: bytes, request: ExportCreateIn) -> tuple[bytes, str, str]:
        with Image.open(BytesIO(source_png)) as opened:
            opened.load()
            image = opened.convert("RGBA")

        if request.crop_to_content:
            alpha = np.asarray(image.getchannel("A"), dtype=np.uint8)
            positions = np.argwhere(alpha > 0)
            if positions.size:
                y0, x0 = positions.min(axis=0)
                y1, x1 = positions.max(axis=0)
                image = image.crop((int(x0), int(y0), int(x1) + 1, int(y1) + 1))

        if request.margin_mm > 0:
            margin = round(request.margin_mm / 25.4 * request.dpi)
            canvas = Image.new(
                "RGBA",
                (image.width + margin * 2, image.height + margin * 2),
                (0, 0, 0, 0),
            )
            canvas.alpha_composite(image, (margin, margin))
            image = canvas

        if request.width_cm:
            width_pixels = max(1, round(request.width_cm / 2.54 * request.dpi))
            height_pixels = max(1, round(image.height * width_pixels / image.width))
            image = image.resize((width_pixels, height_pixels), Image.Resampling.LANCZOS)

        output = BytesIO()
        if request.format == "dtf_report_json":
            width_cm = request.width_cm or image.width / request.dpi * 2.54
            report = preflight_analyzer.analyze(
                source_png,
                width=width_cm,
                height=None,
                unit="cm",
                target_dpi=request.dpi,
            )
            document = {
                "status": report.status,
                "score": report.score,
                "width_cm": report.width_cm,
                "height_cm": report.height_cm,
                "dpi": report.dpi,
                "issues": [issue.as_dict() for issue in report.issues],
                "metrics": report.metrics,
                "notice": "Rapport informatif; le design n’a pas été modifié.",
            }
            return (
                json.dumps(document, ensure_ascii=False, indent=2).encode("utf-8"),
                "application/json",
                ".dtf-report.json",
            )
        if request.format == "alpha_png":
            image.getchannel("A").save(output, format="PNG", optimize=True)
            return output.getvalue(), "image/png", ".alpha.png"
        if request.format == "preview_jpg":
            background = Image.new("RGB", image.size, (238, 241, 246))
            background.paste(image, mask=image.getchannel("A"))
            background.save(output, format="JPEG", quality=92, optimize=True)
            return output.getvalue(), "image/jpeg", ".preview.jpg"
        if request.format == "underbase_jpg":
            return (
                preflight_analyzer.white_underbase_preview(source_png),
                "image/jpeg",
                ".underbase.jpg",
            )
        if request.format == "pdf_preview":
            background = Image.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.getchannel("A"))
            background.save(output, format="PDF", resolution=request.dpi)
            return output.getvalue(), "application/pdf", ".preview.pdf"

        image.save(output, format="PNG", optimize=True, dpi=(request.dpi, request.dpi))
        return output.getvalue(), "image/png", ".png"

    @staticmethod
    def filename(
        original_name: str,
        request: ExportCreateIn,
        extension: str,
    ) -> str:
        size = f"_{request.width_cm:g}cm" if request.width_cm else "_original"
        quantity = f"_QTE{request.quantity}"
        return f"PRINTELLY_{_safe_stem(original_name)}{size}{quantity}_DTF{extension}"


export_service = ExportService()
