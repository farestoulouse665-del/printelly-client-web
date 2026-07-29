from __future__ import annotations

import hashlib
import time
from collections import defaultdict, deque
from pathlib import Path
from threading import Lock

from fastapi import HTTPException, Request, status


class LocalRateLimiter:
    """A small in-memory limiter for one-process/self-hosted deployments."""

    def __init__(
        self,
        requests_per_minute: int,
        *,
        trust_proxy_headers: bool = False,
    ) -> None:
        self.limit = max(1, requests_per_minute)
        self.trust_proxy_headers = trust_proxy_headers
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, request: Request) -> None:
        forwarded = (
            request.headers.get("x-forwarded-for", "")
            if self.trust_proxy_headers
            else ""
        )
        client_ip = forwarded.split(",", 1)[0].strip() if forwarded else ""
        if not client_ip and request.client:
            client_ip = request.client.host
        key = client_ip or "unknown"
        now = time.monotonic()
        with self._lock:
            bucket = self._requests[key]
            while bucket and now - bucket[0] >= 60:
                bucket.popleft()
            if len(bucket) >= self.limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Trop de traitements. Réessayez dans une minute.",
                    headers={"Retry-After": "60"},
                )
            bucket.append(now)


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_model_checksum(path: Path, expected: str) -> None:
    if not expected:
        return
    actual = sha256_file(path)
    if actual.lower() != expected.lower():
        raise RuntimeError(
            "Le SHA-256 du modèle ne correspond pas à BACKGROUND_MODEL_SHA256. "
            f"Attendu {expected}, obtenu {actual}."
        )
