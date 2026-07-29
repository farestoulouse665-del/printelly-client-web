from __future__ import annotations

from io import BytesIO

import numpy as np
import pytest
from PIL import Image

from app.services.image_export import export_png, preserve_source_alpha


def test_png_is_rgba_transparent_and_keeps_dimensions_and_interior_rgb():
    image = Image.new("RGB", (6, 4), (12, 34, 56))
    alpha = np.ones((4, 6), dtype=np.float32)
    alpha[:, :2] = 0
    payload = export_png(image, alpha, decontaminate=False)
    with Image.open(BytesIO(payload)) as result:
        result.load()
        assert result.mode == "RGBA"
        assert result.size == image.size
        assert result.getpixel((0, 0))[3] == 0
        assert result.getpixel((4, 2)) == (12, 34, 56, 255)


def test_existing_transparency_is_never_made_opaque():
    image = Image.new("RGBA", (3, 2), (10, 20, 30, 255))
    image.putpixel((1, 1), (10, 20, 30, 0))
    predicted = np.ones((2, 3), dtype=np.float32)
    merged = preserve_source_alpha(image, predicted)
    assert merged[1, 1] == 0
    assert merged[0, 0] == 1


def test_export_rejects_an_entirely_opaque_mask():
    image = Image.new("RGB", (2, 2), "white")
    with pytest.raises(RuntimeError, match="aucun pixel transparent"):
        export_png(image, np.ones((2, 2), dtype=np.float32), decontaminate=False)


def test_export_rejects_an_empty_subject():
    image = Image.new("RGB", (2, 2), "white")
    with pytest.raises(RuntimeError, match="tout le sujet"):
        export_png(image, np.zeros((2, 2), dtype=np.float32), decontaminate=False)
