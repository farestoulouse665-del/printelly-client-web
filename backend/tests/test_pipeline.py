from __future__ import annotations

from io import BytesIO

import numpy as np
from PIL import Image

from app.models.schemas import RemovalMode
from app.services.background_removal import BackgroundRemovalPipeline
from app.services.mask_refinement import RefinementOptions, mask_warnings


class FakeSemanticProvider:
    name = "fake-semantic"
    device = "cpu"

    def predict_mask(self, image: Image.Image, mode: RemovalMode) -> np.ndarray:
        mask = np.zeros((image.height, image.width), dtype=np.float32)
        mask[1:-1, 1:-1] = 1
        return mask


def test_pipeline_uses_provider_and_preserves_original_size():
    image = Image.new("RGB", (12, 10), (250, 250, 250))
    pipeline = BackgroundRemovalPipeline(FakeSemanticProvider())
    result = pipeline.process(
        image,
        RemovalMode.person,
        RefinementOptions(refine=True, feather=0, edge_shift=0),
        decontaminate=False,
    )
    with Image.open(BytesIO(result.png)) as exported:
        assert exported.size == image.size
        assert exported.mode == "RGBA"
        assert exported.getpixel((0, 0))[3] == 0
        assert exported.getpixel((5, 5))[:3] == (250, 250, 250)


def test_quality_warnings_cover_empty_and_opaque_masks():
    empty = mask_warnings(np.zeros((10, 10), dtype=np.float32))
    opaque = mask_warnings(np.ones((10, 10), dtype=np.float32))
    assert any("vide" in warning for warning in empty)
    assert any("peu" in warning for warning in opaque)
