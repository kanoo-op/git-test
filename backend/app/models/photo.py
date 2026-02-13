import uuid

from sqlalchemy import String, Integer, ForeignKey, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class PosturePhoto(Base):
    __tablename__ = "posture_photos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"), unique=True, nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False, default="image/jpeg")
    file_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    assessment: Mapped["Assessment"] = relationship(back_populates="photo")


from .assessment import Assessment  # noqa: E402, F401
