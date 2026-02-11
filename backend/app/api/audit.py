from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.audit import AuditLog
from ..models.user import User
from .deps import require_role

router = APIRouter(prefix="/api/audit", tags=["audit"])


class AuditLogOut(BaseModel):
    id: int
    user_id: str | None
    action: str
    resource: str
    resource_id: str | None
    details: dict[str, Any] | None
    ip_address: str | None
    created_at: str

    model_config = {"from_attributes": True}


class AuditListResponse(BaseModel):
    items: list[AuditLogOut]
    total: int


@router.get("", response_model=AuditListResponse)
async def list_audit_logs(
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_role("admin"))],
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    action: str | None = None,
    resource: str | None = None,
):
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))

    if action:
        query = query.where(AuditLog.action == action)
        count_query = count_query.where(AuditLog.action == action)
    if resource:
        query = query.where(AuditLog.resource == resource)
        count_query = count_query.where(AuditLog.resource == resource)

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (page - 1) * limit
    query = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    items = [
        AuditLogOut(
            id=log.id,
            user_id=str(log.user_id) if log.user_id else None,
            action=log.action,
            resource=log.resource,
            resource_id=log.resource_id,
            details=log.details,
            ip_address=log.ip_address,
            created_at=log.created_at.isoformat(),
        )
        for log in result.scalars()
    ]

    return AuditListResponse(items=items, total=total)
