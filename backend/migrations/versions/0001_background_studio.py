"""Initial TransferLab schema.

Revision ID: 0001_background_studio
Revises:
Create Date: 2026-07-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0001_background_studio"
down_revision = None
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(255)),
        sa.Column("locale", sa.String(8), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False),
        *_timestamps(),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "guest_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("secret_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_guest_sessions_expires_at", "guest_sessions", ["expires_at"])

    op.create_table(
        "assets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("guest_session_id", sa.String(36), sa.ForeignKey("guest_sessions.id")),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("dpi_x", sa.Float()),
        sa.Column("dpi_y", sa.Float()),
        sa.Column("color_profile", sa.String(80), nullable=False),
        sa.Column("has_transparency", sa.Boolean(), nullable=False),
        sa.Column("original_key", sa.String(512), nullable=False),
        sa.Column("source_key", sa.String(512)),
        sa.Column("preview_key", sa.String(512)),
        sa.Column("final_key", sa.String(512)),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("quality_score", sa.Integer()),
        sa.Column("warnings", sa.JSON(), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("current_mask_version_id", sa.String(36)),
        sa.Column("pipeline_version", sa.String(80)),
        sa.Column("model_version", sa.String(120)),
        *_timestamps(),
    )
    op.create_index("ix_assets_guest_session_id", "assets", ["guest_session_id"])
    op.create_index("ix_assets_user_id", "assets", ["user_id"])
    op.create_index("ix_assets_checksum_sha256", "assets", ["checksum_sha256"])
    op.create_index("ix_assets_status", "assets", ["status"])
    op.create_index("ix_assets_owner_created", "assets", ["guest_session_id", "created_at"])
    op.create_index("ix_assets_active", "assets", ["deleted_at", "archived"])

    op.create_table(
        "upload_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("guest_session_id", sa.String(36), sa.ForeignKey("guest_sessions.id")),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("expected_size", sa.Integer(), nullable=False),
        sa.Column("received_size", sa.Integer(), nullable=False),
        sa.Column("chunk_count", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("checksum_sha256", sa.String(64)),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_upload_sessions_guest_session_id", "upload_sessions", ["guest_session_id"])
    op.create_index("ix_upload_sessions_expires_at", "upload_sessions", ["expires_at"])

    op.create_table(
        "processing_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("queue_job_id", sa.String(80), unique=True),
        sa.Column("state", sa.String(40), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("stage_message", sa.String(255), nullable=False),
        sa.Column("mode", sa.String(40), nullable=False),
        sa.Column("parameters", sa.JSON(), nullable=False),
        sa.Column("result_key", sa.String(512)),
        sa.Column("report", sa.JSON(), nullable=False),
        sa.Column("error_code", sa.String(80)),
        sa.Column("error_message", sa.Text()),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index("ix_processing_jobs_asset_id", "processing_jobs", ["asset_id"])
    op.create_index("ix_processing_jobs_state", "processing_jobs", ["state"])

    op.create_table(
        "job_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("processing_jobs.id"), nullable=False),
        sa.Column("state", sa.String(40), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("message", sa.String(255), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_job_events_job_id", "job_events", ["job_id"])

    op.create_table(
        "mask_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("parent_id", sa.String(36), sa.ForeignKey("mask_versions.id")),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("source", sa.String(24), nullable=False),
        sa.Column("operation_count", sa.Integer(), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_mask_versions_asset_id", "mask_versions", ["asset_id"])
    op.create_index("ix_mask_versions_is_current", "mask_versions", ["is_current"])

    op.create_table(
        "mask_operations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("base_version_id", sa.String(36), sa.ForeignKey("mask_versions.id"), nullable=False),
        sa.Column("result_version_id", sa.String(36), sa.ForeignKey("mask_versions.id")),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("undone", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_mask_operations_asset_id", "mask_operations", ["asset_id"])

    op.create_table(
        "preflight_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("mask_version_id", sa.String(36), sa.ForeignKey("mask_versions.id")),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("width_cm", sa.Float(), nullable=False),
        sa.Column("height_cm", sa.Float(), nullable=False),
        sa.Column("dpi", sa.Float(), nullable=False),
        sa.Column("issues", sa.JSON(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_preflight_reports_asset_id", "preflight_reports", ["asset_id"])

    op.create_table(
        "price_rules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(80), nullable=False, unique=True),
        sa.Column("label_fr", sa.String(160), nullable=False),
        sa.Column("label_ar", sa.String(160), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("amount_dzd", sa.Float(), nullable=False),
        sa.Column("conditions", sa.JSON(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        *_timestamps(),
    )

    op.create_table(
        "quotes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("guest_session_id", sa.String(36), sa.ForeignKey("guest_sessions.id")),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("subtotal_dzd", sa.Float(), nullable=False),
        sa.Column("discount_dzd", sa.Float(), nullable=False),
        sa.Column("fees_dzd", sa.Float(), nullable=False),
        sa.Column("delivery_dzd", sa.Float(), nullable=False),
        sa.Column("total_dzd", sa.Float(), nullable=False),
        sa.Column("breakdown", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_quotes_guest_session_id", "quotes", ["guest_session_id"])

    op.create_table(
        "orders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("order_number", sa.String(40), nullable=False, unique=True),
        sa.Column("guest_session_id", sa.String(36), sa.ForeignKey("guest_sessions.id")),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("payment_status", sa.String(32), nullable=False),
        sa.Column("payment_method", sa.String(32), nullable=False),
        sa.Column("total_dzd", sa.Float(), nullable=False),
        sa.Column("customer", sa.JSON(), nullable=False),
        sa.Column("delivery", sa.JSON(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("client_validated_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index("ix_orders_order_number", "orders", ["order_number"], unique=True)
    op.create_index("ix_orders_guest_session_id", "orders", ["guest_session_id"])
    op.create_index("ix_orders_status", "orders", ["status"])

    op.create_table(
        "order_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("order_id", sa.String(36), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("mask_version_id", sa.String(36), sa.ForeignKey("mask_versions.id")),
        sa.Column("width_cm", sa.Float(), nullable=False),
        sa.Column("height_cm", sa.Float(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("dpi", sa.Float(), nullable=False),
        sa.Column("options", sa.JSON(), nullable=False),
        sa.Column("unit_price_dzd", sa.Float(), nullable=False),
        sa.Column("total_dzd", sa.Float(), nullable=False),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"])

    op.create_table(
        "human_reviews",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("ai_confidence", sa.Float(), nullable=False),
        sa.Column("customer_notes", sa.Text(), nullable=False),
        sa.Column("operator_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("operator_notes", sa.Text(), nullable=False),
        sa.Column("decision_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index("ix_human_reviews_asset_id", "human_reviews", ["asset_id"])
    op.create_index("ix_human_reviews_status", "human_reviews", ["status"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("actor_type", sa.String(24), nullable=False),
        sa.Column("actor_id", sa.String(36)),
        sa.Column("action", sa.String(120), nullable=False),
        sa.Column("target_type", sa.String(80), nullable=False),
        sa.Column("target_id", sa.String(80)),
        sa.Column("request_id", sa.String(64)),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])

    op.create_table(
        "exports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("guest_session_id", sa.String(36), sa.ForeignKey("guest_sessions.id")),
        sa.Column("format", sa.String(24), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("options", sa.JSON(), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_exports_asset_id", "exports", ["asset_id"])
    op.create_index("ix_exports_guest_session_id", "exports", ["guest_session_id"])
    op.create_index("ix_exports_status", "exports", ["status"])


def downgrade() -> None:
    for table in (
        "exports",
        "audit_logs",
        "human_reviews",
        "order_items",
        "orders",
        "quotes",
        "price_rules",
        "preflight_reports",
        "mask_operations",
        "mask_versions",
        "job_events",
        "processing_jobs",
        "upload_sessions",
        "assets",
        "guest_sessions",
        "users",
    ):
        op.drop_table(table)
