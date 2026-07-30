from __future__ import annotations

from io import BytesIO

import httpx
import numpy as np
import pytest
from PIL import Image

from app.core.config import Settings
from app.models.schemas import RemovalMode
from app.providers.removebg_provider import RemoveBgProvider


def _png_response() -> bytes:
    image = Image.new("RGBA", (3, 2), (24, 90, 180, 0))
    image.putpixel((1, 0), (24, 90, 180, 128))
    image.putpixel((2, 1), (24, 90, 180, 255))
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _settings() -> Settings:
    return Settings(
        removebg_api_key="test-removebg-key",
        removebg_api_url="https://api.remove.bg/v1.0/removebg",
        removebg_size="auto",
        removebg_timeout_seconds=30,
    )


def test_removebg_uses_the_official_multipart_contract_and_returns_alpha_mask():
    def handler(request: httpx.Request) -> httpx.Response:
        body = request.read()
        assert request.method == "POST"
        assert str(request.url) == "https://api.remove.bg/v1.0/removebg"
        assert request.headers["X-Api-Key"] == "test-removebg-key"
        assert request.headers["Content-Type"].startswith("multipart/form-data;")
        assert b'name="image_file"' in body
        assert b'filename="transferlab-source.png"' in body
        assert b'name="size"' in body
        assert b"auto" in body
        assert b'name="format"' in body
        assert b"png" in body
        return httpx.Response(
            200,
            headers={"Content-Type": "image/png"},
            content=_png_response(),
        )

    provider = RemoveBgProvider(_settings(), transport=httpx.MockTransport(handler))
    mask = provider.predict_mask(
        Image.new("RGB", (3, 2), (240, 240, 240)),
        RemovalMode.auto,
    )

    assert mask.shape == (2, 3)
    assert mask.dtype == np.float32
    assert mask[0, 0] == pytest.approx(0)
    assert mask[0, 1] == pytest.approx(128 / 255)
    assert mask[1, 2] == pytest.approx(1)


def test_removebg_surfaces_the_provider_error_without_exposing_the_key():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["X-Api-Key"] == "test-removebg-key"
        return httpx.Response(
            403,
            json={"errors": [{"title": "API Key invalid"}]},
        )

    provider = RemoveBgProvider(_settings(), transport=httpx.MockTransport(handler))

    with pytest.raises(RuntimeError, match=r"remove\.bg: API Key invalid") as error:
        provider.predict_mask(
            Image.new("RGB", (2, 2), (255, 255, 255)),
            RemovalMode.auto,
        )

    assert "test-removebg-key" not in str(error.value)


def test_removebg_rejects_a_success_response_without_real_alpha():
    output = BytesIO()
    Image.new("RGB", (2, 2), (255, 255, 255)).save(output, format="JPEG")

    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            headers={"Content-Type": "image/jpeg"},
            content=output.getvalue(),
        )
    )
    provider = RemoveBgProvider(_settings(), transport=transport)

    with pytest.raises(RuntimeError, match="canal alpha"):
        provider.predict_mask(
            Image.new("RGB", (2, 2), (255, 255, 255)),
            RemovalMode.auto,
        )
