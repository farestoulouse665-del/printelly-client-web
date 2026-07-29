from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

from app.models.schemas import BackgroundCleanup, RemovalMode
from app.services.mask_refinement import (
    RefinementOptions,
    mask_warnings,
    refine_mask,
    residual_haze_ratio,
)


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



def test_small_background_variations_connected_to_the_edge_are_removed():
    image = Image.new("RGB", (90, 70), "black")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 26, 34, 42), fill=(14, 14, 14))
    draw.rectangle((38, 18, 72, 52), fill="white")
    semantic = np.zeros((70, 90), dtype=np.float32)

    alpha = refine_mask(
        image=image,
        raw_mask=semantic,
        mode=RemovalMode.design,
        options=_options(),
    )

    assert alpha[34, 10] < 0.01
    assert alpha[35, 55] > 0.99

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



def test_strong_cleanup_recovers_alpha_from_white_haze_without_losing_red_detail():
    image = Image.new("RGB", (100, 80), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((18, 18, 81, 61), fill=(255, 225, 225))
    draw.rectangle((32, 26, 67, 53), fill=(220, 20, 20))
    draw.ellipse((14, 36, 18, 40), fill=(225, 20, 20))
    semantic = np.zeros((80, 100), dtype=np.float32)
    semantic[26:54, 32:68] = 0.96
    semantic[36:41, 14:19] = 0.88

    alpha = refine_mask(
        image=image,
        raw_mask=semantic,
        mode=RemovalMode.design,
        options=RefinementOptions(
            refine=True,
            feather=0,
            edge_shift=0,
            background_cleanup=BackgroundCleanup.strong,
            protect_details=True,
            remove_haze=True,
        ),
    )

    assert alpha[0, 0] < 0.01
    assert 0.01 < alpha[20, 20] < 0.20
    assert alpha[40, 50] > 0.99
    assert alpha[38, 16] > 0.99


def test_same_white_as_background_is_kept_when_semantics_identify_the_subject():
    image = Image.new("RGB", (70, 50), "white")
    semantic = np.zeros((50, 70), dtype=np.float32)
    semantic[15:35, 25:45] = 0.97

    alpha = refine_mask(
        image=image,
        raw_mask=semantic,
        mode=RemovalMode.design,
        options=RefinementOptions(
            refine=True,
            feather=0,
            edge_shift=0,
            background_cleanup=BackgroundCleanup.strong,
            protect_details=True,
            remove_haze=True,
            background_color="#ffffff",
        ),
    )

    assert alpha[0, 0] < 0.01
    assert alpha[25, 35] > 0.99


def test_strong_cleanup_removes_more_matte_than_light_cleanup():
    image = Image.new("RGB", (60, 40), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((15, 12, 44, 27), fill=(255, 225, 225))
    semantic = np.zeros((40, 60), dtype=np.float32)

    light = refine_mask(
        raw_mask=semantic,
        image=image,
        mode=RemovalMode.design,
        options=RefinementOptions(
            refine=True,
            feather=0,
            background_cleanup=BackgroundCleanup.light,
        ),
    )
    strong = refine_mask(
        raw_mask=semantic,
        image=image,
        mode=RemovalMode.design,
        options=RefinementOptions(
            refine=True,
            feather=0,
            background_cleanup=BackgroundCleanup.strong,
        ),
    )

    assert strong[20, 30] < light[20, 30]


def test_residual_haze_score_and_warning_detect_a_remaining_matte():
    image = Image.new("RGB", (40, 30), "white")
    mask = np.zeros((30, 40), dtype=np.float32)
    mask[5:25, 8:32] = 0.20

    assert residual_haze_ratio(image, mask) > 0.015
    assert any("voile" in warning for warning in mask_warnings(mask, image))
