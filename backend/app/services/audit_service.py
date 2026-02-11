import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.audit import AuditLog


async def log_action(
    db: AsyncSession,
    user_id: uuid.UUID | None,
    action: str,
    resource: str,
    resource_id: str | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
):
    entry = AuditLog(
        user_id=user_id,
        action=action,
        resource=resource,
        resource_id=resource_id,
        details=details,
        ip_address=ip_address,
    )
    db.add(entry)
    await db.commit()
