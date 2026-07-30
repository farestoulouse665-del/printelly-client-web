from __future__ import annotations

from io import BytesIO

import httpx
import numpy as np
import pytest
from PIL import Image

from app.core.config import Settings
from app.models.schemas import RemovalMode
from app.providers.photoroom_provider import PhotoroomProvider
from app.services.mask_refinement import _remove_low_confidence_residue
from app.services.photoroom_upscale import (
    PhotoRoomUpscaleError,
    PhotoRoomUpscaleService,
)


def _png(size: tuple[int, int], *, alpha: bool = True) -> bytes:
    mode = "RGBA" if alpha else "RGB"
    color = (50, 120, 210, 255) if alpha else (50, 120, 210)
    image = Image.new(mode, size, color)
    if alpha:
        image.putpixel((0, 0), (220, 80, 45, 0))
        image.putpixel((size[0] - 1, size[1] - 1), (30, 190, 95, 128))
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _settings(**overrides) -> Settings:
    values = {
        "photoroom_api_key": "test-photoroom-key",
        "photoroom_api_url": "https://sdk.photoroom.com/v1/segment",
        "photoroom_timeout_seconds": 30,
        "photoroom_edit_api_url": "https://image-api.photoroom.com/v2/edit",
        "photoroom_upscale_enabled": True,
        "photoroom_upscale_default_mode": "ai.fast",
        "photoroom_edit_timeout_seconds": 30,
    }
    values.update(overrides)
    return Settings(**values)


def test_photoroom_segment_requests_full_rgba_and_returns_the_alpha_mask():
    def handler(request: httpx.Request) -> httpx.Response:
        body = request.read()
        assert request.method == "POST"
        assert str(request.url) == "https://sdk.photoroom.com/v1/segment"
        assert request.headers["x-api-key"] == "test-photoroom-key"
        assert b'name="image_file"' in body
        assert b'name="channels"' in body
        assert b"rgba" in body
        assert b'name="size"' in body
        assert b"full" in body
        return httpx.Response(
            200,
            headers={"Content-Type": "image/png"},
            content=_png((3, 2)),
        )

    provider = PhotoroomProvider(
        _settings(),
        transport=httpx.MockTransport(handler),
    )
    mask = provider.predict_mask(
        Image.new("RGB", (3, 2), (245, 245, 245)),
        RemovalMode.auto,
    )

    assert mask.shape == (2, 3)
    assert mask.dtype == np.float32
    assert mask[0, 0] == pytest.approx(0)
    assert mask[1, 2] == pytest.approx(128 / 255)


def test_upscale_uses_the_plus_contract_and_preserves_local_alpha():
    source = _png((2, 2))

    def handler(request: httpx.Request) -> httpx.Response:
        body = request.read()
        assert request.method == "POST"
        assert str(request.url) == "https://image-api.photoroom.com/v2/edit"
        assert request.headers["x-api-key"] == "test-photoroom-key"
        assert b'name="imageFile"' in body
        assert b'name="removeBackground"' in body
        assert b"false" in body
        assert b'name="upscale.mode"' in body
        assert b"ai.fast" in body
        assert b'name="export.format"' in body
        return httpx.Response(
            200,
            headers={"Content-Type": "image/png"},
            content=_png((8, 8)),
        )

    service = PhotoRoomUpscaleService(
        _settings(),
        transport=httpx.MockTransport(handler),
    )
    result = service.upscale(source, "ai.fast")

    assert result.input_width == 2
    assert result.input_height == 2
    assert result.output_width == 8
    assert result.output_height == 8
    assert result.scale_factor == 4
    assert result.alpha_preserved_locally is True
    with Image.open(BytesIO(result.png)) as image:
        image.load()
        assert image.mode == "RGBA"
        assert image.size == (8, 8)
        assert image.getpixel((0, 0)) == (0, 0, 0, 0)
        assert image.getchannel("A").getextrema()[0] == 0
        assert image.getchannel("A").getextrema()[1] == 255


@pytest.mark.parametrize(
    ("mode", "size", "limit"),
    [
        ("ai.fast", (1001, 20), 1000),
        ("ai.slow", (513, 20), 512),
    ],
)
def test_upscale_rejects_oversized_input_before_the_paid_request(mode, size, limit):
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500)

    service = PhotoRoomUpscaleService(
        _settings(),
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(PhotoRoomUpscaleError, match=rf"{limit} × {limit}"):
        service.upscale(_png(size), mode)

    assert calls == 0


def test_upscale_translates_missing_plus_access_without_exposing_the_key():
    service = PhotoRoomUpscaleService(
        _settings(),
        transport=httpx.MockTransport(
            lambda request: httpx.Response(403, json={"message": "forbidden"})
        ),
    )

    with pytest.raises(PhotoRoomUpscaleError, match="Image Editing API Plus") as error:
        service.upscale(_png((2, 2)), "ai.fast")

    assert "test-photoroom-key" not in str(error.value)


def test_upscale_rejects_a_success_response_without_alpha():
    service = PhotoRoomUpscaleService(
        _settings(),
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                headers={"Content-Type": "image/png"},
                content=_png((8, 8), alpha=False),
            )
        ),
    )

    with pytest.raises(PhotoRoomUpscaleError, match="canal alpha"):
        service.upscale(_png((2, 2)), "ai.fast")


def test_upscale_retries_only_a_transient_server_failure_once():
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503)
        return httpx.Response(
            200,
            headers={"Content-Type": "image/png"},
            content=_png((8, 8)),
        )

    service = PhotoRoomUpscaleService(
        _settings(),
        transport=httpx.MockTransport(handler),
    )
    result = service.upscale(_png((2, 2)), "ai.fast")

    assert result.output_width == 8
    assert calls == 2


def test_residue_cleanup_preserves_opaque_micro_details():
    mask = np.zeros((40, 40), dtype=np.float32)
    mask[10:30, 10:30] = 1
    mask[3, 3] = 0.35
    mask[5, 5] = 0.98

    cleaned = _remove_low_confidence_residue(mask, min_area=4)

    assert cleaned[3, 3] == 0
    assert cleaned[5, 5] == pytest.approx(0.98)
    assert np.all(cleaned[10:30, 10:30] == 1)
