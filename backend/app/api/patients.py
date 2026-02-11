import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models.patient import Patient
from ..models.assessment import Assessment
from ..models.user import User
from ..schemas.patient import PatientCreate, PatientUpdate, PatientOut, PatientListResponse
from ..services.audit_service import log_action
from ..services.encryption_service import encrypt, decrypt
from .deps import get_current_user, require_min_role, get_client_ip

router = APIRouter(prefix="/api/patients", tags=["patients"])

ENCRYPTED_PATIENT_FIELDS = ("phone", "email", "diagnosis", "medical_history", "notes")


def _decrypt_patient_out(p: Patient, assessment_count: int = 0) -> PatientOut:
    return PatientOut(
        id=str(p.id),
        name=p.name,
        dob=p.dob,
        gender=p.gender,
        phone=decrypt(p.phone),
        email=decrypt(p.email),
        diagnosis=decrypt(p.diagnosis),
        medical_history=decrypt(p.medical_history),
        occupation=p.occupation,
        notes=decrypt(p.notes),
        created_at=p.created_at,
        updated_at=p.updated_at,
        assessment_count=assessment_count,
    )


@router.get("", response_model=PatientListResponse)
async def list_patients(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    q: str = "",
    sort: str = "name",
    order: str = "asc",
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    query = select(Patient)
    count_query = select(func.count(Patient.id))

    if q:
        query = query.where(Patient.name.ilike(f"%{q}%"))
        count_query = count_query.where(Patient.name.ilike(f"%{q}%"))

    # Sorting
    sort_col = {
        "name": Patient.name,
        "date": Patient.created_at,
        "updated": Patient.updated_at,
    }.get(sort, Patient.name)

    if order == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())

    # Total count
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Pagination
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    patients = result.scalars().all()

    # Get assessment counts
    items = []
    for p in patients:
        count_result = await db.execute(
            select(func.count(Assessment.id)).where(Assessment.patient_id == p.id)
        )
        acount = count_result.scalar()
        items.append(_decrypt_patient_out(p, acount))

    return PatientListResponse(items=items, total=total, page=page, limit=limit)


@router.get("/{patient_id}", response_model=PatientOut)
async def get_patient(
    patient_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    count_result = await db.execute(
        select(func.count(Assessment.id)).where(Assessment.patient_id == patient.id)
    )
    acount = count_result.scalar()

    return _decrypt_patient_out(patient, acount)


@router.post("", response_model=PatientOut, status_code=201)
async def create_patient(
    body: PatientCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    patient = Patient(
        name=body.name,
        dob=body.dob,
        gender=body.gender,
        phone=encrypt(body.phone),
        email=encrypt(body.email),
        diagnosis=encrypt(body.diagnosis),
        medical_history=encrypt(body.medical_history),
        occupation=body.occupation,
        notes=encrypt(body.notes),
        created_by=user.id,
    )
    db.add(patient)
    await db.commit()
    await db.refresh(patient)

    await log_action(db, user.id, "create", "patient", str(patient.id), ip_address=get_client_ip(request))

    return _decrypt_patient_out(patient, 0)


@router.put("/{patient_id}", response_model=PatientOut)
async def update_patient(
    patient_id: uuid.UUID,
    body: PatientUpdate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key in ENCRYPTED_PATIENT_FIELDS:
            setattr(patient, key, encrypt(value))
        else:
            setattr(patient, key, value)
    await db.commit()
    await db.refresh(patient)

    await log_action(db, user.id, "update", "patient", str(patient.id), ip_address=get_client_ip(request))

    count_result = await db.execute(
        select(func.count(Assessment.id)).where(Assessment.patient_id == patient.id)
    )
    acount = count_result.scalar()

    return _decrypt_patient_out(patient, acount)


@router.delete("/{patient_id}")
async def delete_patient(
    patient_id: uuid.UUID,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("doctor"))],
):
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    await db.delete(patient)
    await db.commit()

    await log_action(db, user.id, "delete", "patient", str(patient_id), ip_address=get_client_ip(request))

    return {"detail": "Patient deleted"}


@router.get("/{patient_id}/export")
async def export_patient(
    patient_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(
        select(Patient).where(Patient.id == patient_id).options(
            selectinload(Patient.assessments).selectinload(Assessment.selections)
        )
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    data = {
        "id": str(patient.id),
        "name": patient.name,
        "dob": str(patient.dob) if patient.dob else None,
        "gender": patient.gender,
        "phone": decrypt(patient.phone),
        "email": decrypt(patient.email),
        "diagnosis": decrypt(patient.diagnosis),
        "medicalHistory": decrypt(patient.medical_history),
        "occupation": patient.occupation,
        "notes": decrypt(patient.notes),
        "createdAt": patient.created_at.isoformat(),
        "assessments": [
            {
                "id": str(a.id),
                "date": a.date.isoformat(),
                "summary": a.summary,
                "overallNotes": decrypt(a.overall_notes),
                "postureAnalysis": a.posture_analysis,
                "selections": [
                    {
                        "meshId": s.mesh_id,
                        "tissue": s.tissue,
                        "region": s.region,
                        "severity": s.severity,
                        "notes": s.notes,
                        "concern": s.concern,
                    }
                    for s in a.selections
                ],
            }
            for a in patient.assessments
        ],
    }

    return JSONResponse(content=data, headers={
        "Content-Disposition": f'attachment; filename="patient-{patient.name}.json"'
    })
