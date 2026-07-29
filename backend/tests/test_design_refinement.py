from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

from app.models.schemas import RemovalMode
from app.services.mask_refinement import RefinementOptions, refine_mask


def _options() -> RefinementOptions:
    return RefinementOptions(refine=True, feather=0, edge_shift=0)


def test_design_mode_removes_black_background_and_keeps_white_graphic():
    image = Image.new("RGB", (80, 60), "black")
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 18, 59, 41), fill="white")
    semantic = np.zeros((60, 80), dtype=np.float32)

    alpha = refine_mask(
        image=image,
        raw_mask=semantic,
        mode=RemovalMode.design,
        options=_options(),
    )

    assert alpha[0, 0] < 0.01
    assert alpha[30, 40] > 0.99


def test_background_colour_inside_semantic_subject_is_protected():
    image = Image.new("RGB", (80, 60), "black")
    draw = ImageDraw.Draw(image)
    draw.rectangle((18, 12, 61, 47), fill=(220, 40, 30))
    draw.rectangle((30, 22, 49, 37), fill="black")
    semantic = np.zeros((60, 80), dtype=np.float32)
    semantic[12:48, 18:62] = 0.96

    alpha = refine_mask(
        image=image,
        raw_mask=semantic,
        mode=RemovalMode.design,
        options=_options(),
    )

    assert alpha[0, 0] < 0.01
    assert alpha[30, 40] > 0.95
    assert tuple(np.asarray(image)[30, 40]) == (0, 0, 0)


def test_design_mode_keeps_multiple_foreground_colours():
    image = Image.new("RGB", (90, 70), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 15, 69, 54), fill=(230, 20, 20))
    draw.ellipse((30, 23, 59, 48), fill=(20, 80, 230))
    draw.line((20, 35, 69, 35), fill=(0, 0, 0), width=4)
    semantic = np.zeros((70, 90), dtype=np.float32)
    semantic[15:55, 20:70] = 0.90

    alpha = refine_mask(
        image=image,
        raw_mask=semantic,
        mode=RemovalMode.design,
        options=_options(),
    )

    assert alpha[0, 0] < 0.01
    assert alpha[35, 25] > 0.95
    assert alpha[35, 45] > 0.95


def test_original_transparency_and_design_mask_remain_separate_concerns():
    image = Image.new("RGBA", (40, 30), (0, 0, 0, 255))
    draw = ImageDraw.Draw(image)
    draw.ellipse((10, 5, 29, 24), fill=(255, 255, 255, 255))
    semantic = np.zeros((30, 40), dtype=np.float32)

    alpha = refine_mask(
        image=image,
        raw_mask=semantic,
        mode=RemovalMode.design,
        options=_options(),
    )

    assert alpha.shape == (30, 40)
    assert alpha[0, 0] < 0.01
    assert alpha[15, 20] > 0.99
