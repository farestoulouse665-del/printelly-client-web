from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _csv(name: str, default: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in os.getenv(name, default).split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    environment: str = os.getenv("APP_ENV", "development").strip().lower()
    app_name: str = "TransferLab"
    api_version: str = "v1"

    background_provider: str = os.getenv("BACKGROUND_PROVIDER", "local").strip().lower()
    model_path: Path = Path(os.getenv("BACKGROUND_MODEL_PATH", "/models/background-removal.onnx"))
    model_sha256: str = os.getenv("BACKGROUND_MODEL_SHA256", "").strip().lower()
    model_name: str = os.getenv("BACKGROUND_MODEL_NAME", "BiRefNet-general")
    pipeline_version: str = os.getenv("BACKGROUND_PIPELINE_VERSION", "transferlab-birefnet-v3")
    device: str = os.getenv("BACKGROUND_DEVICE", "auto").strip().lower()
    model_input_size: int = _int("BACKGROUND_MODEL_INPUT_SIZE", 1024)
    onnx_intra_op_threads: int = _int("ONNX_INTRA_OP_THREADS", 0)
    removebg_api_key: str = os.getenv("REMOVEBG_API_KEY", "").strip()
    removebg_api_url: str = os.getenv(
        "REMOVEBG_API_URL",
        "https://api.remove.bg/v1.0/removebg",
    ).strip()
    removebg_size: str = os.getenv("REMOVEBG_SIZE", "auto").strip().lower()
    removebg_timeout_seconds: int = _int("REMOVEBG_TIMEOUT_SECONDS", 180)
    max_concurrent_jobs: int = _int("MAX_CONCURRENT_JOBS", 1)
    tile_size: int = _int("INFERENCE_TILE_SIZE", 2048)
    tile_overlap: int = _int("INFERENCE_TILE_OVERLAP", 192)
    large_image_threshold_pixels: int = _int("LARGE_IMAGE_THRESHOLD_PIXELS", 16_000_000)

    max_upload_mb: int = _int("MAX_UPLOAD_MB", 150)
    max_image_pixels: int = _int("MAX_IMAGE_PIXELS", 120_000_000)
    max_batch_files: int = _int("MAX_BATCH_FILES", 25)
    upload_chunk_mb: int = _int("UPLOAD_CHUNK_MB", 8)
    temp_dir: Path = Path(os.getenv("TEMP_DIR", "/tmp/background-removal"))
    temp_ttl_seconds: int = _int("TEMP_TTL_SECONDS", 1800)
    retention_days_guest: int = _int("RETENTION_DAYS_GUEST", 7)
    retention_days_user: int = _int("RETENTION_DAYS_USER", 90)
    deletion_grace_hours: int = _int("DELETION_GRACE_HOURS", 24)
    maintenance_interval_seconds: int = _int("MAINTENANCE_INTERVAL_SECONDS", 3600)

    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://transferlab:transferlab@postgres:5432/transferlab",
    )
    redis_url: str = os.getenv("REDIS_URL", "redis://redis:6379/0")
    queue_name: str = os.getenv("RQ_QUEUE_NAME", "background-removal")
    job_timeout_seconds: int = _int("JOB_TIMEOUT_SECONDS", 1800)
    request_timeout_seconds: int = _int("REQUEST_TIMEOUT_SECONDS", 300)
    job_eager: bool = _bool("JOB_EAGER", False)

    storage_backend: str = os.getenv("STORAGE_BACKEND", "local").strip().lower()
    storage_root: Path = Path(os.getenv("STORAGE_ROOT", "/data/objects"))
    minio_endpoint: str = os.getenv("MINIO_ENDPOINT", "minio:9000")
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "transferlab")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "change-me")
    minio_bucket: str = os.getenv("MINIO_BUCKET", "transferlab-assets")
    minio_secure: bool = _bool("MINIO_SECURE", False)
    signing_secret: str = os.getenv("SIGNING_SECRET", "development-only-change-me")
    signed_url_ttl_seconds: int = _int("SIGNED_URL_TTL_SECONDS", 900)

    admin_token: str = os.getenv("ADMIN_TOKEN", "development-admin-change-me")
    rate_limit_per_minute: int = _int("RATE_LIMIT_PER_MINUTE", 30)
    trust_proxy_headers: bool = _bool("TRUST_PROXY_HEADERS", False)
    cors_origins: tuple[str, ...] = _csv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:8080,http://127.0.0.1:3000,"
        "https://farestoulouse665-del.github.io",
    )
    public_api_url: str = os.getenv("PUBLIC_API_URL", "http://localhost:8000").rstrip("/")
    enable_docs: bool = _bool("ENABLE_API_DOCS", True)
    background_pipeline_v2_enabled: bool = _bool("BACKGROUND_PIPELINE_V2_ENABLED", True)
    load_legacy_model: bool = _bool("LOAD_LEGACY_MODEL", True)
    antivirus_command: str = os.getenv("ANTIVIRUS_COMMAND", "").strip()
    allow_vector_conversion: bool = _bool("ALLOW_VECTOR_CONVERSION", False)
    price_per_square_cm_dzd: float = _float("PRICE_PER_SQUARE_CM_DZD", 0.55)
    minimum_line_item_dzd: int = _int("MINIMUM_LINE_ITEM_DZD", 250)
    default_delivery_dzd: int = _int("DEFAULT_DELIVERY_DZD", 600)

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def upload_chunk_bytes(self) -> int:
        return self.upload_chunk_mb * 1024 * 1024

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    def validate_runtime_secrets(self) -> None:
        if not self.is_production:
            return
        weak = {
            "development-only-change-me",
            "development-admin-change-me",
            "change-me",
            "",
        }
        if self.signing_secret in weak or self.admin_token in weak:
            raise RuntimeError(
                "SIGNING_SECRET et ADMIN_TOKEN doivent être définis en production."
            )
        if self.background_provider not in {"local", "removebg"}:
            raise RuntimeError("BACKGROUND_PROVIDER doit valoir local ou removebg.")
        if self.background_provider == "removebg":
            if not self.removebg_api_key:
                raise RuntimeError("REMOVEBG_API_KEY doit être définie en production.")
            return
        if (
            len(self.model_sha256) != 64
            or any(character not in "0123456789abcdef" for character in self.model_sha256)
        ):
            raise RuntimeError(
                "BACKGROUND_MODEL_SHA256 doit être l’empreinte approuvée en production."
            )


settings = Settings()
