from __future__ import annotations

import asyncio
import json
from dataclasses import replace
from io import BytesIO

import numpy as np
from PIL import Image
from starlette.datastructures import Headers, UploadFile

from app.core.config import settings
from app.models.schemas import RemovalMode
from app.providers.tiled_inference import TiledInferenceEngine, _tile_starts
from app.schemas.api import ExportCreateIn, MaskOperationIn, NormalizedPoint
from app.services.dtf_preflight import DTFPreflightAnalyzer
from app.services.exports import ExportService
from app.services.image_validation import validate_upload
from app.services.mask_editor import MaskEditor
from app.storage.local import LocalObjectStorage


def _png(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


class SolidProvider:
    name = "test-birefnet"
    device = "cpu"
    execution_provider = "CPUExecutionProvider"

    def predict_mask(self, image: Image.Image, mode: RemovalMode) -> np.ndarray:
        return np.ones((image.height, image.width), dtype=np.float32)


def test_tiled_inference_blends_without_seams_and_preserves_dimensions(tmp_path):
    assert _tile_starts(1800, 768, 96)[-1] == 1800 - 768
    engine = TiledInferenceEngine(
        SolidProvider(),
        tile_size=768,
        overlap=96,
        temp_dir=tmp_path,
    )
    image = Image.new("RGB", (1800, 1200), "white")
    try:
        mask = engine.predict_mask(image, RemovalMode.design)
        assert mask.shape == (1200, 1800)
        assert np.allclose(mask, 1.0, atol=1e-5)
    finally:
        engine.cleanup()
        image.close()
    assert not list(tmp_path.glob("printelly-mask-*"))


def test_signed_download_binds_safe_filename_and_rejects_tampering(tmp_path):
    store = LocalObjectStorage(tmp_path)
    link = store.signed_download_path(
        "assets/a/export.png",
        ttl_seconds=60,
        filename="Mon Design 30cm.png",
    )
    query = link.split("?", 1)[1]
    values = dict(part.split("=", 1) for part in query.split("&"))
    assert store.verify_signature(
        "assets/a/export.png",
        int(values["expires"]),
        values["signature"],
        "mon-design-30cm.png",
    )
    assert not store.verify_signature(
        "assets/a/export.png",
        int(values["expires"]),
        values["signature"],
        "autre.png",
    )


def test_magic_exterior_cannot_cross_a_confident_subject():
    original = Image.new("RGBA", (24, 24), (5, 5, 5, 255))
    base = Image.new("RGBA", (24, 24), (5, 5, 5, 0))
    for y in range(7, 17):
        for x in range(7, 17):
            base.putpixel((x, y), (5, 5, 5, 255))
    operation = MaskOperationIn(
        kind="magic_exterior",
        points=[NormalizedPoint(x=0.02, y=0.02)],
        tolerance=1.0,
    )
    result = MaskEditor().apply(_png(base), _png(original), operation)
    with Image.open(BytesIO(result)) as edited:
        assert edited.mode == "RGBA"
        assert edited.getpixel((0, 0))[3] == 0
        assert edited.getpixel((12, 12))[3] == 255


def test_export_is_true_rgba_and_keeps_size_until_resize_is_requested():
    source = Image.new("RGBA", (91, 57), (20, 140, 230, 0))
    for y in range(10, 45):
        for x in range(12, 78):
            source.putpixel((x, y), (20, 140, 230, 255))
    request = ExportCreateIn(asset_id="asset", format="png", dpi=300)
    payload, media_type, suffix = ExportService().render(_png(source), request)
    with Image.open(BytesIO(payload)) as exported:
        assert exported.mode == "RGBA"
        assert exported.size == (91, 57)
        assert exported.getpixel((0, 0))[3] == 0
    assert media_type == "image/png"
    assert suffix == ".png"


def test_preflight_detects_real_alpha_and_real_dpi():
    source = Image.new("RGBA", (1181, 1181), (0, 0, 0, 0))
    for y in range(100, 1080):
        for x in range(100, 1080):
            source.putpixel((x, y), (200, 20, 80, 255))
    report = DTFPreflightAnalyzer().analyze(
        _png(source),
        width=10,
        height=10,
        unit="cm",
        target_dpi=300,
    )
    assert report.metrics["true_alpha"] is True
    assert report.metrics["dimensions_preserved"] is True
    assert 299 <= report.dpi <= 301
    assert all(issue.code != "missing_transparency" for issue in report.issues)


def test_upload_validation_checks_signature_and_mime(tmp_path):
    config = replace(
        settings,
        temp_dir=tmp_path,
        max_upload_mb=1,
        max_image_pixels=1_000_000,
    )
    valid_payload = _png(Image.new("RGB", (32, 24), "white"))
    valid = UploadFile(
        filename="logo.png",
        file=BytesIO(valid_payload),
        headers=Headers({"content-type": "image/png"}),
    )
    checked = asyncio.run(validate_upload(valid, config))
    try:
        assert checked.detected_format == "PNG"
        assert checked.image.size == (32, 24)
    finally:
        checked.image.close()
        checked.temp_path.unlink(missing_ok=True)

    mismatch = UploadFile(
        filename="faux.jpg",
        file=BytesIO(valid_payload),
        headers=Headers({"content-type": "image/jpeg"}),
    )
    try:
        asyncio.run(validate_upload(mismatch, config))
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 415
    else:
        raise AssertionError("Un MIME incohérent doit être refusé.")


def test_pdf_preview_and_dtf_report_are_explicit_validation_outputs():
    source = Image.new("RGBA", (300, 200), (0, 0, 0, 0))
    for y in range(30, 170):
        for x in range(40, 260):
            source.putpixel((x, y), (30, 80, 210, 255))
    service = ExportService()
    pdf, pdf_media, pdf_suffix = service.render(
        _png(source),
        ExportCreateIn(
            asset_id="asset",
            format="pdf_preview",
            width_cm=10,
            dpi=300,
        ),
    )
    assert pdf.startswith(b"%PDF")
    assert pdf_media == "application/pdf"
    assert pdf_suffix == ".preview.pdf"

    report_payload, report_media, report_suffix = service.render(
        _png(source),
        ExportCreateIn(
            asset_id="asset",
            format="dtf_report_json",
            width_cm=10,
            dpi=300,
        ),
    )
    report = json.loads(report_payload)
    assert report["metrics"]["true_alpha"] is True
    assert "design n’a pas été modifié" in report["notice"]
    assert report_media == "application/json"
    assert report_suffix == ".dtf-report.json"
