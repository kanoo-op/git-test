"""Portal Auth - 환자 앱 초대코드 검증 + 계정 생성"""

import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.user import User
from ..models.patient import Patient
from ..models.portal import PatientInvite, PatientLink
from ..schemas.portal import ValidateCodeRequest, ValidateCodeResponse, PortalRegisterRequest
from ..schemas.auth import TokenResponse, UserBrief
from ..services.auth_service import hash_password, create_access_token, create_refresh_token

router = APIRouter(prefix="/api/portal/auth", tags=["portal-auth"])


@router.post("/validate-code", response_model=ValidateCodeResponse)
async def validate_invite_code(
    body: ValidateCodeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(PatientInvite).where(
            PatientInvite.invite_code == body.invite_code.upper(),
            PatientInvite.used_at.is_(None),
            PatientInvite.expires_at > datetime.now(timezone.utc),
        )
    )
    invite = result.scalar_one_or_none()
    if not invite:
        return ValidateCodeResponse(valid=False)

    # Get patient name
    result = await db.execute(select(Patient).where(Patient.id == invite.patient_id))
    patient = result.scalar_one_or_none()

    return ValidateCodeResponse(valid=True, patient_name=patient.name if patient else None)


@router.post("/register", response_model=TokenResponse)
async def register_with_invite(
    body: PortalRegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Validate invite code
    result = await db.execute(
        select(PatientInvite).where(
            PatientInvite.invite_code == body.invite_code.upper(),
            PatientInvite.used_at.is_(None),
            PatientInvite.expires_at > datetime.now(timezone.utc),
        )
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid or expired invite code")

    # Check username uniqueness
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")

    # Check if patient already linked
    existing_link = await db.execute(
        select(PatientLink).where(PatientLink.patient_id == invite.patient_id)
    )
    if existing_link.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Patient already has an account")

    # Create user
    user = User(
        username=body.username,
        email=f"{body.username}@patient.postureview.local",
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role="patient",
    )
    db.add(user)
    await db.flush()

    # Link user to patient
    link = PatientLink(user_id=user.id, patient_id=invite.patient_id)
    db.add(link)

    # Mark invite as used
    invite.used_at = datetime.now(timezone.utc)
    invite.used_by = user.id

    await db.commit()
    await db.refresh(user)

    # Generate tokens
    access = create_access_token(user)
    refresh = await create_refresh_token(db, user)

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=UserBrief(id=str(user.id), username=user.username, full_name=user.full_name, role=user.role),
    )
