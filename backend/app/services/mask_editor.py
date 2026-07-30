from __future__ import annotations

import uuid
from io import BytesIO

import cv2
import numpy as np
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import Asset, MaskOperation, MaskVersion
from app.schemas.api import MaskOperationIn
from app.storage.local import storage


class MaskEditor:
    """Replayable alpha-only editor; RGB pixels are never regenerated."""

    @staticmethod
    def _brush(shape: tuple[int, int], operation: MaskOperationIn) -> np.ndarray:
        height, width = shape
        mask = np.zeros((height, width), dtype=np.float32)
        radius = max(1, round(operation.radius * min(width, height)))
        inner = max(0, round(radius * operation.hardness))
        for point in operation.points:
            center = (round(point.x * (width - 1)), round(point.y * (height - 1)))
            strength = float(operation.opacity * point.pressure)
            cv2.circle(mask, center, radius, strength, thickness=-1, lineType=cv2.LINE_AA)
            if inner and inner < radius:
                cv2.circle(mask, center, inner, strength, thickness=-1, lineType=cv2.LINE_AA)
        if operation.hardness < 0.999:
            sigma = max(0.5, radius * (1.0 - operation.hardness) * 0.45)
            mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=sigma, sigmaY=sigma)
        return np.clip(mask, 0.0, 1.0)

    @staticmethod
    def _polygon(shape: tuple[int, int], operation: MaskOperationIn) -> np.ndarray:
        height, width = shape
        mask = np.zeros((height, width), dtype=np.float32)
        points = np.asarray(
            [
                [round(point.x * (width - 1)), round(point.y * (height - 1))]
                for point in operation.points
            ],
            dtype=np.int32,
        )
        if len(points) >= 3:
            cv2.fillPoly(mask, [points], float(operation.opacity), lineType=cv2.LINE_AA)
        return mask

    @staticmethod
    def _connected_colour(
        rgb: np.ndarray,
        point_x: float,
        point_y: float,
        tolerance: float,
        allowed: np.ndarray | None = None,
    ) -> np.ndarray:
        height, width = rgb.shape[:2]
        x = min(width - 1, max(0, round(point_x * (width - 1))))
        y = min(height - 1, max(0, round(point_y * (height - 1))))
        lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
        reference = lab[y, x]
        distance = np.linalg.norm(lab - reference, axis=2)
        candidate = distance <= max(2.0, tolerance * 100.0)
        if allowed is not None:
            # The semantic alpha is a barrier: an exterior colour selection must
            # not cross into confidently preserved hair, text or dark details.
            candidate &= allowed.astype(bool)
            candidate[y, x] = True
        count, labels = cv2.connectedComponents(candidate.astype(np.uint8), connectivity=8)
        if count <= 1:
            return np.zeros((height, width), dtype=np.float32)
        label = labels[y, x]
        if label == 0:
            return np.zeros((height, width), dtype=np.float32)
        return (labels == label).astype(np.float32)

    @staticmethod
    def _refine(alpha: np.ndarray, operation: MaskOperationIn) -> np.ndarray:
        params = operation.parameters
        value = alpha.copy()
        contract = int(params.get("contract", 0))
        expand = int(params.get("expand", 0))
        smooth = float(params.get("smooth", 0))
        kernel = np.ones((3, 3), np.uint8)
        if contract > 0:
            value = cv2.erode(value, kernel, iterations=min(contract, 5))
        if expand > 0:
            value = cv2.dilate(value, kernel, iterations=min(expand, 5))
        if smooth > 0:
            value = cv2.GaussianBlur(value, (0, 0), sigmaX=min(smooth, 4))
        return np.clip(value, 0.0, 1.0)

    @staticmethod
    def _remove_residues(alpha: np.ndarray, operation: MaskOperationIn) -> np.ndarray:
        threshold = float(operation.parameters.get("alpha_threshold", 0.5))
        maximum_area = int(
            operation.parameters.get(
                "maximum_area",
                max(4, round(alpha.size * 0.00001)),
            )
        )
        binary = alpha >= threshold
        count, labels, stats, _ = cv2.connectedComponentsWithStats(
            binary.astype(np.uint8), connectivity=8
        )
        result = alpha.copy()
        for label in range(1, count):
            if int(stats[label, cv2.CC_STAT_AREA]) <= maximum_area:
                result[labels == label] = 0.0
        return result

    def apply(
        self,
        base_png: bytes,
        original_payload: bytes,
        operation: MaskOperationIn,
    ) -> bytes:
        with Image.open(BytesIO(base_png)) as base_source:
            base_source.load()
            base_image = base_source.convert("RGBA")
            base_rgba = np.asarray(base_image, dtype=np.uint8).copy()
        with Image.open(BytesIO(original_payload)) as original_source:
            original_source.load()
            original_image = original_source.convert("RGBA")
            if original_image.size != base_image.size:
                original_ratio = original_image.width / max(1, original_image.height)
                base_ratio = base_image.width / max(1, base_image.height)
                if abs(original_ratio - base_ratio) > 0.001:
                    raise ValueError(
                        "Le résultat et l’original n’ont pas les mêmes proportions."
                    )
                original_image = original_image.resize(
                    base_image.size,
                    Image.Resampling.LANCZOS,
                )
            original_rgba = np.asarray(original_image, dtype=np.uint8).copy()

        alpha = base_rgba[:, :, 3].astype(np.float32) / 255.0
        original_alpha = original_rgba[:, :, 3].astype(np.float32) / 255.0
        original_has_alpha = np.any(original_rgba[:, :, 3] < 255)
        restore_limit = original_alpha if original_has_alpha else np.ones_like(alpha)
        kind = operation.kind

        if kind in {"restore_brush", "erase_brush", "protect_brush"}:
            selection = self._brush(alpha.shape, operation)
        elif kind in {"lasso_restore", "lasso_erase", "lasso_protect"}:
            selection = self._polygon(alpha.shape, operation)
        elif kind in {"magic_exterior", "forgotten_background"}:
            point = operation.points[0]
            selection = self._connected_colour(
                original_rgba[:, :, :3],
                point.x,
                point.y,
                operation.tolerance,
                allowed=(alpha < 0.65) if kind == "magic_exterior" else None,
            )
        elif kind in {"background_point", "subject_point"}:
            selection = self._brush(alpha.shape, operation)
        elif kind == "edge_refine":
            alpha = self._refine(alpha, operation)
            selection = np.zeros_like(alpha)
        elif kind == "residue_cleanup":
            alpha = self._remove_residues(alpha, operation)
            selection = np.zeros_like(alpha)
        else:
            raise ValueError("Opération de masque non prise en charge.")

        if kind in {
            "restore_brush",
            "protect_brush",
            "lasso_restore",
            "lasso_protect",
            "subject_point",
        }:
            restored = alpha * (1.0 - selection) + restore_limit * selection
            alpha = np.maximum(alpha, restored)
            restore_pixels = selection > 0
            base_rgba[restore_pixels, :3] = original_rgba[restore_pixels, :3]
        elif kind in {
            "erase_brush",
            "lasso_erase",
            "magic_exterior",
            "forgotten_background",
            "background_point",
        }:
            alpha = alpha * (1.0 - selection)

        base_rgba[:, :, 3] = np.round(np.clip(alpha, 0.0, 1.0) * 255).astype(np.uint8)
        output = BytesIO()
        Image.fromarray(base_rgba, mode="RGBA").save(output, format="PNG", optimize=True)
        return output.getvalue()

    def persist_operation(
        self,
        database: Session,
        asset: Asset,
        operation: MaskOperationIn,
    ) -> MaskVersion:
        if not asset.current_mask_version_id or not asset.final_key:
            raise ValueError("Le design doit être traité avant toute correction manuelle.")
        base_version = database.get(MaskVersion, asset.current_mask_version_id)
        if base_version is None:
            raise ValueError("La version de masque courante est introuvable.")
        base_png = storage.get_bytes(base_version.storage_key)
        original_payload = storage.get_bytes(asset.original_key)
        result_png = self.apply(base_png, original_payload, operation)
        result_id = str(uuid.uuid4())
        result_key = f"assets/{asset.id}/masks/{result_id}.png"
        storage.put_bytes(result_key, result_png)

        sequence = database.scalar(
            select(func.count(MaskOperation.id)).where(MaskOperation.asset_id == asset.id)
        ) or 0
        base_version.is_current = False
        version = MaskVersion(
            id=result_id,
            asset_id=asset.id,
            parent_id=base_version.id,
            storage_key=result_key,
            source="manual",
            operation_count=base_version.operation_count + 1,
            is_current=True,
        )
        database.add(version)
        database.flush()
        database.add(
            MaskOperation(
                asset_id=asset.id,
                base_version_id=base_version.id,
                result_version_id=version.id,
                kind=operation.kind,
                payload=operation.model_dump(mode="json"),
                sequence=int(sequence) + 1,
            )
        )
        asset.current_mask_version_id = version.id
        asset.final_key = result_key
        asset.status = "edited"
        database.commit()
        database.refresh(version)
        return version


mask_editor = MaskEditor()
