from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel


class SelectionData(BaseModel):
    mesh_id: str
    tissue: Optional[str] = None
    region: Optional[str] = None
    region_key: Optional[str] = None
    side: Optional[str] = None
    severity: str = "normal"
    concern: bool = False
    notes: Optional[str] = None


class SelectionOut(SelectionData):
    id: str

    model_config = {"from_attributes": True}


class AssessmentCreate(BaseModel):
    date: Optional[datetime] = None
    summary: Optional[str] = None
    overall_notes: Optional[str] = None


class AssessmentUpdate(BaseModel):
    summary: Optional[str] = None
    overall_notes: Optional[str] = None
    posture_analysis: Optional[dict[str, Any]] = None


class AssessmentOut(BaseModel):
    id: str
    patient_id: str
    date: datetime
    summary: Optional[str] = None
    overall_notes: Optional[str] = None
    highlight_state: Optional[Any] = None
    posture_analysis: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    selections: list[SelectionOut] = []
    has_photo: bool = False

    model_config = {"from_attributes": True}


class AssessmentBrief(BaseModel):
    id: str
    date: datetime
    summary: Optional[str] = None
    selection_count: int = 0
    has_photo: bool = False

    model_config = {"from_attributes": True}


class SelectionsUpsertRequest(BaseModel):
    selections: list[SelectionData]


class HighlightStateRequest(BaseModel):
    highlight_state: Any
