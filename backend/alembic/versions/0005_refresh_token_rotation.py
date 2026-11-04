"""refresh token rotation: add family_id and replaced_by_id

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, Sequence[str], None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch_alter_table so the NOT NULL flip also works on SQLite, which can't
    # ALTER COLUMN in place; on Postgres it emits plain ALTER TABLE statements.
    with op.batch_alter_table("refresh_tokens") as batch:
        batch.add_column(sa.Column("family_id", sa.UUID(), nullable=True))
        batch.add_column(sa.Column("replaced_by_id", sa.UUID(), nullable=True))

    # Every pre-rotation token was minted by its own login, so each row is the
    # sole member of its own family. Its id is already a unique UUID.
    op.execute("UPDATE refresh_tokens SET family_id = id")

    with op.batch_alter_table("refresh_tokens") as batch:
        batch.alter_column("family_id", existing_type=sa.UUID(), nullable=False)
        # Reuse detection revokes a whole family in one indexed update.
        batch.create_index(
            op.f("ix_refresh_tokens_family_id"), ["family_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("refresh_tokens") as batch:
        batch.drop_index(op.f("ix_refresh_tokens_family_id"))
        batch.drop_column("replaced_by_id")
        batch.drop_column("family_id")
