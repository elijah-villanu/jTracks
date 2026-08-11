"""create applications table and indexes

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

application_status = sa.Enum(
    "saved",
    "applied",
    "interviewing",
    "offer",
    "rejected",
    "ghosted",
    name="application_status",
)


def upgrade() -> None:
    op.create_table(
        "applications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("company", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("status", application_status, nullable=False),
        sa.Column("job_url", sa.String(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("salary", sa.String(), nullable=True),
        sa.Column("date_posted", sa.Date(), nullable=True),
        sa.Column("date_saved", sa.Date(), nullable=True),
        sa.Column("date_applied", sa.Date(), nullable=True),
        sa.Column("ghost_days_override", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # D4: index on date_applied (ghosting job scans by date), composite
    # (user_id, status) for the dashboard status breakdown, and composite
    # (user_id, date_applied) for the ghosting job's per-user daily scan.
    op.create_index(
        op.f("ix_applications_date_applied"), "applications", ["date_applied"]
    )
    op.create_index(
        "ix_applications_user_id_date_applied",
        "applications",
        ["user_id", "date_applied"],
    )
    op.create_index(
        "ix_applications_user_id_status", "applications", ["user_id", "status"]
    )


def downgrade() -> None:
    op.drop_index("ix_applications_user_id_status", table_name="applications")
    op.drop_index("ix_applications_user_id_date_applied", table_name="applications")
    op.drop_index(op.f("ix_applications_date_applied"), table_name="applications")
    op.drop_table("applications")
    application_status.drop(op.get_bind())
