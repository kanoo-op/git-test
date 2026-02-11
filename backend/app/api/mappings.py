from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.mapping import Mapping, MeshName
from ..models.user import User
from .deps import get_current_user

router = APIRouter(prefix="/api/mappings", tags=["mappings"])


class MappingCreate(BaseModel):
    name: str = "default"
    data: dict[str, Any]
    description: str | None = None


class MappingOut(BaseModel):
    id: str
    name: str
    data: dict[str, Any]
    description: str | None = None

    model_config = {"from_attributes": True}


class MeshNameData(BaseModel):
    mesh_id: str
    custom_name: str


@router.get("", response_model=list[MappingOut])
async def list_mappings(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(select(Mapping))
    return [
        MappingOut(id=str(m.id), name=m.name, data=m.data, description=m.description)
        for m in result.scalars()
    ]


@router.post("", response_model=MappingOut, status_code=201)
async def save_mapping(
    body: MappingCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    # Upsert by name
    result = await db.execute(select(Mapping).where(Mapping.name == body.name))
    existing = result.scalar_one_or_none()

    if existing:
        existing.data = body.data
        existing.description = body.description
        await db.commit()
        await db.refresh(existing)
        return MappingOut(id=str(existing.id), name=existing.name, data=existing.data, description=existing.description)

    mapping = Mapping(name=body.name, data=body.data, description=body.description)
    db.add(mapping)
    await db.commit()
    await db.refresh(mapping)
    return MappingOut(id=str(mapping.id), name=mapping.name, data=mapping.data, description=mapping.description)


@router.get("/mesh-names", response_model=dict[str, str])
async def get_mesh_names(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(select(MeshName))
    return {m.mesh_id: m.custom_name for m in result.scalars()}


@router.put("/mesh-names")
async def set_mesh_name(
    body: MeshNameData,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(select(MeshName).where(MeshName.mesh_id == body.mesh_id))
    existing = result.scalar_one_or_none()
    if existing:
        existing.custom_name = body.custom_name
    else:
        db.add(MeshName(mesh_id=body.mesh_id, custom_name=body.custom_name))
    await db.commit()
    return {"detail": "Mesh name saved"}
