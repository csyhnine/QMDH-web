from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import JSON, Boolean, DateTime, Enum as SqlEnum, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TaskStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class AssetType(str, Enum):
    image = "image"
    document = "document"
    video = "video"
    prompt = "prompt"


class DataClassification(str, Enum):
    a = "A"
    b = "B"
    c = "C"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(150), default="")
    group_name: Mapped[str] = mapped_column(String(120), default="")
    role: Mapped[str] = mapped_column(String(50), default="designer")
    password_hash: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    project_codes: Mapped[list[str]] = mapped_column(JSON, default=list)
    monthly_quota: Mapped[float | None] = mapped_column(Float, nullable=True)
    billing_plan: Mapped[str] = mapped_column(String(30), default="standard")
    billing_status: Mapped[str] = mapped_column(String(20), default="active")
    quota_policy: Mapped[str] = mapped_column(String(20), default="soft_warn")
    quota_reset_cycle: Mapped[str] = mapped_column(String(20), default="monthly")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tasks: Mapped[list["Task"]] = relationship(back_populates="user")
    prompt_templates: Mapped[list["PromptTemplate"]] = relationship(back_populates="user")
    auth_sessions: Mapped[list["AuthSession"]] = relationship(back_populates="user")


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="auth_sessions")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    classification: Mapped[DataClassification] = mapped_column(SqlEnum(DataClassification), default=DataClassification.b)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped[User | None] = relationship()
    tasks: Mapped[list["Task"]] = relationship(back_populates="project")
    assets: Mapped[list["Asset"]] = relationship(back_populates="project")


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(50), default="demo")
    priority: Mapped[str] = mapped_column(String(10), default="P1")
    version: Mapped[str] = mapped_column(String(20), default="v1")
    provider_capability: Mapped[str] = mapped_column(String(50))
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tasks: Mapped[list["Task"]] = relationship(back_populates="workflow")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(150))
    status: Mapped[TaskStatus] = mapped_column(SqlEnum(TaskStatus), default=TaskStatus.pending, index=True)
    workflow_id: Mapped[int] = mapped_column(ForeignKey("workflows.id"))
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    requested_provider: Mapped[str] = mapped_column(String(50))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    classification: Mapped[DataClassification] = mapped_column(SqlEnum(DataClassification), default=DataClassification.b)
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    cost_currency: Mapped[str] = mapped_column(String(12), default="CNY")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    workflow: Mapped["Workflow"] = relationship(back_populates="tasks")
    project: Mapped["Project"] = relationship(back_populates="tasks")
    user: Mapped["User"] = relationship(back_populates="tasks")
    provider_calls: Mapped[list["ProviderCall"]] = relationship(back_populates="task")


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    asset_type: Mapped[AssetType] = mapped_column(SqlEnum(AssetType))
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    source_task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    storage_path: Mapped[str] = mapped_column(String(255))
    prompt_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    share_count: Mapped[int] = mapped_column(Integer, default=0)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Project | None] = relationship(back_populates="assets")
    bookmarks: Mapped[list["AssetBookmark"]] = relationship(back_populates="asset", cascade="all, delete-orphan")


class AssetBookmark(Base):
    __tablename__ = "asset_bookmarks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship()
    asset: Mapped[Asset] = relationship(back_populates="bookmarks")


class InspirationPost(Base):
    __tablename__ = "inspiration_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    source_image_path: Mapped[str] = mapped_column(String(255), default="")
    image_path: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(50), default="全部", index=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    source_type: Mapped[str] = mapped_column(String(20), default="user")  # "user" or "external"
    source_name: Mapped[str] = mapped_column(String(100), default="")
    source_url: Mapped[str] = mapped_column(String(500), default="")
    # For user-shared posts
    source_asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"), nullable=True)
    prompt_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_name: Mapped[str] = mapped_column(String(100), default="")
    # Engagement
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    # Meta
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User | None] = relationship()
    source_asset: Mapped[Asset | None] = relationship()


class ProviderCall(Base):
    __tablename__ = "provider_calls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    provider_name: Mapped[str] = mapped_column(String(50), index=True)
    model_name: Mapped[str] = mapped_column(String(100))
    capability: Mapped[str] = mapped_column(String(50))
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    cost_currency: Mapped[str] = mapped_column(String(12), default="CNY")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    outbound: Mapped[bool] = mapped_column(default=True)
    request_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship(back_populates="provider_calls")


