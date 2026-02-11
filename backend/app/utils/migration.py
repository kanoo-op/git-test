"""
localStorage → PostgreSQL data migration utility.

Usage:
  1. In browser: run storage.exportAllData() → save JSON file
  2. Run: python -m app.utils.migration path/to/export.json

This reads the exported JSON and creates corresponding records in PostgreSQL.
"""

import asyncio
import json
import sys
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from ..config import settings
from ..database import engine, async_session, Base
from ..models.patient import Patient
from ..models.assessment import Assessment, Selection
from ..models.user import User


async def migrate(json_path: str, username: str = "admin"):
    """Migrate exported localStorage JSON data to PostgreSQL."""
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # Find user
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if not user:
            print(f"User '{username}' not found. Create admin user first.")
            return

        patients = data.get("patients", [])
        print(f"Migrating {len(patients)} patients...")

        for p_data in patients:
            patient = Patient(
                name=p_data["name"],
                dob=p_data.get("dob") or None,
                gender=p_data.get("gender") or None,
                phone=p_data.get("phone") or None,
                email=p_data.get("email") or None,
                diagnosis=p_data.get("diagnosis") or None,
                medical_history=p_data.get("medicalHistory") or None,
                occupation=p_data.get("occupation") or None,
                notes=p_data.get("notes") or None,
                created_by=user.id,
            )
            if p_data.get("createdAt"):
                patient.created_at = datetime.fromtimestamp(p_data["createdAt"] / 1000, tz=timezone.utc)
            db.add(patient)
            await db.flush()

            for a_data in p_data.get("assessments", []):
                assessment = Assessment(
                    patient_id=patient.id,
                    date=datetime.fromtimestamp(a_data["date"] / 1000, tz=timezone.utc) if a_data.get("date") else None,
                    summary=a_data.get("summary"),
                    overall_notes=a_data.get("overallNotes"),
                    highlight_state=a_data.get("highlightState"),
                    posture_analysis=a_data.get("postureAnalysis"),
                    created_by=user.id,
                )
                db.add(assessment)
                await db.flush()

                for s_data in a_data.get("selections", []):
                    sel = Selection(
                        assessment_id=assessment.id,
                        mesh_id=s_data.get("meshId", ""),
                        tissue=s_data.get("tissue"),
                        region=s_data.get("region"),
                        region_key=s_data.get("regionKey"),
                        side=s_data.get("side"),
                        severity=s_data.get("severity", "normal"),
                        concern=s_data.get("concern", False),
                        notes=s_data.get("notes"),
                    )
                    db.add(sel)

            print(f"  Migrated: {p_data['name']} ({len(p_data.get('assessments', []))} assessments)")

        await db.commit()
        print("Migration complete!")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m app.utils.migration <export.json> [username]")
        sys.exit(1)

    json_path = sys.argv[1]
    username = sys.argv[2] if len(sys.argv) > 2 else "admin"
    asyncio.run(migrate(json_path, username))
