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

    @field_validator("evidence", "evaluation")
    @classmethod
    def bounded_structure(cls, value):
        def inspect(node, depth=0):
            if depth > 8:
                raise ValueError("Evidence structure exceeds 8 levels")
            if isinstance(node, dict):
                if len(node) > 50 or any(len(key) > 150 for key in node):
                    raise ValueError("Evidence has too many or oversized keys")
                for child in node.values():
                    inspect(child, depth + 1)
            elif isinstance(node, list):
                if len(node) > 100:
                    raise ValueError("Evidence array exceeds 100 entries")
                for child in node:
                    inspect(child, depth + 1)
            elif isinstance(node, str) and len(node) > 8000:
                raise ValueError("Evidence text exceeds 8000 characters")
        inspect(value)
        return value


class FeedbackSkillScope(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    skill_name: str = Field(min_length=1, max_length=150)
    skill_version: str = Field(min_length=1, max_length=100)


class FeedbackCredentialCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    owner_id: int = Field(gt=0)
    device_name: str = Field(min_length=1, max_length=150)
    allowed_skills: list[FeedbackSkillScope] = Field(min_length=1, max_length=20)
    expires_in_days: int = Field(default=30, ge=1, le=90)
    per_minute: int = Field(default=30, ge=1, le=60)
    per_day: int = Field(default=500, ge=1, le=2000)


class FeedbackEventReview(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    review_status: Literal["accepted", "rejected"]
    review_note: str = Field(min_length=1, max_length=2000)


class SkillIssueUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    communication_status: CommunicationStatus | None = None
    improvement_status: ImprovementStatus | None = None
    root_cause: str | None = Field(default=None, max_length=8000)
    modification_suggestion: str | None = Field(default=None, max_length=8000)
    retest_result: str | None = Field(default=None, max_length=8000)
    admin_reply: str | None = Field(default=None, max_length=4000)
