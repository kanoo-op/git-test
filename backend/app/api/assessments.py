import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models.patient import Patient
from ..models.assessment import Assessment, Selection
from ..models.photo import PosturePhoto
from ..models.user import User
from ..schemas.assessment import (
    AssessmentCreate, AssessmentUpdate, AssessmentOut, AssessmentBrief,
    SelectionsUpsertRequest, HighlightStateRequest, SelectionOut,
)
from ..services.audit_service import log_action
from ..services.encryption_service import encrypt, decrypt
from .deps import get_current_user, require_min_role, get_client_ip

router = APIRouter(prefix="/api/patients/{patient_id}/assessments", tags=["assessments"])


async def _get_patient(patient_id: uuid.UUID, db: AsyncSession) -> Patient:
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


async def _get_assessment(patient_id: uuid.UUID, assessment_id: uuid.UUID, db: AsyncSession) -> Assessment:
    result = await db.execute(
        select(Assessment)
        .where(Assessment.id == assessment_id, Assessment.patient_id == patient_id)
        .options(selectinload(Assessment.selections))
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return assessment


def _assessment_to_out(a: Assessment) -> AssessmentOut:
    return AssessmentOut(
        id=str(a.id),
        patient_id=str(a.patient_id),
        date=a.date,
        summary=a.summary,
        overall_notes=decrypt(a.overall_notes),
        highlight_state=a.highlight_state,
        posture_analysis=a.posture_analysis,
        created_at=a.created_at,
        updated_at=a.updated_at,
        selections=[
            SelectionOut(
                id=str(s.id),
                mesh_id=s.mesh_id,
                tissue=s.tissue,
                region=s.region,
                region_key=s.region_key,
                side=s.side,
                severity=s.severity,
                concern=s.concern,
                notes=s.notes,
            )
            for s in a.selections
        ],
        has_photo=a.photo is not None if hasattr(a, '_sa_instance_state') else False,
    )


@router.get("", response_model=list[AssessmentBrief])
async def list_assessments(
    patient_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    await _get_patient(patient_id, db)
    result = await db.execute(
        select(Assessment)
        .where(Assessment.patient_id == patient_id)
        .options(selectinload(Assessment.selections), selectinload(Assessment.photo))
        .order_by(Assessment.date.desc())
    )
    assessments = result.scalars().all()

    return [
        AssessmentBrief(
            id=str(a.id),
            date=a.date,
            summary=a.summary,
            selection_count=len(a.selections),
            has_photo=a.photo is not None,
        )
        for a in assessments
    ]


@router.post("", response_model=AssessmentOut, status_code=201)
async def create_assessment(
    patient_id: uuid.UUID,
    body: AssessmentCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
):
    await _get_patient(patient_id, db)
    assessment = Assessment(
        patient_id=patient_id,
        date=body.date,
        summary=body.summary,
        overall_notes=encrypt(body.overall_notes),
        created_by=user.id,
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)

    await log_action(db, user.id, "create", "assessment", str(assessment.id), ip_address=get_client_ip(request))

    return AssessmentOut(
        id=str(assessment.id),
        patient_id=str(assessment.patient_id),
        date=assessment.date,
        summary=assessment.summary,
        overall_notes=decrypt(assessment.overall_notes),
        created_at=assessment.created_at,
        updated_at=assessment.updated_at,
        selections=[],
        has_photo=False,
    )


@router.get("/{assessment_id}", response_model=AssessmentOut)
async def get_assessment(
    patient_id: uuid.UUID,
    assessment_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(
        select(Assessment)
        .where(Assessment.id == assessment_id, Assessment.patient_id == patient_id)
        .options(selectinload(Assessment.selections), selectinload(Assessment.photo))
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    return AssessmentOut(
        id=str(assessment.id),
        patient_id=str(assessment.patient_id),
        date=assessment.date,
        summary=assessment.summary,
        overall_notes=decrypt(assessment.overall_notes),
        highlight_state=assessment.highlight_state,
        posture_analysis=assessment.posture_analysis,
        created_at=assessment.created_at,
        updated_at=assessment.updated_at,
        selections=[
            SelectionOut(
                id=str(s.id),
                mesh_id=s.mesh_id,
                tissue=s.tissue,
                region=s.region,
                region_key=s.region_key,
                side=s.side,
                severity=s.severity,
                concern=s.concern,
                notes=s.notes,
            )
            for s in assessment.selections
        ],
        has_photo=assessment.photo is not None,
    )


@router.put("/{assessment_id}", response_model=AssessmentOut)
async def update_assessment(
    patient_id: uuid.UUID,
    assessment_id: uuid.UUID,
    body: AssessmentUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
):
    assessment = await _get_assessment(patient_id, assessment_id, db)
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "overall_notes":
            setattr(assessment, key, encrypt(value))
        else:
            setattr(assessment, key, value)
    await db.commit()
    await db.refresh(assessment)

    await log_action(db, user.id, "update", "assessment", str(assessment.id), ip_address=get_client_ip(request))

    # Re-fetch with relations
    return await get_assessment(patient_id, assessment_id, db, user)


@router.delete("/{assessment_id}")
async def delete_assessment(
    patient_id: uuid.UUID,
    assessment_id: uuid.UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
):
    assessment = await _get_assessment(patient_id, assessment_id, db)
    await db.delete(assessment)
    await db.commit()

    await log_action(db, user.id, "delete", "assessment", str(assessment_id), ip_address=get_client_ip(request))

    return {"detail": "Assessment deleted"}


@router.put("/{assessment_id}/selections")
async def upsert_selections(
    patient_id: uuid.UUID,
    assessment_id: uuid.UUID,
    body: SelectionsUpsertRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
):
    assessment = await _get_assessment(patient_id, assessment_id, db)

    existing_map = {s.mesh_id: s for s in assessment.selections}

    for sel_data in body.selections:
        if sel_data.mesh_id in existing_map:
            existing = existing_map[sel_data.mesh_id]
            existing.tissue = sel_data.tissue
            existing.region = sel_data.region
            existing.region_key = sel_data.region_key
            existing.side = sel_data.side
            existing.severity = sel_data.severity
            existing.concern = sel_data.concern
            existing.notes = sel_data.notes
        else:
            sel = Selection(
                assessment_id=assessment_id,
                mesh_id=sel_data.mesh_id,
                tissue=sel_data.tissue,
                region=sel_data.region,
                region_key=sel_data.region_key,
                side=sel_data.side,
                severity=sel_data.severity,
                concern=sel_data.concern,
                notes=sel_data.notes,
            )
            db.add(sel)

    await db.commit()
    return {"detail": "Selections updated"}


@router.put("/{assessment_id}/highlights")
async def save_highlights(
    patient_id: uuid.UUID,
    assessment_id: uuid.UUID,
    body: HighlightStateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
):
    assessment = await _get_assessment(patient_id, assessment_id, db)
    assessment.highlight_state = body.highlight_state
    await db.commit()
    return {"detail": "Highlight state saved"}
