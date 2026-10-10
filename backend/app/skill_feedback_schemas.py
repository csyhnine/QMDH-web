from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, ConfigDict, field_validator

CommunicationStatus = Literal["pending_reply", "replied"]
ImprovementStatus = Literal["pending_analysis", "pending_modification", "pending_verification", "resolved"]


class SkillEventIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    event_id: str = Field(min_length=1, max_length=150)
    correlation_id: str = Field(min_length=1, max_length=150)
    platform: Literal["workbuddy", "codex", "other"]
    skill_name: str = Field(min_length=1, max_length=150)
    skill_version: str = Field(min_length=1, max_length=100)
    source: Literal["human", "system", "ai_inference"]
    event_type: Literal["execution", "evaluation", "delivery", "user_correction", "problem", "retest"]
    problem_code: str = Field(default="", max_length=100, pattern=r"^[a-z0-9_.-]*$")
    summary: str = Field(default="", max_length=4000)
    evidence: list[dict] = Field(default_factory=list, max_length=20)
    evaluation: dict = Field(default_factory=dict)
    occurred_at: datetime

    @field_validator("occurred_at")
    @classmethod
    def aware_time(cls, value):
        if value.tzinfo is None:
            raise ValueError("occurred_at must include timezone")
        return value


class SkillIssueUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    communication_status: CommunicationStatus | None = None
    improvement_status: ImprovementStatus | None = None
    root_cause: str | None = Field(default=None, max_length=8000)
    modification_suggestion: str | None = Field(default=None, max_length=8000)
    retest_result: str | None = Field(default=None, max_length=8000)
    admin_reply: str | None = Field(default=None, max_length=4000)
