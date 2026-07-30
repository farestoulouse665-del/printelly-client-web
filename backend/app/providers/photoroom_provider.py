from __future__ import annotations

from io import BytesIO

import httpx
import numpy as np
from PIL import Image

from app.core.config import Settings
from app.models.schemas import RemovalMode


class PhotoroomProvider:
    """PhotoRoom API adapter that keeps only the returned alpha matte."""

    name = "PhotoRoom"
    device = "remote"
    execution_provider = "PhotoRoom API"

    def __init__(
        self,
        config: Settings,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.config = config
        self._transport = transport

    def load(self) -> None:
        if not self.config.photoroom_api_key:
            raise RuntimeError(
                "PHOTOROOM_API_KEY est absente. Ajoutez la clé dans .env puis redémarrez le worker."
            )
        if self.config.photoroom_api_url != "https://sdk.photoroom.com/v1/segment":
            raise RuntimeError(
                "PHOTOROOM_API_URL doit utiliser l’endpoint HTTPS officiel PhotoRoom."
            )

    @staticmethod
    def _error_message(response: httpx.Response) -> str:
        if response.status_code in {401, 403}:
            return "Clé API PhotoRoom invalide ou non autorisée."
        if response.status_code == 402:
            return "Crédits PhotoRoom insuffisants."
        if response.status_code == 429:
            return "Limite PhotoRoom atteinte. Réessayez lorsque le quota est disponible."
        try:
            payload = response.json()
            detail = payload.get("message") or payload.get("error")
            if detail:
                return f"PhotoRoom: {str(detail)[:300]}"
        except Exception:
            pass
        return f"PhotoRoom a refusé le traitement (HTTP {response.status_code})."

    def predict_mask(self, image: Image.Image, mode: RemovalMode) -> np.ndarray:
        del mode
        self.load()
        source = BytesIO()
        image.convert("RGBA").save(source, format="PNG", optimize=False)
        try:
            with httpx.Client(
                timeout=httpx.Timeout(self.config.photoroom_timeout_seconds),
                transport=self._transport,
                follow_redirects=False,
            ) as client:
                response = client.post(
                    self.config.photoroom_api_url,
                    headers={
                        "x-api-key": self.config.photoroom_api_key,
                        "accept": "image/png",
                    },
                    files={
                        "image_file": (
                            "transferlab-source.png",
                            source.getvalue(),
                            "image/png",
                        )
                    },
                    data={"format": "png"},
                )
        except httpx.TimeoutException as exc:
            raise RuntimeError("PhotoRoom n’a pas répondu avant le délai configuré.") from exc
        except httpx.HTTPError as exc:
            raise RuntimeError("Connexion sécurisée à PhotoRoom impossible.") from exc

        if not response.is_success:
            raise RuntimeError(self._error_message(response))
        if "image/" not in response.headers.get("content-type", "").lower():
            raise RuntimeError("PhotoRoom n’a pas retourné une image.")
        try:
            with Image.open(BytesIO(response.content)) as result:
                result.load()
                if "A" not in result.getbands():
                    raise RuntimeError("La réponse PhotoRoom ne contient pas de canal alpha.")
                alpha = result.getchannel("A")
                if alpha.size != image.size:
                    alpha = alpha.resize(image.size, Image.Resampling.LANCZOS)
                mask = np.asarray(alpha, dtype=np.float32) / 255.0
        except RuntimeError:
            raise
        except Exception as exc:
            raise RuntimeError("La réponse image PhotoRoom est invalide.") from exc
        return np.clip(mask, 0.0, 1.0).astype(np.float32, copy=False)
