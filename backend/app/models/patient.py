import uuid
from datetime import datetime, date

from sqlalchemy import String, Date, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)          # encrypted
    email: Mapped[str | None] = mapped_column(Text, nullable=True)          # encrypted
    diagnosis: Mapped[str | None] = mapped_column(Text, nullable=True)      # encrypted
    medical_history: Mapped[str | None] = mapped_column(Text, nullable=True)  # encrypted
    occupation: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)          # encrypted
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    assessments: Mapped[list["Assessment"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan", order_by="Assessment.date.desc()"
    )


# Avoid circular import
from .assessment import Assessment  # noqa: E402, F401
