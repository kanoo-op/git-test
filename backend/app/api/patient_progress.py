"""Patient Progress API - 병원에서 환자 진행 현황 조회"""

import json
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.user import User
from ..models.portal import PatientCheckin, PatientWorkoutSession, PatientPainLog
from ..schemas.portal import ProgressSummary
from .deps import get_current_user, require_min_role

router = APIRouter(prefix="/api/patients", tags=["patient-progress"])


@router.get("/{patient_id}/progress/summary", response_model=ProgressSummary)
async def get_progress_summary(
    patient_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
):
    # Counts
    checkin_count = await db.scalar(
        select(func.count()).select_from(PatientCheckin).where(PatientCheckin.patient_id == patient_id)
    )
    workout_count = await db.scalar(
        select(func.count()).select_from(PatientWorkoutSession).where(PatientWorkoutSession.patient_id == patient_id)
    )
    painlog_count = await db.scalar(
        select(func.count()).select_from(PatientPainLog).where(PatientPainLog.patient_id == patient_id)
    )

    # 7-day pain average
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    result = await db.execute(
        select(PatientPainLog.pain_level).where(
            PatientPainLog.patient_id == patient_id,
            PatientPainLog.date >= seven_days_ago,
        )
    )
    pain_levels = [row[0] for row in result.all()]
    avg_pain = round(sum(pain_levels) / len(pain_levels), 1) if pain_levels else None

    # 7-day completion rate
    result = await db.execute(
        select(PatientCheckin).where(
            PatientCheckin.patient_id == patient_id,
            PatientCheckin.date >= seven_days_ago,
        )
    )
    recent_checkins = result.scalars().all()
    if recent_checkins:
        completed = sum(1 for c in recent_checkins if c.routine_completed)
        completion_rate = round((completed / len(recent_checkins)) * 100, 1)
    else:
        completion_rate = None

    # Last sync time
    result = await db.execute(
        select(PatientCheckin.synced_at)
        .where(PatientCheckin.patient_id == patient_id)
        .order_by(PatientCheckin.synced_at.desc())
        .limit(1)
    )
    last_row = result.scalar_one_or_none()
    last_sync = last_row.isoformat() if last_row else None

    return ProgressSummary(
        total_checkins=checkin_count or 0,
        total_workouts=workout_count or 0,
        total_pain_logs=painlog_count or 0,
        avg_pain_7d=avg_pain,
        completion_rate_7d=completion_rate,
        last_sync=last_sync,
    )


@router.get("/{patient_id}/progress/checkins")
async def get_patient_checkins(
    patient_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
    limit: int = 30,
):
    result = await db.execute(
        select(PatientCheckin)
        .where(PatientCheckin.patient_id == patient_id)
        .order_by(PatientCheckin.date.desc())
        .limit(limit)
    )
    checkins = result.scalars().all()
    return [
        {
            "id": c.id,
            "date": c.date,
            "pre_pain_score": c.pre_pain_score,
            "post_pain_score": c.post_pain_score,
            "rpe": c.rpe,
            "routine_completed": c.routine_completed,
            "total_duration": c.total_duration,
            "exercises_completed": json.loads(c.exercises_completed) if c.exercises_completed else [],
        }
        for c in checkins
    ]


@router.get("/{patient_id}/progress/workouts")
async def get_patient_workouts(
    patient_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
    limit: int = 30,
):
    result = await db.execute(
        select(PatientWorkoutSession)
        .where(PatientWorkoutSession.patient_id == patient_id)
        .order_by(PatientWorkoutSession.date.desc())
        .limit(limit)
    )
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "date": s.date,
            "duration": s.duration,
            "rpe": s.rpe,
            "exercises": json.loads(s.exercises) if s.exercises else [],
        }
        for s in sessions
    ]


@router.get("/{patient_id}/progress/chart-data")
async def get_chart_data(
    patient_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
    days: int = 30,
):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

    # Pain data
    result = await db.execute(
        select(PatientPainLog).where(
            PatientPainLog.patient_id == patient_id,
            PatientPainLog.date >= cutoff,
        ).order_by(PatientPainLog.date)
    )
    pain_logs = result.scalars().all()

    # Workout data
    result = await db.execute(
        select(PatientWorkoutSession).where(
            PatientWorkoutSession.patient_id == patient_id,
            PatientWorkoutSession.date >= cutoff,
        ).order_by(PatientWorkoutSession.date)
    )
    workouts = result.scalars().all()

    return {
        "pain": [
            {"date": p.date, "region_key": p.region_key, "pain_level": p.pain_level}
            for p in pain_logs
        ],
        "workouts": [
            {"date": w.date, "duration": w.duration, "rpe": w.rpe}
            for w in workouts
        ],
    }
