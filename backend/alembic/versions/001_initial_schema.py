"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-02-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("username", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(100), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="doctor"),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- refresh_tokens ---
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(255), nullable=False, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean, server_default=sa.text("0")),
    )

    # --- patients ---
    op.create_table(
        "patients",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, index=True),
        sa.Column("dob", sa.Date, nullable=True),
        sa.Column("gender", sa.String(10), nullable=True),
        sa.Column("phone", sa.Text, nullable=True),
        sa.Column("email", sa.Text, nullable=True),
        sa.Column("diagnosis", sa.Text, nullable=True),
        sa.Column("medical_history", sa.Text, nullable=True),
        sa.Column("occupation", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    # --- assessments ---
    op.create_table(
        "assessments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("date", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("overall_notes", sa.Text, nullable=True),
        sa.Column("highlight_state", sa.JSON, nullable=True),
        sa.Column("posture_analysis", sa.JSON, nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- selections ---
    op.create_table(
        "selections",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("assessment_id", sa.String(36), sa.ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("mesh_id", sa.String(255), nullable=False),
        sa.Column("tissue", sa.String(100), nullable=True),
        sa.Column("region", sa.String(255), nullable=True),
        sa.Column("region_key", sa.String(255), nullable=True),
        sa.Column("side", sa.String(20), nullable=True),
        sa.Column("severity", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("concern", sa.Boolean, server_default=sa.text("0")),
        sa.Column("notes", sa.Text, nullable=True),
        sa.UniqueConstraint("assessment_id", "mesh_id", name="uq_selection_assessment_mesh"),
    )

    # --- posture_photos ---
    op.create_table(
        "posture_photos",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("assessment_id", sa.String(36), sa.ForeignKey("assessments.id", ondelete="CASCADE"), unique=True, nullable=False),
        sa.Column("data", sa.LargeBinary, nullable=False),
        sa.Column("mime_type", sa.String(50), nullable=False, server_default="image/jpeg"),
        sa.Column("file_size", sa.Integer, nullable=False, server_default=sa.text("0")),
    )

    # --- mappings ---
    op.create_table(
        "mappings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, server_default="default"),
        sa.Column("data", sa.JSON, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
    )

    # --- mesh_names ---
    op.create_table(
        "mesh_names",
        sa.Column("mesh_id", sa.String(255), primary_key=True),
        sa.Column("custom_name", sa.String(255), nullable=False),
    )

    # --- audit_logs ---
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("action", sa.String(50), nullable=False, index=True),
        sa.Column("resource", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.String(100), nullable=True),
        sa.Column("details", sa.JSON, nullable=True),
        sa.Column("ip_address", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )

    # --- patient_invites ---
    op.create_table(
        "patient_invites",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("invite_code", sa.String(6), unique=True, nullable=False, index=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    # --- patient_links ---
    op.create_table(
        "patient_links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("linked_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- prescribed_programs ---
    op.create_table(
        "prescribed_programs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False, server_default="처방 프로그램"),
        sa.Column("weekly_plan", sa.Text, nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("1")),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- patient_checkins ---
    op.create_table(
        "patient_checkins",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("local_id", sa.String(50), nullable=False),
        sa.Column("date", sa.String(10), nullable=False),
        sa.Column("timestamp", sa.String(30), nullable=True),
        sa.Column("pre_pain_score", sa.Float, nullable=True),
        sa.Column("post_pain_score", sa.Float, nullable=True),
        sa.Column("rpe", sa.String(20), nullable=True),
        sa.Column("routine_completed", sa.Boolean, server_default=sa.text("0")),
        sa.Column("exercises_completed", sa.Text, nullable=True),
        sa.Column("total_duration", sa.Integer, server_default=sa.text("0")),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("patient_id", "local_id", name="uq_checkin_patient_local"),
    )

    # --- patient_workout_sessions ---
    op.create_table(
        "patient_workout_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("local_id", sa.String(50), nullable=False),
        sa.Column("date", sa.String(30), nullable=False),
        sa.Column("duration", sa.Integer, server_default=sa.text("0")),
        sa.Column("rpe", sa.String(20), nullable=True),
        sa.Column("exercises", sa.Text, nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("patient_id", "local_id", name="uq_workout_patient_local"),
    )

    # --- patient_pain_logs ---
    op.create_table(
        "patient_pain_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("local_id", sa.String(50), nullable=False),
        sa.Column("date", sa.String(30), nullable=False),
        sa.Column("region_key", sa.String(50), nullable=False),
        sa.Column("pain_level", sa.Integer, nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("drawing_image", sa.Text, nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("patient_id", "local_id", name="uq_painlog_patient_local"),
    )


def downgrade() -> None:
    op.drop_table("patient_pain_logs")
    op.drop_table("patient_workout_sessions")
    op.drop_table("patient_checkins")
    op.drop_table("prescribed_programs")
    op.drop_table("patient_links")
    op.drop_table("patient_invites")
    op.drop_table("audit_logs")
    op.drop_table("mesh_names")
    op.drop_table("mappings")
    op.drop_table("posture_photos")
    op.drop_table("selections")
    op.drop_table("assessments")
    op.drop_table("patients")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
