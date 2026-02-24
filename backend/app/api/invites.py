"""Invites API - 치료사가 환자 초대 코드 생성/조회"""

import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.user import User
from ..models.patient import Patient
from ..models.portal import PatientInvite
from ..schemas.portal import InviteResponse
from .deps import get_current_user, require_min_role

router = APIRouter(prefix="/api/patients", tags=["invites"])


def generate_invite_code(length=6) -> str:
    chars = string.ascii_uppercase + string.digits
    # Exclude ambiguous characters
    chars = chars.replace("O", "").replace("0", "").replace("I", "").replace("1", "").replace("L", "")
    return "".join(secrets.choice(chars) for _ in range(length))


@router.post("/{patient_id}/invites", response_model=InviteResponse)
async def create_invite(
    patient_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
):
    # Verify patient exists
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Patient not found")

    # Generate unique code
    for _ in range(10):
        code = generate_invite_code()
        existing = await db.execute(select(PatientInvite).where(PatientInvite.invite_code == code))
        if not existing.scalar_one_or_none():
            break
    else:
        raise HTTPException(status_code=500, detail="Failed to generate unique code")

    invite = PatientInvite(
        patient_id=patient_id,
        invite_code=code,
        created_by=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=72),
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    return InviteResponse(
        id=invite.id,
        invite_code=invite.invite_code,
        patient_id=invite.patient_id,
        expires_at=invite.expires_at.isoformat(),
    )


@router.get("/{patient_id}/invites", response_model=list[InviteResponse])
async def list_invites(
    patient_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
):
    result = await db.execute(
        select(PatientInvite)
        .where(PatientInvite.patient_id == patient_id)
        .order_by(PatientInvite.created_at.desc())
    )
    invites = result.scalars().all()

    return [
        InviteResponse(
            id=inv.id,
            invite_code=inv.invite_code,
            patient_id=inv.patient_id,
            expires_at=inv.expires_at.isoformat(),
            used_at=inv.used_at.isoformat() if inv.used_at else None,
        )
        for inv in invites
    ]
