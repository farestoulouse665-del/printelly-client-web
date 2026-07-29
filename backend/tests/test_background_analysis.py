from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

from app.models.schemas import BackgroundCleanup, RemovalMode
from app.services.background_analysis import BackgroundAnalyzer
from app.services.background_removal import BackgroundRemovalPipeline


class FakeProvider:
    name = "fake"
    device = "cpu"

    def predict_mask(self, image: Image.Image, mode: RemovalMode) -> np.ndarray:
        return np.zeros((image.height, image.width), dtype=np.float32)


def analyze(
    image: Image.Image,
    semantic: np.ndarray,
    *,
    force: bool = True,
):
    result = BackgroundAnalyzer().analyze(
        image,
        semantic,
        BackgroundCleanup.normal,
        protect_details=True,
        force=force,
    )
    assert result is not None
    return result


def test_analyzer_removes_border_background_but_protects_same_colour_interior():
    image = Image.new("RGB", (96, 96), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((18, 18, 77, 77), fill=(205, 24, 35))
    draw.rectangle((39, 39, 56, 56), fill="white")
    semantic = np.zeros((96, 96), dtype=np.float32)
    semantic[18:78, 18:78] = 0.96

    result = analyze(image, semantic)

    assert result.background_mask[0, 0]
    assert not result.background_mask[47, 47]
    assert result.protected_mask[47, 47]
    assert result.background_rgb[0] >= 245
    assert result.border_coverage > 0.95


def test_subject_touching_border_cannot_poison_background_reference():
    image = Image.new("RGB", (96, 96), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((30, 0, 65, 45), fill=(8, 8, 8))
    semantic = np.zeros((96, 96), dtype=np.float32)
    semantic[0:46, 30:66] = 0.97

    result = analyze(image, semantic, force=False)

    assert min(result.background_rgb) >= 245
    assert result.background_mask[0, 0]
    assert not result.background_mask[10, 45]
    assert result.protected_mask[10, 45]


def test_black_background_keeps_dark_semantic_subject():
    image = Image.new("RGB", (80, 80), "black")
    draw = ImageDraw.Draw(image)
    draw.ellipse((22, 12, 58, 70), fill=(22, 22, 22))
    semantic = np.zeros((80, 80), dtype=np.float32)
    semantic[12:71, 22:59] = 0.94

    result = analyze(image, semantic)

    assert result.background_mask[0, 0]
    assert not result.background_mask[35, 40]
    assert result.protected_mask[35, 40]
    assert max(result.background_rgb) <= 2


def test_pipeline_v2_is_explicit_and_reversible():
    legacy = BackgroundRemovalPipeline(FakeProvider())
    improved = BackgroundRemovalPipeline(
        FakeProvider(),
        background_pipeline_v2_enabled=True,
    )

    assert legacy.pipeline_version == "background-v1"
    assert legacy.background_analyzer is None
    assert improved.pipeline_version == "background-v2"
    assert improved.background_analyzer is not None
