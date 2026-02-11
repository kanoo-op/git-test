import json
from datetime import datetime
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
        "created_at": datetime.utcnow().isoformat(),
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

    filename = f"postureview-backup-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.enc"
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

    restored_count = 0

    for p_data in backup_data["patients"]:
        # Check if patient already exists
        existing = await db.execute(
            select(Patient).where(Patient.id == p_data["id"])
        )
        if existing.scalar_one_or_none():
            continue  # Skip existing patients

        patient = Patient(
            id=p_data["id"],
            name=p_data["name"],
            dob=p_data.get("dob"),
            gender=p_data.get("gender"),
            phone=p_data.get("phone"),  # already encrypted
            email=p_data.get("email"),
            diagnosis=p_data.get("diagnosis"),
            medical_history=p_data.get("medical_history"),
            occupation=p_data.get("occupation"),
            notes=p_data.get("notes"),
            created_by=p_data.get("created_by", str(user.id)),
        )
        db.add(patient)

        for a_data in p_data.get("assessments", []):
            assessment = Assessment(
                id=a_data["id"],
                patient_id=p_data["id"],
                date=a_data.get("date"),
                summary=a_data.get("summary"),
                overall_notes=a_data.get("overall_notes"),  # already encrypted
                highlight_state=a_data.get("highlight_state"),
                posture_analysis=a_data.get("posture_analysis"),
                created_by=a_data.get("created_by", str(user.id)),
            )
            db.add(assessment)

            for s_data in a_data.get("selections", []):
                selection = Selection(
                    id=s_data["id"],
                    assessment_id=a_data["id"],
                    mesh_id=s_data["mesh_id"],
                    tissue=s_data.get("tissue"),
                    region=s_data.get("region"),
                    region_key=s_data.get("region_key"),
                    side=s_data.get("side"),
                    severity=s_data.get("severity", "normal"),
                    concern=s_data.get("concern", False),
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
