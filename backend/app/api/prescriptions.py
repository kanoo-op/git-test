"""Prescriptions API - 치료사가 환자에게 운동 처방"""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.user import User
from ..models.patient import Patient
from ..models.portal import PrescribedProgram
from ..schemas.portal import PrescriptionCreate, PrescriptionUpdate, PrescriptionResponse
from .deps import get_current_user, require_min_role

router = APIRouter(prefix="/api/patients", tags=["prescriptions"])


@router.post("/{patient_id}/prescriptions", response_model=PrescriptionResponse)
async def create_prescription(
    patient_id: str,
    body: PrescriptionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
):
    # Verify patient exists
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Patient not found")

    program = PrescribedProgram(
        patient_id=patient_id,
        name=body.name,
        weekly_plan=json.dumps(body.weekly_plan, ensure_ascii=False),
        notes=body.notes,
        created_by=user.id,
    )
    db.add(program)
    await db.commit()
    await db.refresh(program)

    return PrescriptionResponse(
        id=program.id,
        patient_id=program.patient_id,
        name=program.name,
        weekly_plan=json.loads(program.weekly_plan),
        notes=program.notes,
        is_active=program.is_active,
        created_at=program.created_at.isoformat(),
        updated_at=program.updated_at.isoformat(),
    )


@router.get("/{patient_id}/prescriptions", response_model=list[PrescriptionResponse])
async def list_prescriptions(
    patient_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
):
    result = await db.execute(
        select(PrescribedProgram)
        .where(PrescribedProgram.patient_id == patient_id)
        .order_by(PrescribedProgram.updated_at.desc())
    )
    programs = result.scalars().all()

    return [
        PrescriptionResponse(
            id=p.id,
            patient_id=p.patient_id,
            name=p.name,
            weekly_plan=json.loads(p.weekly_plan) if isinstance(p.weekly_plan, str) else p.weekly_plan,
            notes=p.notes,
            is_active=p.is_active,
            created_at=p.created_at.isoformat(),
            updated_at=p.updated_at.isoformat(),
        )
        for p in programs
    ]


@router.put("/{patient_id}/prescriptions/{program_id}", response_model=PrescriptionResponse)
async def update_prescription(
    patient_id: str,
    program_id: str,
    body: PrescriptionUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
):
    result = await db.execute(
        select(PrescribedProgram).where(
            PrescribedProgram.id == program_id,
            PrescribedProgram.patient_id == patient_id,
        )
    )
    program = result.scalar_one_or_none()
    if not program:
        raise HTTPException(status_code=404, detail="Prescription not found")

    if body.name is not None:
        program.name = body.name
    if body.weekly_plan is not None:
        program.weekly_plan = json.dumps(body.weekly_plan, ensure_ascii=False)
    if body.notes is not None:
        program.notes = body.notes
    if body.is_active is not None:
        program.is_active = body.is_active

    await db.commit()
    await db.refresh(program)

    return PrescriptionResponse(
        id=program.id,
        patient_id=program.patient_id,
        name=program.name,
        weekly_plan=json.loads(program.weekly_plan) if isinstance(program.weekly_plan, str) else program.weekly_plan,
        notes=program.notes,
        is_active=program.is_active,
        created_at=program.created_at.isoformat(),
        updated_at=program.updated_at.isoformat(),
    )


@router.delete("/{patient_id}/prescriptions/{program_id}")
async def delete_prescription(
    patient_id: str,
    program_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
):
    result = await db.execute(
        select(PrescribedProgram).where(
            PrescribedProgram.id == program_id,
            PrescribedProgram.patient_id == patient_id,
        )
    )
    program = result.scalar_one_or_none()
    if not program:
        raise HTTPException(status_code=404, detail="Prescription not found")

    await db.delete(program)
    await db.commit()
    return {"detail": "Deleted"}
