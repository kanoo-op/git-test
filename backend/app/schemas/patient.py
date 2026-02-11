from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel


class PatientCreate(BaseModel):
    name: str
    dob: Optional[date] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    diagnosis: Optional[str] = None
    medical_history: Optional[str] = None
    occupation: Optional[str] = None
    notes: Optional[str] = None


class PatientUpdate(PatientCreate):
    name: Optional[str] = None


class PatientOut(BaseModel):
    id: str
    name: str
    dob: Optional[date] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    diagnosis: Optional[str] = None
    medical_history: Optional[str] = None
    occupation: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    assessment_count: int = 0

    model_config = {"from_attributes": True}


class PatientListResponse(BaseModel):
    items: list[PatientOut]
    total: int
    page: int
    limit: int
