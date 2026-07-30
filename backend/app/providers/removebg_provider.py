from __future__ import annotations

from io import BytesIO

import httpx
import numpy as np
from PIL import Image

from app.core.config import Settings
from app.models.schemas import RemovalMode


class RemoveBgProvider:
    """Paid remove.bg adapter that returns only the remote alpha mask.

    The RGB result returned by the provider is intentionally discarded so the
    local pipeline keeps the customer's original colors and dimensions.
    """

    name = "remove.bg"
    device = "remote"
    execution_provider = "remove.bg API"

    def __init__(
        self,
        config: Settings,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.config = config
        self._transport = transport

    def load(self) -> None:
        if not self.config.removebg_api_key:
            raise RuntimeError(
                "REMOVEBG_API_KEY est absent. Ajoutez la clé dans .env puis redémarrez le worker."
            )
        if self.config.removebg_api_url != "https://api.remove.bg/v1.0/removebg":
            raise RuntimeError(
                "REMOVEBG_API_URL doit utiliser l’endpoint HTTPS officiel remove.bg."
            )

    @staticmethod
    def _error_message(response: httpx.Response) -> str:
        if response.status_code == 402:
            return "Crédits remove.bg insuffisants."
        if response.status_code == 429:
            return "Limite remove.bg atteinte. Réessayez lorsque le quota est disponible."
        try:
            payload = response.json()
            errors = payload.get("errors", [])
            if errors:
                title = str(errors[0].get("title", "")).strip()
                if title:
                    return f"remove.bg: {title[:300]}"
        except Exception:
            pass
        return f"remove.bg a refusé le traitement (HTTP {response.status_code})."

    def predict_mask(self, image: Image.Image, mode: RemovalMode) -> np.ndarray:
        del mode  # remove.bg selects its own semantic profile.
        self.load()
        source = BytesIO()
        image.convert("RGBA").save(source, format="PNG", optimize=False)
        source.seek(0)
        try:
            with httpx.Client(
                timeout=httpx.Timeout(self.config.removebg_timeout_seconds),
                transport=self._transport,
                follow_redirects=False,
            ) as client:
                response = client.post(
                    self.config.removebg_api_url,
                    headers={"X-Api-Key": self.config.removebg_api_key},
                    files={"image_file": ("transferlab-source.png", source, "image/png")},
                    data={
                        "size": self.config.removebg_size,
                        "format": "png",
                    },
                )
        except httpx.TimeoutException as exc:
            raise RuntimeError("remove.bg n’a pas répondu avant le délai configuré.") from exc
        except httpx.HTTPError as exc:
            raise RuntimeError("Connexion sécurisée à remove.bg impossible.") from exc

        if not response.is_success:
            raise RuntimeError(self._error_message(response))
        content_type = response.headers.get("content-type", "").lower()
        if "image/" not in content_type:
            raise RuntimeError("remove.bg n’a pas retourné une image.")
        try:
            with Image.open(BytesIO(response.content)) as result:
                result.load()
                if "A" not in result.getbands():
                    raise RuntimeError("La réponse remove.bg ne contient pas de canal alpha.")
                alpha = result.getchannel("A")
                if alpha.size != image.size:
                    alpha = alpha.resize(image.size, Image.Resampling.LANCZOS)
                mask = np.asarray(alpha, dtype=np.float32) / 255.0
        except RuntimeError:
            raise
        except Exception as exc:
            raise RuntimeError("La réponse image remove.bg est invalide.") from exc
        return np.clip(mask, 0.0, 1.0).astype(np.float32, copy=False)
