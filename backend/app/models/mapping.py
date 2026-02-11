import uuid

from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Mapping(Base):
    __tablename__ = "mappings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False, default="default")
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class MeshName(Base):
    __tablename__ = "mesh_names"

    mesh_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    custom_name: Mapped[str] = mapped_column(String(255), nullable=False)
