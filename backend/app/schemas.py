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


class TaskDeleteIn(BaseModel):
    reason: str = ""


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
    cost_currency: str = "CNY"
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
    bookmark_count: int = 0
    is_bookmarked: bool = False
    tags: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class DashboardDailyPoint(BaseModel):
    """UTC calendar day bucket for dashboard charts."""

    date: str
    total_tasks: int = 0
    successful_tasks: int = 0
    failed_tasks: int = 0
    total_cost: float = 0.0


class DashboardModelCallSlice(BaseModel):
    model_name: str
    count: int


class DashboardDayModelCalls(BaseModel):
    date: str
    slices: list[DashboardModelCallSlice] = Field(default_factory=list)


class DashboardStats(BaseModel):
    active_workflows: int
    total_tasks: int
    successful_tasks: int
    failed_tasks: int = 0
    success_rate: float
    average_cost: float
    average_latency_ms: float
    audit_coverage_rate: float
    outbound_tasks: int
    total_cost: float = 0.0
    cost_unit: str = "CNY"
    cost_formula: str = ""
    cost_notes: list[str] = Field(default_factory=list)
    cost_by_currency: list[dict[str, Any]] = Field(default_factory=list)
    user_rankings: list[dict[str, Any]] = Field(default_factory=list)
    project_rankings: list[dict[str, Any]] = Field(default_factory=list)
    provider_rankings: list[dict[str, Any]] = Field(default_factory=list)
    model_rankings: list[dict[str, Any]] = Field(default_factory=list)
    failure_reasons: list[dict[str, Any]] = Field(default_factory=list)
    account_usage: list[dict[str, Any]] = Field(default_factory=list)
    daily_series: list[DashboardDailyPoint] = Field(default_factory=list)
    model_calls_by_day: list[DashboardDayModelCalls] = Field(default_factory=list)


class AuthLoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class AuthUserOut(BaseModel):
    id: int
    name: str
    display_name: str
    role: str
    project_codes: list[str]
    is_active: bool
    monthly_quota: float | None = None


class AuthLoginOut(BaseModel):
    token: str
    expires_at: datetime
    user: AuthUserOut


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=6, max_length=200)
    display_name: str = Field(default="", max_length=150)
    role: str = "designer"
    project_codes: list[str] = Field(default_factory=lambda: ["QMDH-001"])
    is_active: bool = True
    monthly_quota: float | None = Field(default=None, ge=0)


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=150)
    role: str | None = None
    project_codes: list[str] | None = None
    is_active: bool | None = None
    monthly_quota: float | None = Field(default=None, ge=0)


class UserPasswordReset(BaseModel):
    password: str = Field(min_length=6, max_length=200)


class UserOut(AuthUserOut):
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None


class ProviderCapability(BaseModel):
    provider_name: str
    model_name: str
    capabilities: list[str]
    configurable: bool
    outbound: bool
    adapter_kind: str


class ProviderProfileBase(BaseModel):
    provider_name: str = Field(min_length=2, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    base_url: str = Field(min_length=5, max_length=255)
    model_name: str = Field(min_length=1, max_length=150)
    adapter_kind: str = "openai_compatible"
    capabilities: list[str] = Field(default_factory=lambda: ["image.generate"])
    quality: str = "medium"
    output_format: str = "png"
    timeout_seconds: float = 90.0
    pricing_currency: str = Field(default="CNY", max_length=12)
    pricing_unit: str = "per_image"
    unit_price: float = Field(default=0.0, ge=0)
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
    editable_api_key: str | None = None
    created_at: datetime
    updated_at: datetime


class ProviderProfileProbeOut(BaseModel):
    ok: bool
    status: str
    detail: str
    checked_url: str | None = None
    checked_at: datetime


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


class ProjectMemberOut(BaseModel):
    id: int
    name: str
    display_name: str
    role: str
    is_global: bool = False


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


class ProviderDiscoverIn(BaseModel):
    base_url: str = Field(min_length=5, max_length=255)
    api_key: str = Field(min_length=1)


class DiscoveredModel(BaseModel):
    model_id: str
    owned_by: str = ""
    already_exists: bool = False


class ProviderDiscoverOut(BaseModel):
    base_url: str
    models: list[DiscoveredModel]


class ProviderBulkImportItem(BaseModel):
    model_id: str
    provider_name: str = Field(min_length=2, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    capabilities: list[str] = Field(default_factory=lambda: ["image.generate"])
    adapter_kind: str = "openai_compatible"
    reference_mode: str = "disabled"


class ProviderBulkImportIn(BaseModel):
    base_url: str = Field(min_length=5, max_length=255)
    api_key: str = Field(min_length=1)
    models: list[ProviderBulkImportItem]


class ProviderBulkImportOut(BaseModel):
    created: list[str]
    skipped: list[str]


class InspirationPostOut(BaseModel):
    id: int
    title: str
    description: str
    image_path: str
    category: str
    tags: list[str]
    source_type: str
    source_name: str
    source_url: str
    prompt_text: str | None = None
    model_name: str
    like_count: int
    view_count: int
    user_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InspirationPostCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    image_path: str = ""
    category: str = "建筑"
    tags: list[str] = Field(default_factory=list)
    source_type: str = "external"
    source_name: str = ""
    source_url: str = ""
    source_asset_id: int | None = None
    prompt_text: str | None = None
    model_name: str = ""


class InspirationPostUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    image_path: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    source_url: str | None = None
    source_name: str | None = None


class ExtractImagesIn(BaseModel):
    url: str = Field(min_length=10, max_length=2000)


class ExtractImagesOut(BaseModel):
    images: list[str] = Field(default_factory=list)
    title: str = ""


class ChatModelOut(BaseModel):
    provider_id: int
    provider_name: str
    model_name: str
    base_url: str


class ConversationCreate(BaseModel):
    model_provider_id: int
    title: str = ""


class ConversationOut(BaseModel):
    id: int
    title: str
    model_provider_id: int | None = None
    created_at: datetime
    updated_at: datetime


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1)


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime
