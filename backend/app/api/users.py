import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.user import User
from ..schemas.user import UserOut, UserUpdate
from .deps import get_current_user, require_role

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_role("admin"))],
):
    result = await db.execute(select(User).order_by(User.created_at))
    return [
        UserOut(
            id=str(u.id),
            username=u.username,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at,
            last_login_at=u.last_login_at,
        )
        for u in result.scalars()
    ]


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_role("admin"))],
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = body.model_dump(exclude_unset=True)
    if "role" in update_data and update_data["role"] not in ("admin", "doctor", "therapist", "nurse"):
        raise HTTPException(status_code=400, detail="Invalid role")

    for key, value in update_data.items():
        setattr(user, key, value)
    await db.commit()
    await db.refresh(user)

    return UserOut(
        id=str(user.id),
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


@router.delete("/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_role("admin"))],
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(user)
    await db.commit()
    return {"detail": "User deleted"}
