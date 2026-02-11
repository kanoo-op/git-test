from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.user import User
from ..schemas.auth import (
    LoginRequest, RegisterRequest, TokenResponse, RefreshRequest,
    PasswordChangeRequest, UserBrief,
)
from ..services.auth_service import (
    authenticate_user, create_access_token, create_refresh_token,
    validate_refresh_token, hash_password, verify_password,
    revoke_all_user_tokens,
)
from ..services.audit_service import log_action
from .deps import get_current_user, require_role, get_client_ip

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user = await authenticate_user(db, body.username, body.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    access = create_access_token(user)
    refresh = await create_refresh_token(db, user)

    await log_action(db, user.id, "login", "auth", ip_address=get_client_ip(request))

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=UserBrief(id=str(user.id), username=user.username, full_name=user.full_name, role=user.role),
    )


@router.post("/register", response_model=UserBrief)
async def register(
    body: RegisterRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_role("admin"))],
):
    if body.role not in ("admin", "doctor", "therapist", "nurse"):
        raise HTTPException(status_code=400, detail="Invalid role")

    from sqlalchemy import select
    existing = await db.execute(select(User).where((User.username == body.username) | (User.email == body.email)))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username or email already exists")

    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    await log_action(db, admin.id, "create", "user", str(user.id), ip_address=get_client_ip(request))

    return UserBrief(id=str(user.id), username=user.username, full_name=user.full_name, role=user.role)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user = await validate_refresh_token(db, body.refresh_token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    access = create_access_token(user)
    new_refresh = await create_refresh_token(db, user)

    return TokenResponse(
        access_token=access,
        refresh_token=new_refresh,
        user=UserBrief(id=str(user.id), username=user.username, full_name=user.full_name, role=user.role),
    )


@router.post("/logout")
async def logout(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    await revoke_all_user_tokens(db, user.id)
    await log_action(db, user.id, "logout", "auth", ip_address=get_client_ip(request))
    return {"detail": "Logged out"}


@router.put("/password")
async def change_password(
    body: PasswordChangeRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user.password_hash = hash_password(body.new_password)
    await db.commit()
    await revoke_all_user_tokens(db, user.id)

    await log_action(db, user.id, "password_change", "auth", ip_address=get_client_ip(request))

    return {"detail": "Password changed. Please log in again."}


@router.get("/me", response_model=UserBrief)
async def me(user: Annotated[User, Depends(get_current_user)]):
    return UserBrief(id=str(user.id), username=user.username, full_name=user.full_name, role=user.role)