class TaskArchive(Base):
    __tablename__ = "task_archives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    project_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    project_code: Mapped[str] = mapped_column(String(50), index=True)
    project_name: Mapped[str] = mapped_column(String(150))
    workflow_key: Mapped[str] = mapped_column(String(100))
    workflow_name: Mapped[str] = mapped_column(String(150))
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_name: Mapped[str] = mapped_column(String(100), index=True)
    requested_provider: Mapped[str] = mapped_column(String(100), index=True)
    classification: Mapped[DataClassification] = mapped_column(SqlEnum(DataClassification))
    task_status: Mapped[TaskStatus] = mapped_column(SqlEnum(TaskStatus))
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    cost_currency: Mapped[str] = mapped_column(String(12), default="CNY")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    provider_call_count: Mapped[int] = mapped_column(Integer, default=0)
    asset_count: Mapped[int] = mapped_column(Integer, default=0)
    archive_source: Mapped[str] = mapped_column(String(50), index=True)
    archive_reason: Mapped[str] = mapped_column(Text, default="")
    source_deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    task_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    task_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, server_default=func.now())

    provider_calls: Mapped[list["ProviderCallArchive"]] = relationship(
        back_populates="task_archive",
        cascade="all, delete-orphan",
    )


class ProviderCallArchive(Base):
    __tablename__ = "provider_call_archives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_call_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    task_archive_id: Mapped[int] = mapped_column(ForeignKey("task_archives.id"), index=True)
    provider_name: Mapped[str] = mapped_column(String(50), index=True)
    model_name: Mapped[str] = mapped_column(String(100))
    capability: Mapped[str] = mapped_column(String(50))
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    cost_currency: Mapped[str] = mapped_column(String(12), default="CNY")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    outbound: Mapped[bool] = mapped_column(Boolean, default=True)
    call_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, server_default=func.now())

    task_archive: Mapped[TaskArchive] = relationship(back_populates="provider_calls")


class UsageLedger(Base):
    __tablename__ = "usage_ledgers"
    __table_args__ = (UniqueConstraint("source_table", "source_id", name="uq_usage_ledgers_source"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entry_type: Mapped[str] = mapped_column(String(50), index=True)
    source_table: Mapped[str] = mapped_column(String(50))
    source_id: Mapped[int] = mapped_column(Integer)
    task_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    task_archive_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    provider_call_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    provider_call_archive_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    project_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    project_code: Mapped[str] = mapped_column(String(50), index=True)
    project_name: Mapped[str] = mapped_column(String(150))
    workflow_key: Mapped[str] = mapped_column(String(100))
    workflow_name: Mapped[str] = mapped_column(String(150))
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_name: Mapped[str] = mapped_column(String(100), index=True)
    requested_provider: Mapped[str] = mapped_column(String(100), index=True)
    provider_name: Mapped[str] = mapped_column(String(100), default="", index=True)
    model_name: Mapped[str] = mapped_column(String(150), default="")
    capability: Mapped[str] = mapped_column(String(50), default="")
    classification: Mapped[DataClassification] = mapped_column(SqlEnum(DataClassification))
    task_status: Mapped[TaskStatus | None] = mapped_column(SqlEnum(TaskStatus), nullable=True)
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    cost_currency: Mapped[str] = mapped_column(String(12), default="CNY")
    billable_units: Mapped[float] = mapped_column(Float, default=0.0)
    billing_unit: Mapped[str] = mapped_column(String(50), default="")
    output_count: Mapped[int] = mapped_column(Integer, default=0)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cached_input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    uncached_input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    usage_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str] = mapped_column(String(100), default="")
    error_summary: Mapped[str] = mapped_column(Text, default="")
    ledger_source: Mapped[str] = mapped_column(String(50), index=True)
    source_deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(100), index=True)
    actor_name: Mapped[str] = mapped_column(String(100), index=True)
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Database user ID if available
    target_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "user", "provider", "project", "task"
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    # Legacy fields (retained for backwards compatibility)
    project_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    workflow_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    provider_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    classification: Mapped[DataClassification | None] = mapped_column(SqlEnum(DataClassification), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserFeedback(Base):
    __tablename__ = "user_feedbacks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(150))
    message: Mapped[str] = mapped_column(Text, default="")
    attachment_paths: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)
    admin_reply: Mapped[str] = mapped_column(Text, default="")
    replied_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped[User] = relationship(foreign_keys=[user_id])
    replied_by: Mapped[User | None] = relationship(foreign_keys=[replied_by_user_id])


class AgentClient(Base):
    __tablename__ = "agent_clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(150), default="")
    device_id: Mapped[str] = mapped_column(String(150), default="", index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    role: Mapped[str] = mapped_column(String(50), default="designer")
    environment: Mapped[str] = mapped_column(String(30), default="test", index=True)
    project_codes: Mapped[list[str]] = mapped_column(JSON, default=list)
    capabilities: Mapped[list[str]] = mapped_column(JSON, default=list)
    client_metadata: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_request_id: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped[User | None] = relationship()


class ProjectResearchNote(Base):
    __tablename__ = "project_research_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")
    content: Mapped[str] = mapped_column(Text, default="")
    source_url: Mapped[str] = mapped_column(String(500), default="")
    source_name: Mapped[str] = mapped_column(String(150), default="")
    source_execution_id: Mapped[str] = mapped_column(String(150), default="", index=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Project] = relationship()
    user: Mapped[User | None] = relationship()


