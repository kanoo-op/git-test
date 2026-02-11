import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    overall_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    highlight_state: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    posture_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    soap_notes: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    patient: Mapped["Patient"] = relationship(back_populates="assessments")
    selections: Mapped[list["Selection"]] = relationship(back_populates="assessment", cascade="all, delete-orphan")
    photo: Mapped["PosturePhoto | None"] = relationship(back_populates="assessment", cascade="all, delete-orphan", uselist=False)


class Selection(Base):
    __tablename__ = "selections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assessment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False, index=True)
    mesh_id: Mapped[str] = mapped_column(String(255), nullable=False)
    tissue: Mapped[str | None] = mapped_column(String(100), nullable=True)
    region: Mapped[str | None] = mapped_column(String(255), nullable=True)
    region_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    side: Mapped[str | None] = mapped_column(String(20), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    concern: Mapped[bool | None] = mapped_column(default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    assessment: Mapped["Assessment"] = relationship(back_populates="selections")

    __table_args__ = (
        # UniqueConstraint on (assessment_id, mesh_id) for upsert
        {"sqlite_autoincrement": True},
    )


from .patient import Patient  # noqa: E402, F401
from .photo import PosturePhoto  # noqa: E402, F401
