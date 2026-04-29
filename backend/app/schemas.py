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
    source_task_id: int | None = None
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


class ProviderProfileBase(BaseModel):
    provider_name: str = Field(min_length=2, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    base_url: str = Field(min_length=5, max_length=255)
    model_name: str = Field(min_length=1, max_length=150)
    adapter_kind: str = "openai_compatible"
    capabilities: list[str] = Field(default_factory=lambda: ["image.generate"])
    quality: str = "medium"
    output_format: str = "png"
    timeout_seconds: float = 90.0
    enabled: bool = True
    reference_mode: str = "disabled"
    reference_caption_model: str | None = None


class ProviderProfileCreate(ProviderProfileBase):
    api_key: str = Field(min_length=1)


class ProviderProfileUpdate(BaseModel):
    api_key: str | None = None
    base_url: str | None = Field(default=None, min_length=5, max_length=255)
    model_name: str | None = Field(default=None, min_length=1, max_length=150)
    adapter_kind: str | None = None
    capabilities: list[str] | None = None
    quality: str | None = None
    output_format: str | None = None
    timeout_seconds: float | None = None
    enabled: bool | None = None
    reference_mode: str | None = None
    reference_caption_model: str | None = None


class ProviderProfileOut(ProviderProfileBase):
    id: int
    has_api_key: bool
    masked_api_key: str
    created_at: datetime
    updated_at: datetime


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


class PromptTemplateBase(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=150)
    prompt: str = Field(min_length=1)
    style: str = "modern"
    aspect_ratio: str = "16:9"
    resolution: str = "2k"
    deliverable: str = ""
    notes: str = ""


class PromptTemplateCreate(PromptTemplateBase):
    pass


class PromptTemplateUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=100)
    title: str | None = Field(default=None, min_length=1, max_length=150)
    prompt: str | None = Field(default=None, min_length=1)
    style: str | None = None
    aspect_ratio: str | None = None
    resolution: str | None = None
    deliverable: str | None = None
    notes: str | None = None


class PromptTemplateOut(PromptTemplateBase):
    id: int
    user_name: str
    created_at: datetime
    updated_at: datetime


class ReferenceUploadIn(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    data_url: str = Field(min_length=20)


class ReferenceUploadOut(BaseModel):
    file_name: str
    storage_path: str
