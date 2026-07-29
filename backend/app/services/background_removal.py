from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np
from PIL import Image

from app.models.schemas import ProcessingReport, RemovalMode
from app.providers.base import BackgroundRemovalProvider
from app.services.image_export import export_png, preserve_source_alpha
from app.services.mask_refinement import (
    RefinementOptions,
    mask_warnings,
    refine_mask,
)


@dataclass
class BackgroundRemovalResult:
    png: bytes
    report: ProcessingReport


class BackgroundRemovalPipeline:
    def __init__(self, provider: BackgroundRemovalProvider) -> None:
        self.provider = provider

    def process(
        self,
        image: Image.Image,
        mode: RemovalMode,
        options: RefinementOptions,
        *,
        decontaminate: bool,
    ) -> BackgroundRemovalResult:
        started = time.perf_counter()
        raw_mask = self.provider.predict_mask(image, mode)
        expected_shape = (image.height, image.width)
        if raw_mask.shape != expected_shape:
            raise RuntimeError(
                f"Masque de taille {raw_mask.shape}, image de taille {expected_shape}."
            )
        alpha = refine_mask(raw_mask, image, mode, options)
        alpha = preserve_source_alpha(image, alpha)
        warnings = mask_warnings(alpha)
        png = export_png(image, alpha, decontaminate=decontaminate)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        report = ProcessingReport(
            width=image.width,
            height=image.height,
            foreground_ratio=float(np.mean(alpha > 0.5)),
            processing_ms=elapsed_ms,
            warnings=warnings,
        )
        return BackgroundRemovalResult(png=png, report=report)
