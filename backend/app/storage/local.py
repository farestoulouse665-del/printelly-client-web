from __future__ import annotations

import hashlib
import hmac
import os
import re
import time
from pathlib import Path
from urllib.parse import quote

from app.core.config import settings


_SAFE_COMPONENT = re.compile(r"[^a-zA-Z0-9._-]+")


def sanitize_filename(value: str, fallback: str = "design") -> str:
    cleaned = Path(value or fallback).name
    cleaned = _SAFE_COMPONENT.sub("-", cleaned).strip("._-")
    return (cleaned[:120] or fallback).lower()


class LocalObjectStorage:
    """Filesystem object store that never exposes physical paths to clients."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or settings.storage_root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        normalized = key.replace("\\", "/").lstrip("/")
        candidate = (self.root / normalized).resolve()
        if candidate != self.root and self.root not in candidate.parents:
            raise ValueError("Clé de stockage invalide.")
        return candidate

    def put_bytes(self, key: str, payload: bytes) -> None:
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + ".partial")
        with temporary.open("wb") as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(target)

    def append_bytes(self, key: str, payload: bytes) -> int:
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("ab") as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        return target.stat().st_size

    def get_bytes(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def size(self, key: str) -> int:
        return self._path(key).stat().st_size

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def delete_prefix(self, prefix: str) -> None:
        root = self._path(prefix)
        if not root.exists() or root == self.root:
            return
        paths = sorted(root.rglob("*"), key=lambda item: len(item.parts), reverse=True)
        for path in paths:
            if path.is_file() or path.is_symlink():
                path.unlink(missing_ok=True)
            elif path.is_dir():
                path.rmdir()
        if root.is_dir():
            root.rmdir()

    def sha256(self, key: str) -> str:
        digest = hashlib.sha256()
        with self._path(key).open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def signed_download_path(self, key: str, ttl_seconds: int | None = None) -> str:
        expires = int(time.time()) + (ttl_seconds or settings.signed_url_ttl_seconds)
        encoded = quote(key, safe="")
        message = f"{key}:{expires}".encode()
        signature = hmac.new(settings.signing_secret.encode(), message, hashlib.sha256).hexdigest()
        return f"/api/v1/files/{encoded}?expires={expires}&signature={signature}"

    @staticmethod
    def verify_signature(key: str, expires: int, signature: str) -> bool:
        if expires < int(time.time()):
            return False
        message = f"{key}:{expires}".encode()
        expected = hmac.new(
            settings.signing_secret.encode(), message, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)


storage = LocalObjectStorage()
