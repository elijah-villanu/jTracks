"""V2: rename interviewing to interviewing_oa, add failed status

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-20

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # ALTER TYPE ... ADD VALUE cannot run inside a transaction block on
        # older Postgres, and even where it can (12+), the new label can't be
        # referenced in the same transaction it was added in. autocommit_block()
        # commits the migration's current transaction, runs these statements
        # outside any transaction, then reopens one -- sidesteps both
        # restrictions regardless of the deployed server version.
        # RENAME VALUE relabels the existing enum in place, so every row
        # currently holding 'interviewing' reads as 'interviewing_oa'
        # afterward with no data UPDATE needed.
        # IF NOT EXISTS on ADD VALUE: downgrade() cannot drop the 'failed'
        # label (Postgres has no DROP VALUE), so a downgrade -> upgrade
        # round-trip re-runs this against a type that already has it.
        with op.get_context().autocommit_block():
            op.execute(
                "ALTER TYPE application_status RENAME VALUE 'interviewing' TO 'interviewing_oa'"
            )
            op.execute("ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'failed'")
    else:
        # SQLite has no native enum type -- status is a plain TEXT column
        # with no CHECK constraint, so there's no type DDL to run. Existing
        # seeded/fixture rows still need updating by hand.
        op.execute(
            "UPDATE applications SET status = 'interviewing_oa' WHERE status = 'interviewing'"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Postgres can't drop a value from an enum type. Remap any 'failed'
        # rows to 'rejected' (the closest V1 equivalent) so no row is left
        # holding a value the V1 (6-value) model can't parse. The 'failed'
        # label itself stays defined on the type after downgrade -- harmless,
        # since nothing can insert it once the app model reverts.
        #
        # NOTE -- this remap is lossy, not just stale: it silently converts
        # post-interview failures into pre-interview rejections, which is
        # exactly the distinction V2 introduces this migration to capture.
        # A downgrade-then-upgrade round-trip does NOT restore the original
        # 'failed' rows; they permanently read as 'rejected' with nothing in
        # the data indicating the reclassification happened. Acceptable only
        # because V2 has no production data and the dev DB is resettable
        # (PRD_V2.md "Constraints & assumptions") -- do not rely on this
        # migration to preserve data fidelity if that ever changes.
        op.execute("UPDATE applications SET status = 'rejected' WHERE status = 'failed'")
        with op.get_context().autocommit_block():
            op.execute(
                "ALTER TYPE application_status RENAME VALUE 'interviewing_oa' TO 'interviewing'"
            )
    else:
        op.execute("UPDATE applications SET status = 'rejected' WHERE status = 'failed'")
        op.execute(
            "UPDATE applications SET status = 'interviewing' WHERE status = 'interviewing_oa'"
        )
