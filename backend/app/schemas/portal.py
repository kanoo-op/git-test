from pydantic import BaseModel
from typing import Optional


# ═══ Invite ═══

class InviteCreate(BaseModel):
    """치료사가 초대 코드 생성 요청"""
    pass  # patient_id는 URL path에서


class InviteResponse(BaseModel):
    id: str
    invite_code: str
    patient_id: str
    expires_at: str
    used_at: Optional[str] = None

    model_config = {"from_attributes": True}


# ═══ Portal Auth ═══

class ValidateCodeRequest(BaseModel):
    invite_code: str


class ValidateCodeResponse(BaseModel):
    valid: bool
    patient_name: Optional[str] = None


class PortalRegisterRequest(BaseModel):
    invite_code: str
    username: str
    password: str
    full_name: str


# ═══ Portal Me ═══

class PortalMeResponse(BaseModel):
    user_id: str
    username: str
    full_name: str
    patient_id: str
    patient_name: str


# ═══ Prescription ═══

class PrescriptionCreate(BaseModel):
    name: str = "처방 프로그램"
    weekly_plan: list  # JSON-serializable list
    notes: Optional[str] = None


class PrescriptionUpdate(BaseModel):
    name: Optional[str] = None
    weekly_plan: Optional[list] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class PrescriptionResponse(BaseModel):
    id: str
    patient_id: str
    name: str
    weekly_plan: list
    notes: Optional[str] = None
    is_active: bool
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


# ═══ Sync (환자→서버) ═══

class SyncCheckinItem(BaseModel):
    local_id: str
    date: str
    timestamp: Optional[str] = None
    pre_pain_score: Optional[float] = None
    post_pain_score: Optional[float] = None
    rpe: Optional[str] = None
    routine_completed: bool = False
    exercises_completed: Optional[list] = None
    total_duration: int = 0


class SyncWorkoutItem(BaseModel):
    local_id: str
    date: str
    duration: int = 0
    rpe: Optional[str] = None
    exercises: Optional[list] = None


class SyncPainLogItem(BaseModel):
    local_id: str
    date: str
    region_key: str
    pain_level: int
    note: Optional[str] = None


class SyncRequest(BaseModel):
    items: list


class SyncResponse(BaseModel):
    synced: int
    duplicates: int


# ═══ Patient Progress (병원에서 조회) ═══

class ProgressSummary(BaseModel):
    total_checkins: int
    total_workouts: int
    total_pain_logs: int
    avg_pain_7d: Optional[float] = None
    completion_rate_7d: Optional[float] = None
    last_sync: Optional[str] = None
