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
    inspiration_post_id: int | None = None
    is_shared_to_inspiration: bool = False
    tags: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class AssetShareOut(BaseModel):
    asset: AssetOut
    inspiration_post_id: int
    already_shared: bool


class AssetShareIn(BaseModel):
    confirmed: bool = False


class DashboardDailyPoint(BaseModel):
    date: str
    total_tasks: int = 0
    successful_tasks: int = 0
    failed_tasks: int = 0
    total_cost: float = 0.0
    image_generate_count: int = 0
    image_edit_count: int = 0
    video_generate_count: int = 0
    chat_turn_count: int = 0
    image_output_count: int = 0
    chat_input_tokens: int = 0
    chat_output_tokens: int = 0
    chat_cached_input_tokens: int = 0
    chat_total_tokens: int = 0


class DashboardModelCallSlice(BaseModel):
    model_name: str
    count: int


class DashboardDayModelCalls(BaseModel):
    date: str
    slices: list[DashboardModelCallSlice] = Field(default_factory=list)


class DashboardExecutionRanking(BaseModel):
    user_name: str
    image_generate_count: int = 0
    image_edit_count: int = 0
    video_generate_count: int = 0
    image_output_count: int = 0
    chat_turn_count: int = 0
    chat_input_tokens: int = 0
    chat_output_tokens: int = 0
    chat_cached_input_tokens: int = 0
    chat_prompt_tokens: int = 0
    chat_completion_tokens: int = 0
    chat_total_tokens: int = 0
    last_activity_at: datetime | None = None


class DashboardCurrencySpend(BaseModel):
    currency: str
    total_cost: float = 0.0


class DashboardAccountUsage(BaseModel):
    name: str
    display_name: str
    group_name: str = ""
    role: str
    is_active: bool
    project_codes: list[str] = Field(default_factory=list)
    quota_limit: float | None = None
    quota_used: float = 0.0
    quota_currency: str = "CNY"
    quota_remaining: float | None = None
    quota_status: str = "ok"
    billing_plan: str = "standard"
    billing_status: str = "active"
    quota_policy: str = "soft_warn"
    quota_reset_cycle: str = "monthly"
    total_tasks: int = 0
    successful_tasks: int = 0
    failed_tasks: int = 0
    success_rate: float = 0.0
    average_latency_ms: float = 0.0
    provider_calls: list[dict[str, Any]] = Field(default_factory=list)
    model_calls: list[dict[str, Any]] = Field(default_factory=list)
    cost_by_currency: list[DashboardCurrencySpend] = Field(default_factory=list)
    last_task_at: datetime | None = None
    last_activity_at: datetime | None = None
    image_generate_count: int = 0
    image_edit_count: int = 0
    video_generate_count: int = 0
    image_output_count: int = 0
    chat_turn_count: int = 0
    chat_input_tokens: int = 0
    chat_output_tokens: int = 0
    chat_cached_input_tokens: int = 0
    chat_prompt_tokens: int = 0
    chat_completion_tokens: int = 0
    chat_total_tokens: int = 0


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
    account_usage: list[DashboardAccountUsage] = Field(default_factory=list)
    daily_series: list[DashboardDailyPoint] = Field(default_factory=list)
    model_calls_by_day: list[DashboardDayModelCalls] = Field(default_factory=list)
    today_image_generate_count: int = 0
    week_image_generate_count: int = 0
    today_video_generate_count: int = 0
    week_video_generate_count: int = 0
    window_chat_turn_count: int = 0
    window_chat_input_tokens: int = 0
    window_chat_output_tokens: int = 0
    window_chat_cached_input_tokens: int = 0
    window_chat_prompt_tokens: int = 0
    window_chat_completion_tokens: int = 0
    window_chat_total_tokens: int = 0
    execution_rankings: list[DashboardExecutionRanking] = Field(default_factory=list)


class UsageLogRecord(BaseModel):
    id: int
    recorded_at: datetime
    user_name: str
    user_display_name: str = ""
    group_name: str = ""
    entry_type: str
    usage_kind: str
    is_success: bool = True
    model_name: str = ""
    provider_name: str = ""
    requested_provider: str = ""
    capability: str = ""
    project_code: str = ""
    project_name: str = ""
    task_id: int | None = None
    task_status: str | None = None
    latency_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cached_input_tokens: int = 0
    total_tokens: int = 0
    output_count: int = 0
    cost: float = 0.0
    cost_currency: str = "CNY"
    billing_unit: str = ""
    billable_units: float = 0.0
    error_code: str = ""
    error_summary: str = ""
    source_table: str = ""
    source_id: int = 0
    detail_text: str = ""


