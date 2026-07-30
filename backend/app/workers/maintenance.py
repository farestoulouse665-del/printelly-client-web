from __future__ import annotations

import argparse
import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.entities import Asset, GuestSession, UploadSession
from app.storage.local import storage


logger = logging.getLogger("transferlab.maintenance")


def cleanup_expired_data() -> dict[str, int]:
    """Purge expired uploads, deleted assets and old guest-owned objects."""
    now = datetime.now(timezone.utc)
    deletion_cutoff = now - timedelta(hours=settings.deletion_grace_hours)
    purged_uploads = 0
    purged_assets = 0

    with SessionLocal() as database:
        expired_uploads = list(
            database.scalars(
                select(UploadSession).where(
                    UploadSession.expires_at < now,
                    UploadSession.status != "completed",
                )
            )
        )
        for upload in expired_uploads:
            if upload.storage_key and upload.storage_key != "pending":
                storage.delete(upload.storage_key)
            upload.status = "expired"
            purged_uploads += 1

        expired_guest_ids = select(GuestSession.id).where(
            GuestSession.user_id.is_(None),
            GuestSession.expires_at < now,
        )
        assets = list(
            database.scalars(
                select(Asset).where(
                    Asset.status != "purged",
                    or_(
                        Asset.deleted_at < deletion_cutoff,
                        Asset.guest_session_id.in_(expired_guest_ids),
                    ),
                )
            )
        )
        for asset in assets:
            storage.delete_prefix(f"assets/{asset.id}")
            asset.original_key = "purged"
            asset.source_key = None
            asset.preview_key = None
            asset.final_key = None
            asset.current_mask_version_id = None
            asset.status = "purged"
            if asset.deleted_at is None:
                asset.deleted_at = now
            purged_assets += 1
        database.commit()

    settings.temp_dir.mkdir(parents=True, exist_ok=True)
    temp_cutoff = time.time() - settings.temp_ttl_seconds
    for pattern in ("*.upload", "*.partial", "transferlab-mask-*"):
        for path in settings.temp_dir.glob(pattern):
            try:
                if path.is_file() and path.stat().st_mtime < temp_cutoff:
                    path.unlink(missing_ok=True)
            except OSError:
                logger.warning("Temporary file cleanup failed path=%s", path)

    result = {"uploads": purged_uploads, "assets": purged_assets}
    logger.info("Maintenance cleanup completed %s", result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Purge sécurisée des fichiers TransferLab.")
    parser.add_argument("--loop", action="store_true", help="Exécuter périodiquement.")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    if not args.loop:
        cleanup_expired_data()
        return
    while True:
        try:
            cleanup_expired_data()
        except Exception:
            logger.exception("Maintenance cycle failed.")
        time.sleep(max(60, settings.maintenance_interval_seconds))


if __name__ == "__main__":
    main()
