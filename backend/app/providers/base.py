from __future__ import annotations

from typing import Protocol

import numpy as np
from PIL import Image

from app.models.schemas import RemovalMode


class BackgroundRemovalProvider(Protocol):
    name: str
    device: str

    def predict_mask(self, image: Image.Image, mode: RemovalMode) -> np.ndarray:
        """Return an HxW float32 foreground mask in the [0, 1] range."""
        ...