class UsageLogPage(BaseModel):
    items: list[UsageLogRecord] = Field(default_factory=list)
    page: int = 1
    page_size: int = 20
    total: int = 0
    total_pages: int = 0
    window_cost_by_currency: list[DashboardCurrencySpend] = Field(default_factory=list)


class AuthLoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class AuthUserOut(BaseModel):
    id: int
    name: str
    display_name: str
    group_name: str = ""
    role: str
    project_codes: list[str]
    is_active: bool
    monthly_quota: float | None = None
    billing_plan: str = "standard"
    billing_status: str = "active"
    quota_policy: str = "soft_warn"
    quota_reset_cycle: str = "monthly"


class AuthLoginOut(BaseModel):
    token: str
    expires_at: datetime
    user: AuthUserOut


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=6, max_length=200)
    display_name: str = Field(default="", max_length=150)
    group_name: str = Field(default="", max_length=120)
    role: str = "designer"
    is_active: bool = True
    monthly_quota: float | None = Field(default=None, ge=0)
    billing_plan: str = "standard"
    billing_status: str = "active"
    quota_policy: str = "soft_warn"
    quota_reset_cycle: str = "monthly"


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=150)
    group_name: str | None = Field(default=None, max_length=120)
    role: str | None = None
    is_active: bool | None = None
    monthly_quota: float | None = Field(default=None, ge=0)
    billing_plan: str | None = None
    billing_status: str | None = None
    quota_policy: str | None = None
    quota_reset_cycle: str | None = None


class UserPasswordReset(BaseModel):
    password: str = Field(min_length=6, max_length=200)


class UserOut(BaseModel):
    id: int
    name: str
    display_name: str
    group_name: str = ""
    role: str
    is_active: bool
    monthly_quota: float | None = None
    billing_plan: str = "standard"
    billing_status: str = "active"
    quota_policy: str = "soft_warn"
    quota_reset_cycle: str = "monthly"
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None


class UserGroupCurrencySpendOut(BaseModel):
    currency: str
    total_cost: float


class UserGroupMemberSpendOut(BaseModel):
    user_id: int
    user_name: str
    display_name: str
    is_active: bool
    total_cost: float = 0.0
    cost_by_currency: list[UserGroupCurrencySpendOut] = Field(default_factory=list)


class UserGroupSummaryOut(BaseModel):
    group_name: str = ""
    user_count: int = 0
    enabled_user_count: int = 0
    total_cost: float = 0.0
    cost_by_currency: list[UserGroupCurrencySpendOut] = Field(default_factory=list)
    members: list[UserGroupMemberSpendOut] = Field(default_factory=list)


