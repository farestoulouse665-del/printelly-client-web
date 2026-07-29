from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

from app.core.config import Settings
from app.core.security import verify_model_checksum
from app.models.schemas import RemovalMode


class LocalOnnxProvider:
    """Provider-independent ONNX foreground segmentation adapter."""

    _MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    _STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    def __init__(self, config: Settings) -> None:
        self.config = config
        self.name = config.model_name
        self.device = config.device
        self.session: ort.InferenceSession | None = None
        self.input_name = ""
        self.input_height = config.model_input_size
        self.input_width = config.model_input_size

    def load(self) -> None:
        path = Path(self.config.model_path)
        if not path.is_file():
            raise FileNotFoundError(
                f"Modèle ONNX absent: {path}. Consultez backend/scripts/install_model.py."
            )
        verify_model_checksum(path, self.config.model_sha256)

        available = ort.get_available_providers()
        requested = self.config.device
        if requested == "cuda":
            if "CUDAExecutionProvider" not in available:
                raise RuntimeError(
                    "BACKGROUND_DEVICE=cuda demandé, mais CUDAExecutionProvider est indisponible."
                )
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        elif requested == "cpu":
            providers = ["CPUExecutionProvider"]
        else:
            raise ValueError("BACKGROUND_DEVICE doit valoir 'cpu' ou 'cuda'.")

        options = ort.SessionOptions()
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        if self.config.onnx_intra_op_threads > 0:
            options.intra_op_num_threads = self.config.onnx_intra_op_threads

        self.session = ort.InferenceSession(
            str(path),
            sess_options=options,
            providers=providers,
        )
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
            raise RuntimeError("Le modèle ONNX n'a retourné aucun masque exploitable.")
        # BiRefNet exports the final high-resolution prediction as output 0.
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
        scale = min(
            self.input_width / source_width,
            self.input_height / source_height,
        )
        resized_width = max(1, min(self.input_width, round(source_width * scale)))
        resized_height = max(1, min(self.input_height, round(source_height * scale)))
        interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
        resized = cv2.resize(
            rgb,
            (resized_width, resized_height),
            interpolation=interpolation,
        )

        # Mean-colour padding becomes zero after ImageNet normalisation.
        canvas = np.empty(
            (self.input_height, self.input_width, 3),
            dtype=np.float32,
        )
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
            raise RuntimeError("Le modèle ONNX n'est pas chargé.")

        rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
        prepared, letterbox = self._prepare_input(rgb)
        normalised = prepared / 255.0
        tensor = ((normalised - self._MEAN) / self._STD).transpose(2, 0, 1)[None, ...]

        outputs = self.session.run(None, {self.input_name: tensor})
        mask = self._select_mask(outputs)
        if float(mask.min()) < 0.0 or float(mask.max()) > 1.0:
            mask = 1.0 / (1.0 + np.exp(-np.clip(mask, -30, 30)))
        mask = self._restore_mask(np.clip(mask, 0.0, 1.0), letterbox, image.size)

        # Design mode is deliberately conservative: uncertain subject pixels survive.
        gamma = {
            RemovalMode.auto: 1.0,
            RemovalMode.person: 0.95,
            RemovalMode.design: 0.78,
            RemovalMode.product: 0.92,
        }[mode]
        return np.power(np.clip(mask, 0.0, 1.0), gamma).astype(np.float32)
