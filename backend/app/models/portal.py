import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Integer, Float, Text, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class PatientInvite(Base):
    __tablename__ = "patient_invites"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    invite_code: Mapped[str] = mapped_column(String(6), unique=True, nullable=False, index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class PatientLink(Base):
    __tablename__ = "patient_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PrescribedProgram(Base):
    __tablename__ = "prescribed_programs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, default="처방 프로그램")
    weekly_plan: Mapped[str] = mapped_column(Text, nullable=False)  # JSON
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PatientCheckin(Base):
    __tablename__ = "patient_checkins"
    __table_args__ = (UniqueConstraint("patient_id", "local_id", name="uq_checkin_patient_local"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    local_id: Mapped[str] = mapped_column(String(50), nullable=False)
    date: Mapped[str] = mapped_column(String(10), nullable=False)  # YYYY-MM-DD
    timestamp: Mapped[str | None] = mapped_column(String(30), nullable=True)
    pre_pain_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    post_pain_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    rpe: Mapped[str | None] = mapped_column(String(20), nullable=True)
    routine_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    exercises_completed: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    total_duration: Mapped[int] = mapped_column(Integer, default=0)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PatientWorkoutSession(Base):
    __tablename__ = "patient_workout_sessions"
    __table_args__ = (UniqueConstraint("patient_id", "local_id", name="uq_workout_patient_local"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    local_id: Mapped[str] = mapped_column(String(50), nullable=False)
    date: Mapped[str] = mapped_column(String(30), nullable=False)
    duration: Mapped[int] = mapped_column(Integer, default=0)  # seconds
    rpe: Mapped[str | None] = mapped_column(String(20), nullable=True)
    exercises: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PatientPainLog(Base):
    __tablename__ = "patient_pain_logs"
    __table_args__ = (UniqueConstraint("patient_id", "local_id", name="uq_painlog_patient_local"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    local_id: Mapped[str] = mapped_column(String(50), nullable=False)
    date: Mapped[str] = mapped_column(String(30), nullable=False)
    region_key: Mapped[str] = mapped_column(String(50), nullable=False)
    pain_level: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    drawing_image: Mapped[str | None] = mapped_column(Text, nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
