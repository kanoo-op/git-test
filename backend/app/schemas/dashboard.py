from typing import Any, Optional

from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_patients: int
    total_assessments: int
    today_assessments: int
    severity_counts: dict[str, int]
    recent_assessments: list[dict[str, Any]]
    recent_patients: list[dict[str, Any]]
    # Patient app aggregate data
    total_checkins: int = 0
    total_workouts: int = 0
    total_pain_logs: int = 0
    avg_pain_7d: Optional[float] = None
    completion_rate_7d: Optional[float] = None
    active_app_patients: int = 0
    recent_app_activity: list[dict[str, Any]] = []
