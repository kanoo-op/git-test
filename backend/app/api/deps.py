import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.user import User
from ..services.auth_service import decode_access_token

security = HTTPBearer()

ROLE_HIERARCHY = {"admin": 4, "doctor": 3, "therapist": 2, "nurse": 1}


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return user


def require_role(*roles: str):
    """Dependency factory: require user to have one of specified roles."""
    async def _check(user: Annotated[User, Depends(get_current_user)]):
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return _check


def require_min_role(min_role: str):
    """Require user role to be at least as high as min_role in hierarchy."""
    async def _check(user: Annotated[User, Depends(get_current_user)]):
        user_level = ROLE_HIERARCHY.get(user.role, 0)
        min_level = ROLE_HIERARCHY.get(min_role, 0)
        if user_level < min_level:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return _check


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