class UserFeedbackCreate(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    message: str = Field(min_length=4, max_length=4000)
    attachment_paths: list[str] = Field(default_factory=list, max_length=6)


class UserFeedbackAdminUpdate(BaseModel):
    status: str = Field(default="replied", pattern=r"^(open|replied|closed)$")
    admin_reply: str = Field(min_length=1, max_length=4000)


class UserFeedbackOut(BaseModel):
    id: int
    user_id: int
    user_name: str
    user_display_name: str
    title: str
    message: str
    attachment_paths: list[str] = Field(default_factory=list)
    status: str
    admin_reply: str = ""
    replied_by_user_name: str | None = None
    replied_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ProviderCapability(BaseModel):
    provider_name: str
    display_name: str
    model_name: str
    capabilities: list[str]
    configurable: bool
    outbound: bool
    adapter_kind: str


class ProviderProfileBase(BaseModel):
    provider_name: str = Field(min_length=2, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: str = Field(default="", max_length=150)
    base_url: str = Field(min_length=5, max_length=255)
    model_name: str = Field(min_length=1, max_length=150)
    adapter_kind: str = "openai_compatible"
    capabilities: list[str] = Field(default_factory=lambda: ["image.generate"])
    strategies: dict[str, str] = Field(default_factory=dict)
    adapter_config: dict[str, object] = Field(default_factory=dict)
    quality: str = "medium"
    output_format: str = "png"
    timeout_seconds: float = 300.0
    pricing_currency: str = Field(default="CNY", max_length=12)
    pricing_unit: str = "per_image"
    unit_price: float = Field(default=0.0, ge=0)
    enabled: bool = True
    reference_mode: str = "disabled"
    reference_caption_model: str | None = None


class ProviderProfileCreate(ProviderProfileBase):
    api_key: str = Field(min_length=1)
    api_secret: str = ""


class ProviderProfileUpdate(BaseModel):
    api_key: str | None = None
    api_secret: str | None = None
    display_name: str | None = Field(default=None, max_length=150)
    base_url: str | None = Field(default=None, min_length=5, max_length=255)
    model_name: str | None = Field(default=None, min_length=1, max_length=150)
    adapter_kind: str | None = None
    capabilities: list[str] | None = None
    strategies: dict[str, str] | None = None
    adapter_config: dict[str, object] | None = None
    quality: str | None = None
    output_format: str | None = None
    timeout_seconds: float | None = None
    pricing_currency: str | None = None
    pricing_unit: str | None = None
    unit_price: float | None = Field(default=None, ge=0)
    enabled: bool | None = None
    reference_mode: str | None = None
    reference_caption_model: str | None = None


class ProviderProfileOut(ProviderProfileBase):
    id: int
    has_api_key: bool
    masked_api_key: str
    created_at: datetime
    updated_at: datetime


class ProviderProfileProbeOut(BaseModel):
    ok: bool
    status: str
    detail: str
    checked_url: str | None = None
    checked_at: datetime


class ProviderPricingRuleBase(BaseModel):
    provider_profile_id: int
    capability: str = Field(min_length=1, max_length=50)
    metric: str = Field(min_length=1, max_length=40)
    unit_size: float = Field(default=1_000_000.0, gt=0)
    unit_price: float = Field(default=0.0, ge=0)
    currency: str = Field(default="USD", max_length=12)
    is_active: bool = True


class ProviderPricingRuleCreate(ProviderPricingRuleBase):
    pass


class ProviderPricingRuleUpdate(BaseModel):
    provider_profile_id: int | None = None
    capability: str | None = Field(default=None, min_length=1, max_length=50)
    metric: str | None = Field(default=None, min_length=1, max_length=40)
    unit_size: float | None = Field(default=None, gt=0)
    unit_price: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=12)
    is_active: bool | None = None


class ProviderPricingRuleOut(ProviderPricingRuleBase):
    id: int
    created_at: datetime
    updated_at: datetime


class ProjectOut(BaseModel):
    id: int
    name: str
    code: str
    classification: DataClassification
    can_manage: bool = False
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
    category: str = ""
    subcategory: str = ""
    is_featured: bool = False
    label: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=150)
    prompt: str = Field(min_length=1)
    style: str = "modern"
    aspect_ratio: str = "16:9"
    resolution: str = "2k"
    deliverable: str = ""
    notes: str = ""
    source_image_path: str = ""
    preview_image_path: str = ""


class PromptTemplateCreate(PromptTemplateBase):
    pass


class PromptTemplateUpdate(BaseModel):
    category: str | None = None
    subcategory: str | None = None
    is_featured: bool | None = None
    label: str | None = Field(default=None, min_length=1, max_length=100)
    title: str | None = Field(default=None, min_length=1, max_length=150)
    prompt: str | None = Field(default=None, min_length=1)
    style: str | None = None
    aspect_ratio: str | None = None
    resolution: str | None = None
    deliverable: str | None = None
    notes: str | None = None
    source_image_path: str | None = None
    preview_image_path: str | None = None


class PromptTemplateOut(PromptTemplateBase):
    id: int
    user_name: str
    scope: str
    can_manage: bool = False
    popularity_score: float = 0.0
    recent_apply_count: int = 0
    recent_submit_success_count: int = 0
    created_at: datetime
    updated_at: datetime


class PromptTemplateEventCreate(BaseModel):
    event_type: str = Field(min_length=1, max_length=30)
    context: str = Field(default="studio", min_length=1, max_length=30)


