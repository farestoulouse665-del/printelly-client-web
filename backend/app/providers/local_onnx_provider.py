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

    def predict_mask(self, image: Image.Image, mode: RemovalMode) -> np.ndarray:
        if self.session is None:
            raise RuntimeError("Le modèle ONNX n'est pas chargé.")

        rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
        resized = cv2.resize(
            rgb,
            (self.input_width, self.input_height),
            interpolation=cv2.INTER_AREA,
        ) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        tensor = ((resized - mean) / std).transpose(2, 0, 1)[None, ...]

        outputs = self.session.run(None, {self.input_name: tensor})
        mask = self._select_mask(outputs)
        if float(mask.min()) < 0.0 or float(mask.max()) > 1.0:
            mask = 1.0 / (1.0 + np.exp(-np.clip(mask, -30, 30)))
        mask = np.clip(mask, 0.0, 1.0)
        mask = cv2.resize(
            mask,
            image.size,
            interpolation=cv2.INTER_LANCZOS4,
        )

        # Design mode is deliberately conservative: uncertain subject pixels survive.
        gamma = {
            RemovalMode.auto: 1.0,
            RemovalMode.person: 0.95,
            RemovalMode.design: 0.78,
            RemovalMode.product: 0.92,
        }[mode]
        return np.power(np.clip(mask, 0.0, 1.0), gamma).astype(np.float32)
