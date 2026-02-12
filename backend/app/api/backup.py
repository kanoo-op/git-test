import json
import uuid as uuid_mod
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..models.patient import Patient
from ..models.assessment import Assessment, Selection
from ..models.photo import PosturePhoto
from ..models.user import User
from ..services.audit_service import log_action
from ..services.encryption_service import encrypt, decrypt, encrypt_bytes, decrypt_bytes
from .deps import get_current_user, require_role, get_client_ip

router = APIRouter(prefix="/api/backup", tags=["backup"])


@router.post("")
async def create_backup(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
):
    """Export full database as encrypted JSON backup. Admin only."""
    # Fetch all patients with assessments and selections
    result = await db.execute(
        select(Patient).options(
            selectinload(Patient.assessments)
            .selectinload(Assessment.selections)
        ).order_by(Patient.created_at)
    )
    patients = result.scalars().all()

    backup_data = {
        "version": "1.0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user.username,
        "patients": [],
    }

    for p in patients:
        patient_data = {
            "id": str(p.id),
            "name": p.name,
            "dob": str(p.dob) if p.dob else None,
            "gender": p.gender,
            "phone": p.phone,  # already encrypted in DB
            "email": p.email,
            "diagnosis": p.diagnosis,
            "medical_history": p.medical_history,
            "occupation": p.occupation,
            "notes": p.notes,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            "created_by": str(p.created_by),
            "assessments": [],
        }

        for a in p.assessments:
            assessment_data = {
                "id": str(a.id),
                "date": a.date.isoformat() if a.date else None,
                "summary": a.summary,
                "overall_notes": a.overall_notes,  # already encrypted in DB
                "highlight_state": a.highlight_state,
                "posture_analysis": a.posture_analysis,
                "created_by": str(a.created_by),
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "updated_at": a.updated_at.isoformat() if a.updated_at else None,
                "selections": [
                    {
                        "id": str(s.id),
                        "mesh_id": s.mesh_id,
                        "tissue": s.tissue,
                        "region": s.region,
                        "region_key": s.region_key,
                        "side": s.side,
                        "severity": s.severity,
                        "concern": s.concern,
                        "notes": s.notes,
                    }
                    for s in a.selections
                ],
            }
            patient_data["assessments"].append(assessment_data)

        backup_data["patients"].append(patient_data)

    # Serialize and encrypt the entire backup
    json_bytes = json.dumps(backup_data, ensure_ascii=False).encode("utf-8")
    encrypted_backup = encrypt_bytes(json_bytes)

    await log_action(
        db, user.id, "backup", "system", None,
        details={"patient_count": len(patients)},
        ip_address=get_client_ip(request),
    )

    filename = f"postureview-backup-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.enc"
    return Response(
        content=encrypted_backup,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/restore")
async def restore_backup(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    """Restore from an encrypted backup file. Admin only."""
    encrypted_data = await file.read()

    # Decrypt
    try:
        json_bytes = decrypt_bytes(encrypted_data)
        backup_data = json.loads(json_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or corrupted backup file")

    if "version" not in backup_data or "patients" not in backup_data:
        raise HTTPException(status_code=400, detail="Invalid backup format")

    if not isinstance(backup_data["patients"], list):
        raise HTTPException(status_code=400, detail="Invalid backup format: patients must be a list")

    def _validate_uuid(value: str, field_name: str) -> str:
        try:
            return str(uuid_mod.UUID(value))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=400, detail=f"Invalid UUID in backup data: {field_name}={value!r}")

    VALID_SEVERITIES = {"normal", "mild", "moderate", "severe"}

    restored_count = 0
    skipped_count = 0

    for p_data in backup_data["patients"]:
        if not isinstance(p_data, dict) or "id" not in p_data or "name" not in p_data:
            skipped_count += 1
            continue

        patient_id = _validate_uuid(p_data["id"], "patient.id")

        # Check if patient already exists
        existing = await db.execute(
            select(Patient).where(Patient.id == patient_id)
        )
        if existing.scalar_one_or_none():
            continue  # Skip existing patients

        # Validate created_by is a valid UUID; fallback to current user
        try:
            created_by = str(uuid_mod.UUID(p_data.get("created_by", "")))
        except (ValueError, AttributeError):
            created_by = str(user.id)

        patient = Patient(
            id=patient_id,
            name=p_data["name"],
            dob=p_data.get("dob"),
            gender=p_data.get("gender"),
            phone=p_data.get("phone"),  # already encrypted
            email=p_data.get("email"),
            diagnosis=p_data.get("diagnosis"),
            medical_history=p_data.get("medical_history"),
            occupation=p_data.get("occupation"),
            notes=p_data.get("notes"),
            created_by=created_by,
        )
        db.add(patient)

        for a_data in p_data.get("assessments", []):
            if not isinstance(a_data, dict) or "id" not in a_data:
                continue

            assessment_id = _validate_uuid(a_data["id"], "assessment.id")

            try:
                a_created_by = str(uuid_mod.UUID(a_data.get("created_by", "")))
            except (ValueError, AttributeError):
                a_created_by = str(user.id)

            assessment = Assessment(
                id=assessment_id,
                patient_id=patient_id,
                date=a_data.get("date"),
                summary=a_data.get("summary"),
                overall_notes=a_data.get("overall_notes"),  # already encrypted
                highlight_state=a_data.get("highlight_state"),
                posture_analysis=a_data.get("posture_analysis"),
                created_by=a_created_by,
            )
            db.add(assessment)

            for s_data in a_data.get("selections", []):
                if not isinstance(s_data, dict) or "id" not in s_data or "mesh_id" not in s_data:
                    continue

                selection_id = _validate_uuid(s_data["id"], "selection.id")
                severity = s_data.get("severity", "normal")
                if severity not in VALID_SEVERITIES:
                    severity = "normal"

                selection = Selection(
                    id=selection_id,
                    assessment_id=assessment_id,
                    mesh_id=s_data["mesh_id"],
                    tissue=s_data.get("tissue"),
                    region=s_data.get("region"),
                    region_key=s_data.get("region_key"),
                    side=s_data.get("side"),
                    severity=severity,
                    concern=bool(s_data.get("concern", False)),
                    notes=s_data.get("notes"),
                )
                db.add(selection)

        restored_count += 1

    await db.commit()

    await log_action(
        db, user.id, "restore", "system", None,
        details={"restored_patients": restored_count},
        ip_address=get_client_ip(request),
    )

    return {
        "detail": "Backup restored successfully",
        "restored_patients": restored_count,
    }
