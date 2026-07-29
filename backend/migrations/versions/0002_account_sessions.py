"""Link signed browser sessions to persistent customer accounts.

Revision ID: 0002_account_sessions
Revises: 0001_background_studio
Create Date: 2026-07-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0002_account_sessions"
down_revision = "0001_background_studio"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "guest_sessions",
        sa.Column("user_id", sa.String(36), nullable=True),
    )
    op.create_foreign_key(
        "fk_guest_sessions_user_id",
        "guest_sessions",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_guest_sessions_user_id",
        "guest_sessions",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_guest_sessions_user_id", table_name="guest_sessions")
    op.drop_constraint(
        "fk_guest_sessions_user_id",
        "guest_sessions",
        type_="foreignkey",
    )
    op.drop_column("guest_sessions", "user_id")
