from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models.patient import Patient
from ..models.assessment import Assessment, Selection
from ..models.user import User
from ..schemas.dashboard import DashboardStats
from ..services.encryption_service import decrypt
from .deps import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    # Total patients
    r = await db.execute(select(func.count(Patient.id)))
    total_patients = r.scalar()

    # Total assessments
    r = await db.execute(select(func.count(Assessment.id)))
    total_assessments = r.scalar()

    # Today assessments
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    r = await db.execute(
        select(func.count(Assessment.id)).where(Assessment.date >= today_start)
    )
    today_assessments = r.scalar()

    # Severity distribution
    severity_counts = {"normal": 0, "mild": 0, "moderate": 0, "severe": 0}
    r = await db.execute(
        select(Selection.severity, func.count(Selection.id)).group_by(Selection.severity)
    )
    for sev, count in r.all():
        if sev in severity_counts:
            severity_counts[sev] = count

    # Recent assessments (last 7 days)
    seven_days_ago = now - timedelta(days=7)
    r = await db.execute(
        select(Assessment)
        .where(Assessment.date >= seven_days_ago)
        .options(selectinload(Assessment.patient), selectinload(Assessment.selections))
        .order_by(Assessment.date.desc())
        .limit(10)
    )
    recent_assessments = []
    for a in r.scalars():
        recent_assessments.append({
            "id": str(a.id),
            "patientId": str(a.patient_id),
            "patientName": a.patient.name if a.patient else "",
            "date": a.date.isoformat(),
            "summary": a.summary,
            "selectionCount": len(a.selections),
        })

    # Recent patients (by latest assessment)
    r = await db.execute(
        select(Patient)
        .options(selectinload(Patient.assessments))
        .order_by(Patient.updated_at.desc())
        .limit(5)
    )
    recent_patients = []
    for p in r.scalars():
        recent_patients.append({
            "id": str(p.id),
            "name": p.name,
            "diagnosis": decrypt(p.diagnosis),
            "assessmentCount": len(p.assessments),
        })

    return DashboardStats(
        total_patients=total_patients,
        total_assessments=total_assessments,
        today_assessments=today_assessments,
        severity_counts=severity_counts,
        recent_assessments=recent_assessments,
        recent_patients=recent_patients,
    )
