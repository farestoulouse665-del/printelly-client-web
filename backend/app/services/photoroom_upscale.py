from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

import httpx
import numpy as np
from PIL import Image

from app.core.config import Settings


_ALLOWED_MODES = {"ai.fast": 1000, "ai.slow": 512}
_TRANSIENT_STATUS_CODES = {500, 502, 503, 504}


class PhotoRoomUpscaleError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.retryable = retryable


@dataclass(frozen=True)
class PhotoRoomUpscaleResult:
    png: bytes
    mode: str
    input_width: int
    input_height: int
    output_width: int
    output_height: int
    scale_factor: float
    alpha_preserved_locally: bool = True


class PhotoRoomUpscaleService:
    """PhotoRoom Image Editing v2 adapter with local alpha preservation."""

    def __init__(
        self,
        config: Settings,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.config = config
        self._transport = transport

    def load(self) -> None:
        if not self.config.photoroom_upscale_enabled:
            raise PhotoRoomUpscaleError(
                "L’amélioration PhotoRoom est désactivée sur ce serveur."
            )
        if not self.config.photoroom_api_key:
            raise PhotoRoomUpscaleError(
                "PHOTOROOM_API_KEY est absente. Ajoutez la clé Live puis redémarrez le worker."
            )
        if self.config.photoroom_edit_api_url != "https://image-api.photoroom.com/v2/edit":
            raise PhotoRoomUpscaleError(
                "PHOTOROOM_EDIT_API_URL doit utiliser l’endpoint HTTPS officiel PhotoRoom."
            )

    @staticmethod
    def maximum_dimension(mode: str) -> int:
        try:
            return _ALLOWED_MODES[mode]
        except KeyError as exc:
            raise PhotoRoomUpscaleError(
                "Mode d’amélioration PhotoRoom invalide. Utilisez ai.fast ou ai.slow."
            ) from exc

    @staticmethod
    def _error_message(response: httpx.Response) -> str:
        status = response.status_code
        if status == 400:
            return "PhotoRoom a refusé les paramètres d’amélioration de l’image."
        if status == 401:
            return "Clé API PhotoRoom invalide."
        if status == 402:
            return "Crédits PhotoRoom insuffisants. Aucun upscale n’a été lancé."
        if status == 403:
            return "Votre clé PhotoRoom ne possède pas l’accès à Image Editing API Plus."
        if status == 413:
            return "L’image est trop volumineuse pour l’upscale PhotoRoom."
        if status == 429:
            return "Limite PhotoRoom atteinte. Réessayez lorsque le quota est disponible."
        if status in _TRANSIENT_STATUS_CODES:
            return "PhotoRoom Image Editing est temporairement indisponible."
        try:
            payload = response.json()
            detail = payload.get("message") or payload.get("error")
            if detail:
                return f"PhotoRoom: {str(detail)[:300]}"
        except Exception:
            pass
        return f"PhotoRoom a refusé l’upscale (HTTP {status})."

    def _request(self, payload: bytes, mode: str) -> httpx.Response:
        last_response: httpx.Response | None = None
        try:
            with httpx.Client(
                timeout=httpx.Timeout(self.config.photoroom_edit_timeout_seconds),
                transport=self._transport,
                follow_redirects=False,
            ) as client:
                for attempt in range(2):
                    response = client.post(
                        self.config.photoroom_edit_api_url,
                        headers={
                            "x-api-key": self.config.photoroom_api_key,
                            "accept": "image/png",
                        },
                        files={
                            "imageFile": (
                                "transferlab-cutout.png",
                                payload,
                                "image/png",
                            )
                        },
                        data={
                            "removeBackground": "false",
                            "upscale.mode": mode,
                            "export.format": "png",
                        },
                    )
                    last_response = response
                    if response.status_code not in _TRANSIENT_STATUS_CODES or attempt == 1:
                        return response
        except httpx.TimeoutException as exc:
            raise PhotoRoomUpscaleError(
                "PhotoRoom n’a pas répondu avant le délai configuré. Aucun nouvel essai automatique n’a été effectué."
            ) from exc
        except httpx.HTTPError as exc:
            raise PhotoRoomUpscaleError(
                "Connexion sécurisée à PhotoRoom Image Editing impossible."
            ) from exc
        if last_response is None:
            raise PhotoRoomUpscaleError("PhotoRoom n’a retourné aucune réponse.")
        return last_response

    def upscale(self, cutout_png: bytes, mode: str) -> PhotoRoomUpscaleResult:
        self.load()
        limit = self.maximum_dimension(mode)
        try:
            with Image.open(BytesIO(cutout_png)) as opened:
                opened.load()
                source = opened.convert("RGBA")
        except Exception as exc:
            raise PhotoRoomUpscaleError(
                "Le PNG transparent à améliorer est invalide."
            ) from exc

        input_width, input_height = source.size
        if input_width > limit or input_height > limit:
            raise PhotoRoomUpscaleError(
                f"Le mode {mode} accepte au maximum {limit} × {limit} pixels. "
                f"Votre fichier mesure {input_width} × {input_height} pixels."
            )
        expected_size = (input_width * 4, input_height * 4)
        response = self._request(cutout_png, mode)
        if not response.is_success:
            raise PhotoRoomUpscaleError(
                self._error_message(response),
                status_code=response.status_code,
                retryable=response.status_code in _TRANSIENT_STATUS_CODES,
            )
        if not response.content:
            raise PhotoRoomUpscaleError("PhotoRoom a retourné une réponse vide.")
        if "image/" not in response.headers.get("content-type", "").lower():
            raise PhotoRoomUpscaleError("PhotoRoom n’a pas retourné une image d’upscale.")

        try:
            with Image.open(BytesIO(response.content)) as opened_result:
                opened_result.load()
                if "A" not in opened_result.getbands():
                    raise PhotoRoomUpscaleError(
                        "La réponse PhotoRoom Upscale ne contient pas de canal alpha."
                    )
                remote = opened_result.convert("RGBA")
        except PhotoRoomUpscaleError:
            raise
        except Exception as exc:
            raise PhotoRoomUpscaleError(
                "La réponse image PhotoRoom Upscale est invalide."
            ) from exc

        if remote.size != expected_size:
            raise PhotoRoomUpscaleError(
                "PhotoRoom n’a pas produit les dimensions ×4 attendues : "
                f"{remote.width} × {remote.height} au lieu de "
                f"{expected_size[0]} × {expected_size[1]}."
            )

        # PhotoRoom supplies the enhanced RGB. The locally refined cutout alpha
        # remains authoritative so the upscale cannot restore the old background.
        alpha = source.getchannel("A").resize(expected_size, Image.Resampling.LANCZOS)
        rgb = np.asarray(remote.convert("RGB"), dtype=np.uint8).copy()
        alpha_array = np.asarray(alpha, dtype=np.uint8)
        rgb[alpha_array == 0] = 0
        composed = Image.fromarray(rgb, mode="RGB").convert("RGBA")
        composed.putalpha(alpha)
        output = BytesIO()
        composed.save(output, format="PNG", optimize=False)

        return PhotoRoomUpscaleResult(
            png=output.getvalue(),
            mode=mode,
            input_width=input_width,
            input_height=input_height,
            output_width=expected_size[0],
            output_height=expected_size[1],
            scale_factor=4.0,
        )
