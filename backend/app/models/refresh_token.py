import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Hash of the token, never the raw value -- the raw token has no column
    # to live in (PRD R7.3 NFR). Unique + indexed: every POST /auth/refresh
    # looks a row up by this on the hot auth path.
    token_hash: Mapped[str] = mapped_column(
        String, unique=True, nullable=False, index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # R7.5 — every token minted by one login/signup/OAuth exchange, and every
    # token rotated out of those, shares a family. Reuse of a rotated token
    # revokes the whole family, which is what ends a stolen session.
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, default=uuid.uuid4, index=True
    )
    # Non-null means revoked.
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # R7.5 — set when this token was revoked *by rotation* (it names the token
    # that replaced it). This is what separates "used again after rotation"
    # (reuse: a theft signal) from "revoked by logout or the session cap"
    # (just an invalid session). No FK: `purge_expired` deletes rows, and a
    # successor always outlives its predecessor, so it would never dangle in
    # the direction that matters.
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")
