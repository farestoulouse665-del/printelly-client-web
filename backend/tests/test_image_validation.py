from __future__ import annotations

import asyncio
from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image
from starlette.datastructures import Headers

from app.core.config import Settings
from app.services.image_validation import safe_output_name, validate_upload


def png_bytes(size: tuple[int, int] = (8, 8)) -> bytes:
    output = BytesIO()
    Image.new("RGB", size, (255, 255, 255)).save(output, "PNG")
    return output.getvalue()


def upload(payload: bytes, content_type: str = "image/png") -> UploadFile:
    return UploadFile(
        file=BytesIO(payload),
        filename="robe blanche.png",
        headers=Headers({"content-type": content_type}),
    )


def test_valid_png_is_decoded_and_temp_file_is_removable(tmp_path):
    config = Settings(temp_dir=tmp_path, max_upload_mb=1, max_image_pixels=100)
    result = asyncio.run(validate_upload(upload(png_bytes()), config))
    assert result.image.size == (8, 8)
    assert result.output_filename == "robe-blanche-sans-fond.png"
    assert result.temp_path.is_file()
    result.image.close()
    result.temp_path.unlink()


def test_magic_signature_is_checked(tmp_path):
    config = Settings(temp_dir=tmp_path, max_upload_mb=1, max_image_pixels=100)
    with pytest.raises(HTTPException) as caught:
        asyncio.run(validate_upload(upload(b"not a png"), config))
    assert caught.value.status_code == 415
    assert not list(tmp_path.iterdir())


def test_pixel_limit_is_enforced_and_temp_is_cleaned(tmp_path):
    config = Settings(temp_dir=tmp_path, max_upload_mb=1, max_image_pixels=10)
    with pytest.raises(HTTPException) as caught:
        asyncio.run(validate_upload(upload(png_bytes((8, 8))), config))
    assert caught.value.status_code in {413, 422}
    assert not list(tmp_path.iterdir())


def test_output_name_is_sanitized():
    assert safe_output_name("../../ma création?.jpg") == "ma-creation-sans-fond.png"
