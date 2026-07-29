from __future__ import annotations

import gc
import os
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from app.models.schemas import RemovalMode
from app.providers.local_onnx_provider import LocalOnnxProvider


def _tile_starts(length: int, tile_size: int, overlap: int) -> list[int]:
    if length <= tile_size:
        return [0]
    step = tile_size - overlap
    starts = list(range(0, max(1, length - tile_size + 1), step))
    last = length - tile_size
    if starts[-1] != last:
        starts.append(last)
    return starts


def _blend_axis(length: int, overlap: int, soften_start: bool, soften_end: bool) -> np.ndarray:
    weights = np.ones(length, dtype=np.float32)
    ramp_size = min(overlap, length // 2)
    if ramp_size <= 0:
        return weights
    # The floor avoids zero-weight pixels while the cosine removes visible seams.
    phase = np.linspace(0.0, np.pi / 2.0, ramp_size, dtype=np.float32)
    ramp = np.maximum(0.02, np.sin(phase) ** 2)
    if soften_start:
        weights[:ramp_size] = ramp
    if soften_end:
        weights[-ramp_size:] = ramp[::-1]
    return weights


class TiledInferenceEngine:
    """Run the persistent ONNX provider on overlapping tiles.

    Accumulators are memory-mapped to the configured temporary directory so a
    120-megapixel file does not allocate several full-resolution float buffers
    in RAM during segmentation.
    """

    def __init__(
        self,
        provider: LocalOnnxProvider,
        *,
        tile_size: int,
        overlap: int,
        temp_dir: Path,
    ) -> None:
        if tile_size < 512:
            raise ValueError("INFERENCE_TILE_SIZE doit être supérieur ou égal à 512.")
        if overlap < 0 or overlap * 2 >= tile_size:
            raise ValueError("Le recouvrement des tuiles doit être positif et inférieur à la moitié de leur taille.")
        self.provider = provider
        self.tile_size = tile_size
        self.overlap = overlap
        self.temp_dir = temp_dir
        self.name = provider.name
        self.device = provider.device
        self.execution_provider = provider.execution_provider
        self._paths: list[Path] = []

    def _memmap(self, shape: tuple[int, int], suffix: str) -> np.memmap:
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        descriptor, raw_path = tempfile.mkstemp(
            prefix="printelly-mask-",
            suffix=suffix,
            dir=self.temp_dir,
        )
        os.close(descriptor)
        path = Path(raw_path)
        self._paths.append(path)
        return np.memmap(path, mode="w+", dtype=np.float32, shape=shape)

    def predict_mask(self, image: Image.Image, mode: RemovalMode) -> np.ndarray:
        width, height = image.size
        if width <= self.tile_size and height <= self.tile_size:
            return self.provider.predict_mask(image, mode)

        shape = (height, width)
        accumulated = self._memmap(shape, ".accum")
        weights = self._memmap(shape, ".weights")
        accumulated[:] = 0.0
        weights[:] = 0.0

        x_starts = _tile_starts(width, self.tile_size, self.overlap)
        y_starts = _tile_starts(height, self.tile_size, self.overlap)
        for y in y_starts:
            bottom = min(height, y + self.tile_size)
            for x in x_starts:
                right = min(width, x + self.tile_size)
                tile = image.crop((x, y, right, bottom))
                tile_mask = self.provider.predict_mask(tile, mode)
                expected = (bottom - y, right - x)
                if tile_mask.shape != expected:
                    raise RuntimeError(
                        f"Masque de tuile invalide: {tile_mask.shape}, attendu: {expected}."
                    )
                horizontal = _blend_axis(
                    expected[1],
                    self.overlap,
                    soften_start=x > 0,
                    soften_end=right < width,
                )
                vertical = _blend_axis(
                    expected[0],
                    self.overlap,
                    soften_start=y > 0,
                    soften_end=bottom < height,
                )
                blend = vertical[:, None] * horizontal[None, :]
                accumulated[y:bottom, x:right] += tile_mask.astype(np.float32) * blend
                weights[y:bottom, x:right] += blend
                tile.close()

        # Divide in bounded row bands. The returned memmap remains valid until
        # cleanup(), called immediately after the full pipeline has exported.
        band_height = max(32, min(512, 16_000_000 // max(1, width)))
        for top in range(0, height, band_height):
            bottom = min(height, top + band_height)
            denominator = np.maximum(weights[top:bottom], 1e-6)
            accumulated[top:bottom] = accumulated[top:bottom] / denominator
        accumulated.flush()
        del weights
        gc.collect()
        if len(self._paths) > 1:
            self._paths[1].unlink(missing_ok=True)
            self._paths.pop(1)
        return accumulated

    def cleanup(self) -> None:
        gc.collect()
        for path in self._paths:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
        self._paths.clear()
