import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class ApplicationStatus(str, enum.Enum):
    SAVED = "saved"
    APPLIED = "applied"
    INTERVIEWING_OA = "interviewing_oa"
    OFFER = "offer"
    REJECTED = "rejected"
    FAILED = "failed"
    GHOSTED = "ghosted"


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (
        # Dashboard status-breakdown query: WHERE user_id = ? [AND status = ?]
        Index("ix_applications_user_id_status", "user_id", "status"),
        # Ghosting job's daily scan: WHERE user_id = ? AND status IN (...) ORDER BY date_applied
        Index("ix_applications_user_id_date_applied", "user_id", "date_applied"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    company: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[ApplicationStatus] = mapped_column(
        SAEnum(
            ApplicationStatus,
            name="application_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=ApplicationStatus.SAVED,
    )
    job_url: Mapped[str | None] = mapped_column(String, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    # Free-form: postings list compensation as ranges, single figures, or "DOE" text,
    # so this isn't modeled as a numeric column.
    salary: Mapped[str | None] = mapped_column(String, nullable=True)
    date_posted: Mapped[date | None] = mapped_column(Date, nullable=True)
    date_saved: Mapped[date | None] = mapped_column(Date, nullable=True)
    date_applied: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    # Null means "use the user's ghost_days_default" — not "no override".
    ghost_days_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="applications")
