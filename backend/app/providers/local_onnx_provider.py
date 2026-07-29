from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

from app.core.config import Settings
from app.core.security import verify_model_checksum
from app.models.schemas import RemovalMode


_PROVIDER_PRIORITY: tuple[tuple[str, str], ...] = (
    ("CUDAExecutionProvider", "cuda"),
    ("DmlExecutionProvider", "directml"),
    ("CPUExecutionProvider", "cpu"),
)


class LocalOnnxProvider:
    """Persistent BiRefNet ONNX adapter with deterministic provider selection."""

    _MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    _STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    def __init__(self, config: Settings) -> None:
        self.config = config
        self.name = config.model_name
        self.device = config.device
        self.execution_provider = ""
        self.session: ort.InferenceSession | None = None
        self.input_name = ""
        self.input_height = config.model_input_size
        self.input_width = config.model_input_size

    @staticmethod
    def choose_providers(requested: str, available: list[str]) -> tuple[list[str], str]:
        requested = requested.strip().lower()
        aliases = {
            "cuda": "CUDAExecutionProvider",
            "directml": "DmlExecutionProvider",
            "dml": "DmlExecutionProvider",
            "cpu": "CPUExecutionProvider",
        }
        if requested == "auto":
            selected = [name for name, _ in _PROVIDER_PRIORITY if name in available]
            if not selected:
                raise RuntimeError("Aucun fournisseur ONNX Runtime compatible n’est disponible.")
            primary = selected[0]
            device = next(device for name, device in _PROVIDER_PRIORITY if name == primary)
            if primary != "CPUExecutionProvider" and "CPUExecutionProvider" in available:
                selected.append("CPUExecutionProvider")
            return list(dict.fromkeys(selected)), device

        provider = aliases.get(requested)
        if provider is None:
            raise ValueError("BACKGROUND_DEVICE doit valoir auto, cuda, directml ou cpu.")
        if provider not in available:
            raise RuntimeError(
                f"BACKGROUND_DEVICE={requested} demandé, mais {provider} est indisponible. "
                f"Fournisseurs détectés: {', '.join(available) or 'aucun'}."
            )
        selected = [provider]
        if provider != "CPUExecutionProvider" and "CPUExecutionProvider" in available:
            selected.append("CPUExecutionProvider")
        normalized = "directml" if requested == "dml" else requested
        return selected, normalized

    def load(self) -> None:
        path = Path(self.config.model_path)
        if not path.is_file():
            raise FileNotFoundError(
                f"Modèle ONNX absent: {path}. Consultez backend/scripts/install_model.py."
            )
        verify_model_checksum(path, self.config.model_sha256)

        available = ort.get_available_providers()
        providers, selected_device = self.choose_providers(self.config.device, available)

        options = ort.SessionOptions()
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        directml_selected = providers[0] == "DmlExecutionProvider"
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.enable_mem_pattern = not directml_selected
        options.enable_cpu_mem_arena = True
        if self.config.onnx_intra_op_threads > 0:
            options.intra_op_num_threads = self.config.onnx_intra_op_threads

        self.session = ort.InferenceSession(
            str(path),
            sess_options=options,
            providers=providers,
        )
        self.device = selected_device
        self.execution_provider = self.session.get_providers()[0]
        model_input = self.session.get_inputs()[0]
        self.input_name = model_input.name
        shape = model_input.shape
        if len(shape) == 4:
            if isinstance(shape[2], int) and shape[2] > 0:
                self.input_height = shape[2]
            if isinstance(shape[3], int) and shape[3] > 0:
                self.input_width = shape[3]

    @staticmethod
    def _select_mask(outputs: list[np.ndarray]) -> np.ndarray:
        candidates: list[np.ndarray] = []
        for output in outputs:
            array = np.asarray(output)
            if array.ndim >= 2:
                candidates.append(array)
        if not candidates:
            raise RuntimeError("Le modèle ONNX n’a retourné aucun masque exploitable.")
        mask = candidates[0]
        while mask.ndim > 2:
            mask = mask[0]
        return mask.astype(np.float32)

    def _prepare_input(
        self,
        rgb: np.ndarray,
    ) -> tuple[np.ndarray, tuple[int, int, int, int]]:
        """Letterbox the image without changing the subject proportions."""
        source_height, source_width = rgb.shape[:2]
        scale = min(self.input_width / source_width, self.input_height / source_height)
        resized_width = max(1, min(self.input_width, round(source_width * scale)))
        resized_height = max(1, min(self.input_height, round(source_height * scale)))
        interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
        resized = cv2.resize(rgb, (resized_width, resized_height), interpolation=interpolation)

        canvas = np.empty((self.input_height, self.input_width, 3), dtype=np.float32)
        canvas[:] = self._MEAN * 255.0
        left = (self.input_width - resized_width) // 2
        top = (self.input_height - resized_height) // 2
        canvas[top : top + resized_height, left : left + resized_width] = resized
        return canvas, (left, top, resized_width, resized_height)

    def _restore_mask(
        self,
        mask: np.ndarray,
        letterbox: tuple[int, int, int, int],
        output_size: tuple[int, int],
    ) -> np.ndarray:
        left, top, resized_width, resized_height = letterbox
        mask_height, mask_width = mask.shape
        x_scale = mask_width / self.input_width
        y_scale = mask_height / self.input_height
        x0 = max(0, min(mask_width - 1, round(left * x_scale)))
        y0 = max(0, min(mask_height - 1, round(top * y_scale)))
        x1 = max(x0 + 1, min(mask_width, round((left + resized_width) * x_scale)))
        y1 = max(y0 + 1, min(mask_height, round((top + resized_height) * y_scale)))
        cropped = mask[y0:y1, x0:x1]
        return cv2.resize(cropped, output_size, interpolation=cv2.INTER_LANCZOS4)

    def predict_mask(self, image: Image.Image, mode: RemovalMode) -> np.ndarray:
        if self.session is None:
            raise RuntimeError("Le modèle ONNX n’est pas chargé.")

        rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
        prepared, letterbox = self._prepare_input(rgb)
        normalised = prepared / 255.0
        tensor = ((normalised - self._MEAN) / self._STD).transpose(2, 0, 1)[None, ...]

        outputs = self.session.run(None, {self.input_name: tensor})
        mask = self._select_mask(outputs)
        if float(mask.min()) < 0.0 or float(mask.max()) > 1.0:
            mask = 1.0 / (1.0 + np.exp(-np.clip(mask, -30, 30)))
        mask = self._restore_mask(np.clip(mask, 0.0, 1.0), letterbox, image.size)

        gamma = {
            RemovalMode.auto: 1.0,
            RemovalMode.person: 0.95,
            RemovalMode.design: 0.78,
            RemovalMode.product: 0.92,
        }[mode]
        return np.power(np.clip(mask, 0.0, 1.0), gamma).astype(np.float32)