class PromptTemplateEventOut(BaseModel):
    template_id: int
    event_type: str
    context: str
    recorded: bool = True
    created_at: datetime | None = None


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
    display_name: str = Field(default="", max_length=150)
    capabilities: list[str] = Field(default_factory=lambda: ["image.generate"])
    adapter_kind: str = "openai_compatible"
    reference_mode: str = "disabled"
    strategies: dict[str, str] = Field(default_factory=dict)


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
    source_image_path: str = ""
    image_path: str
    media_type: str = "image"
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
    source_image_path: str = ""
    image_path: str = ""
    media_type: str = "image"
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
    source_image_path: str | None = None
    image_path: str | None = None
    media_type: str | None = None
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
    display_name: str
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


class AgentImageTaskCreate(BaseModel):
    title: str = Field(min_length=3, max_length=150)
    project_id: int
    requested_provider: str
    classification: DataClassification = DataClassification.b
    payload: dict[str, Any] = Field(default_factory=dict)
    workflow_key: str = "image-generate"
    external_execution_id: str = ""


class AgentInspirationImportIn(BaseModel):
    project_id: int | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    image_path: str = ""
    category: str = "Architecture"
    tags: list[str] = Field(default_factory=list)
    source_type: str = "external"
    source_name: str = ""
    source_url: str = ""
    prompt_text: str | None = None
    model_name: str = ""
    external_execution_id: str = ""


class AgentProjectArtifactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    asset_type: AssetType = AssetType.image
    data_url: str | None = None
    storage_path: str | None = None
    prompt_text: str | None = None
    tags: list[str] = Field(default_factory=list)
    source_task_id: int | None = None
    external_execution_id: str = ""


class AgentResearchNoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str = ""
    content: str = ""
    source_url: str = ""
    source_name: str = ""
    tags: list[str] = Field(default_factory=list)
    external_execution_id: str = ""


class AgentWorkflowIntentCreate(BaseModel):
    project_id: int
    title: str = Field(min_length=1, max_length=200)
    payload: dict[str, Any] = Field(default_factory=dict)
    requested_provider: str = ""
    workflow_key: str = ""
    external_execution_id: str = ""


class AgentJobCompleteIn(BaseModel):
    status: str = Field(pattern=r"^(completed|failed)$")
    result: dict[str, Any] = Field(default_factory=dict)
    error_detail: str = ""


class AgentJobOut(BaseModel):
    id: int
    job_type: str
    status: str
    client_key: str
    environment: str
    user_name: str
    project_id: int | None = None
    project_code: str | None = None
    workflow_key: str = ""
    requested_provider: str = ""
    task_id: int | None = None
    asset_id: int | None = None
    inspiration_post_id: int | None = None
    research_note_id: int | None = None
    asset_ids: list[int] = Field(default_factory=list)
    request_id: str
    external_execution_id: str = ""
    result: dict[str, Any] = Field(default_factory=dict)
    error_detail: str = ""
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class ProjectResearchNoteOut(BaseModel):
    id: int
    project_id: int
    user_name: str | None = None
    title: str
    summary: str
    content: str
    source_url: str
    source_name: str
    source_execution_id: str
    tags: list[str]
    created_at: datetime


class AgentClientOut(BaseModel):
    id: int
    key: str
    display_name: str
    device_id: str
    environment: str
    user_name: str | None = None
    role: str
    project_codes: list[str]
    capabilities: list[str]
    is_active: bool
    last_seen_at: datetime | None = None
    last_request_id: str = ""
    created_at: datetime
    updated_at: datetime


class AgentOfficialSkillOut(BaseModel):
    key: str
    name: str
    version: str
    description: str
    author: str = ""
    path: str
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)


class AgentSkillReleaseCreate(BaseModel):
    key: str = Field(min_length=2, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: str = Field(min_length=1, max_length=150)
    environment: str = Field(default="test", pattern=r"^(test|prod)$")
    openclaw_version: str = Field(default="latest", min_length=1, max_length=50)
    skill_keys: list[str] = Field(default_factory=list)
    notes: str = ""
    is_active: bool = True


class AgentSkillReleaseUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=150)
    environment: str | None = Field(default=None, pattern=r"^(test|prod)$")
    openclaw_version: str | None = Field(default=None, min_length=1, max_length=50)
    skill_keys: list[str] | None = None
    notes: str | None = None
    is_active: bool | None = None


class AgentSkillReleaseOut(BaseModel):
    id: int
    key: str
    display_name: str
    environment: str
    openclaw_version: str
    skill_keys: list[str]
    notes: str
    is_active: bool
    created_by_user_name: str | None = None
    created_at: datetime
    updated_at: datetime
