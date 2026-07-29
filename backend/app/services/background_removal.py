from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np
from PIL import Image

from app.models.schemas import BlackBackgroundMode, ProcessingReport, RemovalMode
from app.providers.base import BackgroundRemovalProvider
from app.services.background_analysis import BackgroundAnalyzer
from app.services.image_export import (
    export_png,
    preserve_source_alpha,
    source_alpha_is_authoritative,
    source_alpha_mask,
)
from app.services.mode_detection import choose_effective_mode
from app.services.mask_refinement import (
    RefinementOptions,
    mask_warnings,
    refine_mask,
    residual_haze_ratio,
)


@dataclass
class BackgroundRemovalResult:
    png: bytes
    report: ProcessingReport


class BackgroundRemovalPipeline:
    def __init__(
        self,
        provider: BackgroundRemovalProvider,
        *,
        background_pipeline_v2_enabled: bool = False,
    ) -> None:
        self.provider = provider
        self.background_analyzer = (
            BackgroundAnalyzer() if background_pipeline_v2_enabled else None
        )
        self.pipeline_version = (
            "background-v2" if background_pipeline_v2_enabled else "background-v1"
        )

    def process(
        self,
        image: Image.Image,
        mode: RemovalMode,
        options: RefinementOptions,
        *,
        decontaminate: bool,
    ) -> BackgroundRemovalResult:
        started = time.perf_counter()
        source_alpha_preserved = source_alpha_is_authoritative(image)
        diagnostics: dict[str, float] = {}
        effective_mode = (
            mode if source_alpha_preserved else choose_effective_mode(image, mode)
        )
        if source_alpha_preserved:
            # A real alpha channel is more reliable than re-segmenting an already cut-out PNG.
            alpha = source_alpha_mask(image)
            haze_ratio = 0.0
            warnings: list[str] = []
        else:
            raw_mask = self.provider.predict_mask(image, effective_mode)
            expected_shape = (image.height, image.width)
            if raw_mask.shape != expected_shape:
                raise RuntimeError(
                    f"Masque de taille {raw_mask.shape}, image de taille {expected_shape}."
                )
            alpha = refine_mask(
                raw_mask,
                image,
                effective_mode,
                options,
                diagnostics,
                background_analyzer=self.background_analyzer,
            )
            alpha = preserve_source_alpha(image, alpha)
            haze_ratio = residual_haze_ratio(image, alpha)
            warnings = mask_warnings(alpha, image)
            black_confidence = diagnostics.get("black_background_confidence", 0.0)
            if (
                options.black_background_mode is not BlackBackgroundMode.off
                and black_confidence < 0.35
            ):
                warnings.append(
                    "Le bord de l’image n’est pas majoritairement noir; vérifiez le résultat."
                )
        png = export_png(
            image,
            alpha,
            # Never rewrite RGB values when the source already contains a trusted cut-out.
            decontaminate=decontaminate and not source_alpha_preserved,
            recover_spill=(
                effective_mode is RemovalMode.design
                and options.remove_haze
                and not source_alpha_preserved
            ),
        )
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        report = ProcessingReport(
            width=image.width,
            height=image.height,
            foreground_ratio=float(np.mean(alpha > 0.5)),
            residual_haze_ratio=haze_ratio,
            processing_ms=elapsed_ms,
            warnings=warnings,
            source_alpha_preserved=source_alpha_preserved,
            effective_mode=effective_mode,
            black_background_mode=options.black_background_mode,
            black_background_confidence=diagnostics.get(
                "black_background_confidence",
                0.0,
            ),
        )
        return BackgroundRemovalResult(png=png, report=report)
