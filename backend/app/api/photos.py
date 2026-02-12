import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import get_db
from ..services.encryption_service import encrypt_bytes, decrypt_bytes
from ..models.assessment import Assessment
from ..models.photo import PosturePhoto
from ..models.user import User
from .deps import get_current_user, require_min_role

router = APIRouter(
    prefix="/api/patients/{patient_id}/assessments/{assessment_id}/photo",
    tags=["photos"],
)

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.post("", status_code=201)
async def upload_photo(
    patient_id: uuid.UUID,
    assessment_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_min_role("therapist")),
):
    # Validate MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_MIME_TYPES)}")

    # Check Content-Length header before reading full file into memory
    if file.size is not None and file.size > settings.MAX_PHOTO_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Max {settings.MAX_PHOTO_SIZE // (1024*1024)}MB")

    # Read data in chunks to prevent memory exhaustion
    max_size = settings.MAX_PHOTO_SIZE
    chunks = []
    total = 0
    while True:
        chunk = await file.read(1024 * 256)  # 256KB chunks
        if not chunk:
            break
        total += len(chunk)
        if total > max_size:
            raise HTTPException(status_code=400, detail=f"File too large. Max {max_size // (1024*1024)}MB")
        chunks.append(chunk)
    data = b"".join(chunks)

    # Verify assessment exists
    result = await db.execute(
        select(Assessment).where(Assessment.id == assessment_id, Assessment.patient_id == patient_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Encrypt photo data before storage
    encrypted_data = encrypt_bytes(data)

    # Upsert photo
    result = await db.execute(select(PosturePhoto).where(PosturePhoto.assessment_id == assessment_id))
    existing = result.scalar_one_or_none()

    if existing:
        existing.data = encrypted_data
        existing.mime_type = file.content_type
        existing.file_size = len(data)
    else:
        photo = PosturePhoto(
            assessment_id=assessment_id,
            data=encrypted_data,
            mime_type=file.content_type,
            file_size=len(data),
        )
        db.add(photo)

    await db.commit()
    return {"detail": "Photo uploaded", "size": len(data)}


@router.get("")
async def get_photo(
    patient_id: uuid.UUID,
    assessment_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(select(PosturePhoto).where(PosturePhoto.assessment_id == assessment_id))
    photo = result.scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    return Response(content=decrypt_bytes(photo.data), media_type=photo.mime_type)


@router.delete("")
async def delete_photo(
    patient_id: uuid.UUID,
    assessment_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_min_role("therapist"))],
):
    result = await db.execute(select(PosturePhoto).where(PosturePhoto.assessment_id == assessment_id))
    photo = result.scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    await db.delete(photo)
    await db.commit()
    return {"detail": "Photo deleted"}
