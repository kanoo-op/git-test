"""Portal API - 환자 앱 전용 (내 정보, 처방 프로그램, 동기화)"""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.user import User
from ..models.patient import Patient
from ..models.portal import (
    PatientLink, PrescribedProgram, PatientCheckin, PatientWorkoutSession, PatientPainLog,
)
from ..schemas.portal import (
    PortalMeResponse, PrescriptionResponse,
    SyncCheckinItem, SyncWorkoutItem, SyncPainLogItem, SyncResponse,
)
from .deps import get_current_user

router = APIRouter(prefix="/api/portal", tags=["portal"])


async def get_patient_id(user: User, db: AsyncSession) -> str:
    """현재 로그인한 환자 유저의 patient_id 조회"""
    result = await db.execute(select(PatientLink).where(PatientLink.user_id == user.id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=403, detail="No patient linked to this account")
    return link.patient_id


# ═══ Me ═══

@router.get("/me", response_model=PortalMeResponse)
async def portal_me(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    patient_id = await get_patient_id(user, db)
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()

    return PortalMeResponse(
        user_id=str(user.id),
        username=user.username,
        full_name=user.full_name,
        patient_id=patient_id,
        patient_name=patient.name if patient else "",
    )


# ═══ Programs ═══

@router.get("/programs", response_model=list[PrescriptionResponse])
async def get_my_programs(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    patient_id = await get_patient_id(user, db)
    result = await db.execute(
        select(PrescribedProgram)
        .where(PrescribedProgram.patient_id == patient_id, PrescribedProgram.is_active == True)
        .order_by(PrescribedProgram.updated_at.desc())
    )
    programs = result.scalars().all()

    out = []
    for p in programs:
        out.append(PrescriptionResponse(
            id=p.id,
            patient_id=p.patient_id,
            name=p.name,
            weekly_plan=json.loads(p.weekly_plan) if isinstance(p.weekly_plan, str) else p.weekly_plan,
            notes=p.notes,
            is_active=p.is_active,
            created_at=p.created_at.isoformat() if p.created_at else "",
            updated_at=p.updated_at.isoformat() if p.updated_at else "",
        ))
    return out


# ═══ Sync: Checkins ═══

@router.post("/sync/checkins", response_model=SyncResponse)
async def sync_checkins(
    items: list[SyncCheckinItem],
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    patient_id = await get_patient_id(user, db)
    synced = 0
    duplicates = 0

    for item in items:
        existing = await db.execute(
            select(PatientCheckin).where(
                PatientCheckin.patient_id == patient_id,
                PatientCheckin.local_id == item.local_id,
            )
        )
        if existing.scalar_one_or_none():
            duplicates += 1
            continue

        record = PatientCheckin(
            patient_id=patient_id,
            local_id=item.local_id,
            date=item.date,
            timestamp=item.timestamp,
            pre_pain_score=item.pre_pain_score,
            post_pain_score=item.post_pain_score,
            rpe=item.rpe,
            routine_completed=item.routine_completed,
            exercises_completed=json.dumps(item.exercises_completed) if item.exercises_completed else None,
            total_duration=item.total_duration,
        )
        db.add(record)
        synced += 1

    await db.commit()
    return SyncResponse(synced=synced, duplicates=duplicates)


# ═══ Sync: Workouts ═══

@router.post("/sync/workouts", response_model=SyncResponse)
async def sync_workouts(
    items: list[SyncWorkoutItem],
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    patient_id = await get_patient_id(user, db)
    synced = 0
    duplicates = 0

    for item in items:
        existing = await db.execute(
            select(PatientWorkoutSession).where(
                PatientWorkoutSession.patient_id == patient_id,
                PatientWorkoutSession.local_id == item.local_id,
            )
        )
        if existing.scalar_one_or_none():
            duplicates += 1
            continue

        record = PatientWorkoutSession(
            patient_id=patient_id,
            local_id=item.local_id,
            date=item.date,
            duration=item.duration,
            rpe=item.rpe,
            exercises=json.dumps(item.exercises) if item.exercises else None,
        )
        db.add(record)
        synced += 1

    await db.commit()
    return SyncResponse(synced=synced, duplicates=duplicates)


# ═══ Sync: Pain Logs ═══

@router.post("/sync/painlogs", response_model=SyncResponse)
async def sync_painlogs(
    items: list[SyncPainLogItem],
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    patient_id = await get_patient_id(user, db)
    synced = 0
    duplicates = 0

    for item in items:
        existing = await db.execute(
            select(PatientPainLog).where(
                PatientPainLog.patient_id == patient_id,
                PatientPainLog.local_id == item.local_id,
            )
        )
        if existing.scalar_one_or_none():
            duplicates += 1
            continue

        record = PatientPainLog(
            patient_id=patient_id,
            local_id=item.local_id,
            date=item.date,
            region_key=item.region_key,
            pain_level=item.pain_level,
            note=item.note,
        )
        db.add(record)
        synced += 1

    await db.commit()
    return SyncResponse(synced=synced, duplicates=duplicates)
