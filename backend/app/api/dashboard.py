from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models.patient import Patient
from ..models.assessment import Assessment, Selection
from ..models.portal import PatientCheckin, PatientWorkoutSession, PatientPainLog
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

    # --- Patient App Aggregate Data ---

    # Total checkins
    total_checkins = await db.scalar(
        select(func.count()).select_from(PatientCheckin)
    ) or 0

    # Total workouts
    total_workouts = await db.scalar(
        select(func.count()).select_from(PatientWorkoutSession)
    ) or 0

    # Total pain logs
    total_pain_logs = await db.scalar(
        select(func.count()).select_from(PatientPainLog)
    ) or 0

    # Active app patients (patients with at least 1 checkin)
    active_app_patients = await db.scalar(
        select(func.count(func.distinct(PatientCheckin.patient_id)))
        .select_from(PatientCheckin)
    ) or 0

    # 7-day pain average
    seven_days_ago_str = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    r = await db.execute(
        select(PatientPainLog.pain_level).where(
            PatientPainLog.date >= seven_days_ago_str,
        )
    )
    all_pain_levels = [row[0] for row in r.all()]
    avg_pain_7d = round(sum(all_pain_levels) / len(all_pain_levels), 1) if all_pain_levels else None

    # 7-day completion rate
    r = await db.execute(
        select(PatientCheckin).where(
            PatientCheckin.date >= seven_days_ago_str,
        )
    )
    all_recent_checkins = r.scalars().all()
    if all_recent_checkins:
        completed = sum(1 for c in all_recent_checkins if c.routine_completed)
        completion_rate_7d = round((completed / len(all_recent_checkins)) * 100, 1)
    else:
        completion_rate_7d = None

    # Recent app activity (last 5 checkins + 5 workouts, merged)
    r = await db.execute(
        select(PatientCheckin)
        .order_by(PatientCheckin.synced_at.desc())
        .limit(5)
    )
    recent_checkins_list = []
    for c in r.scalars():
        recent_checkins_list.append({
            "type": "checkin",
            "patientId": str(c.patient_id),
            "patientName": "",
            "date": c.date,
            "prePain": c.pre_pain_score,
            "postPain": c.post_pain_score,
            "routineCompleted": c.routine_completed,
            "duration": c.total_duration,
            "syncedAt": c.synced_at.isoformat() if c.synced_at else None,
        })

    r = await db.execute(
        select(PatientWorkoutSession)
        .order_by(PatientWorkoutSession.synced_at.desc())
        .limit(5)
    )
    recent_workouts_list = []
    for w in r.scalars():
        recent_workouts_list.append({
            "type": "workout",
            "patientId": str(w.patient_id),
            "patientName": "",
            "date": w.date,
            "duration": w.duration,
            "rpe": w.rpe,
            "syncedAt": w.synced_at.isoformat() if w.synced_at else None,
        })

    # Merge and sort by syncedAt
    recent_app_activity = sorted(
        recent_checkins_list + recent_workouts_list,
        key=lambda x: x.get("syncedAt") or "",
        reverse=True,
    )[:10]

    # Resolve patient names
    app_patient_ids = {item["patientId"] for item in recent_app_activity}
    if app_patient_ids:
        r = await db.execute(
            select(Patient.id, Patient.name).where(Patient.id.in_(app_patient_ids))
        )
        name_map = {str(row[0]): row[1] for row in r.all()}
        for item in recent_app_activity:
            item["patientName"] = name_map.get(item["patientId"], "")

    return DashboardStats(
        total_patients=total_patients,
        total_assessments=total_assessments,
        today_assessments=today_assessments,
        severity_counts=severity_counts,
        recent_assessments=recent_assessments,
        recent_patients=recent_patients,
        total_checkins=total_checkins,
        total_workouts=total_workouts,
        total_pain_logs=total_pain_logs,
        avg_pain_7d=avg_pain_7d,
        completion_rate_7d=completion_rate_7d,
        active_app_patients=active_app_patients,
        recent_app_activity=recent_app_activity,
    )
