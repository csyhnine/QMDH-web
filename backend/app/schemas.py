from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models import AssetType, DataClassification, TaskStatus


class WorkflowOut(BaseModel):
    id: int
    key: str
    name: str
    description: str
    category: str
    priority: str
    version: str
    provider_capability: str
    config: dict[str, Any]

    model_config = {"from_attributes": True}


class TaskCreate(BaseModel):
    title: str = Field(min_length=3, max_length=150)
    workflow_key: str
    project_code: str
    user_name: str = "reviewer"
    requested_provider: str
    classification: DataClassification = DataClassification.b
    payload: dict[str, Any] = Field(default_factory=dict)


class TaskOut(BaseModel):
    id: int
    title: str
    status: TaskStatus
    workflow_key: str
    workflow_name: str
    project_code: str
    user_name: str
    requested_provider: str
    classification: DataClassification
    cost: float
    latency_ms: int
    result: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class AssetOut(BaseModel):
    id: int
    name: str
    asset_type: AssetType
    storage_path: str
    prompt_text: str | None
    like_count: int
    share_count: int
    tags: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class DashboardStats(BaseModel):
    active_workflows: int
    total_tasks: int
    successful_tasks: int
    success_rate: float
    average_cost: float
    average_latency_ms: float
    audit_coverage_rate: float
    outbound_tasks: int


class ProviderCapability(BaseModel):
    provider_name: str
    model_name: str
    capabilities: list[str]
    configurable: bool
    outbound: bool


class ProjectOut(BaseModel):
    id: int
    name: str
    code: str
    classification: DataClassification
    current_phase: str | None = None
    phase_status: str | None = None
    last_updated: str | None = None
    summary: str | None = None
    next_action: str | None = None

    model_config = {"from_attributes": True}


class ProjectMilestoneOut(BaseModel):
    id: str
    name: str
    title: str
    status: str
    owner: str
    target_date: str
    notes: str


class ProjectStatusOut(BaseModel):
    code: str
    name: str
    current_phase: str | None = None
    phase_status: str | None = None
    last_updated: str | None = None
    goals: list[str] = Field(default_factory=list)
    progress: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    decisions: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    status_file: str
    milestones_file: str
    milestones: list[ProjectMilestoneOut] = Field(default_factory=list)
