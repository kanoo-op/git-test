from typing import Any

from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_patients: int
    total_assessments: int
    today_assessments: int
    severity_counts: dict[str, int]
    recent_assessments: list[dict[str, Any]]
    recent_patients: list[dict[str, Any]]