class AgentJob(Base):
    __tablename__ = "agent_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_type: Mapped[str] = mapped_column(String(100), index=True)
    status: Mapped[str] = mapped_column(String(30), index=True, default="accepted")
    client_id: Mapped[int] = mapped_column(ForeignKey("agent_clients.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True, index=True)
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"), nullable=True, index=True)
    inspiration_post_id: Mapped[int | None] = mapped_column(ForeignKey("inspiration_posts.id"), nullable=True, index=True)
    research_note_id: Mapped[int | None] = mapped_column(ForeignKey("project_research_notes.id"), nullable=True, index=True)
    workflow_key: Mapped[str] = mapped_column(String(100), default="")
    requested_provider: Mapped[str] = mapped_column(String(100), default="")
    request_id: Mapped[str] = mapped_column(String(100), index=True)
    external_execution_id: Mapped[str] = mapped_column(String(150), default="", index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    error_detail: Mapped[str] = mapped_column(Text, default="")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    client: Mapped[AgentClient] = relationship()
    user: Mapped[User | None] = relationship()
    project: Mapped[Project | None] = relationship()
    task: Mapped[Task | None] = relationship()
    asset: Mapped[Asset | None] = relationship()
    inspiration_post: Mapped[InspirationPost | None] = relationship()
    research_note: Mapped[ProjectResearchNote | None] = relationship()


class AgentSkillRelease(Base):
    __tablename__ = "agent_skill_releases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(150))
    environment: Mapped[str] = mapped_column(String(30), default="test", index=True)
    openclaw_version: Mapped[str] = mapped_column(String(50), default="latest")
    skill_keys: Mapped[list[str]] = mapped_column(JSON, default=list)
    notes: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    created_by: Mapped[User | None] = relationship()


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    scope: Mapped[str] = mapped_column(String(20), default="private", index=True)
    category: Mapped[str] = mapped_column(String(80), default="", index=True)
    subcategory: Mapped[str] = mapped_column(String(80), default="")
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    label: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(150))
    prompt: Mapped[str] = mapped_column(Text)
    style: Mapped[str] = mapped_column(String(50), default="modern")
    aspect_ratio: Mapped[str] = mapped_column(String(20), default="16:9")
    resolution: Mapped[str] = mapped_column(String(20), default="2k")
    deliverable: Mapped[str] = mapped_column(String(100), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    source_image_path: Mapped[str] = mapped_column(String(255), default="")
    preview_image_path: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped[User] = relationship(back_populates="prompt_templates")
    events: Mapped[list["PromptTemplateEvent"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
    )


class PromptTemplateEvent(Base):
    __tablename__ = "prompt_template_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("prompt_templates.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(30), index=True)
    context: Mapped[str] = mapped_column(String(30), default="studio", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    template: Mapped[PromptTemplate] = relationship(back_populates="events")
    user: Mapped[User | None] = relationship()


class ProviderProfile(Base):
    __tablename__ = "provider_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(150), default="")
    api_key: Mapped[str] = mapped_column(Text)
    base_url: Mapped[str] = mapped_column(String(255))
    model_name: Mapped[str] = mapped_column(String(150))
    adapter_kind: Mapped[str] = mapped_column(String(50), default="openai_compatible")
    capabilities: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["image.generate"])
    strategies: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    quality: Mapped[str] = mapped_column(String(50), default="medium")
    output_format: Mapped[str] = mapped_column(String(20), default="png")
    timeout_seconds: Mapped[float] = mapped_column(Float, default=300.0)
    pricing_currency: Mapped[str] = mapped_column(String(12), default="CNY")
    pricing_unit: Mapped[str] = mapped_column(String(50), default="per_image")
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    reference_mode: Mapped[str] = mapped_column(String(50), default="disabled")
    reference_caption_model: Mapped[str | None] = mapped_column(String(150), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    pricing_rules: Mapped[list["ProviderPricingRule"]] = relationship(
        back_populates="provider_profile",
        cascade="all, delete-orphan",
    )


class ProviderPricingRule(Base):
    __tablename__ = "provider_pricing_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_profile_id: Mapped[int] = mapped_column(ForeignKey("provider_profiles.id"), index=True)
    capability: Mapped[str] = mapped_column(String(50), index=True)
    metric: Mapped[str] = mapped_column(String(40), index=True)
    unit_size: Mapped[float] = mapped_column(Float, default=1_000_000.0)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(12), default="USD")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    provider_profile: Mapped[ProviderProfile] = relationship(back_populates="pricing_rules")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="新对话")
    model_provider_id: Mapped[int | None] = mapped_column(ForeignKey("provider_profiles.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped[User] = relationship()
    provider: Mapped[ProviderProfile | None] = relationship()
    messages: Mapped[list["ChatMessage"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # "user", "assistant", "system"
    content: Mapped[str] = mapped_column(Text)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
