from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    model_path: Path = Path(os.getenv("BACKGROUND_MODEL_PATH", "/models/background-removal.onnx"))
    model_sha256: str = os.getenv("BACKGROUND_MODEL_SHA256", "").strip().lower()
    model_name: str = os.getenv("BACKGROUND_MODEL_NAME", "BiRefNet-general-tiny")
    device: str = os.getenv("BACKGROUND_DEVICE", "cpu").strip().lower()
    model_input_size: int = _int("BACKGROUND_MODEL_INPUT_SIZE", 1024)
    max_upload_mb: int = _int("MAX_UPLOAD_MB", 20)
    max_image_pixels: int = _int("MAX_IMAGE_PIXELS", 40_000_000)
    temp_dir: Path = Path(os.getenv("TEMP_DIR", "/tmp/background-removal"))
    temp_ttl_seconds: int = _int("TEMP_TTL_SECONDS", 900)
    rate_limit_per_minute: int = _int("RATE_LIMIT_PER_MINUTE", 10)
    max_concurrent_jobs: int = _int("MAX_CONCURRENT_JOBS", 1)
    request_timeout_seconds: int = _int("REQUEST_TIMEOUT_SECONDS", 180)
    onnx_intra_op_threads: int = _int("ONNX_INTRA_OP_THREADS", 0)
    cors_origins: tuple[str, ...] = tuple(
        item.strip()
        for item in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:8080,http://127.0.0.1:8080,"
            "https://farestoulouse665-del.github.io",
        ).split(",")
        if item.strip()
    )
    enable_docs: bool = _bool("ENABLE_API_DOCS", False)
    trust_proxy_headers: bool = _bool("TRUST_PROXY_HEADERS", False)

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


settings = Settings()
