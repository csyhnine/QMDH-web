from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import JSON, Boolean, DateTime, Enum as SqlEnum, Float, ForeignKey, Integer, String, Text, func
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
    role: Mapped[str] = mapped_column(String(50), default="designer")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tasks: Mapped[list["Task"]] = relationship(back_populates="user")
    prompt_templates: Mapped[list["PromptTemplate"]] = relationship(back_populates="user")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    classification: Mapped[DataClassification] = mapped_column(SqlEnum(DataClassification), default=DataClassification.b)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

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
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
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


class ProviderCall(Base):
    __tablename__ = "provider_calls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    provider_name: Mapped[str] = mapped_column(String(50), index=True)
    model_name: Mapped[str] = mapped_column(String(100))
    capability: Mapped[str] = mapped_column(String(50))
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    outbound: Mapped[bool] = mapped_column(default=True)
    request_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    task: Mapped[Task] = relationship(back_populates="provider_calls")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(100))
    actor_name: Mapped[str] = mapped_column(String(100))
    project_code: Mapped[str] = mapped_column(String(50))
    workflow_key: Mapped[str] = mapped_column(String(100))
    provider_name: Mapped[str] = mapped_column(String(50))
    classification: Mapped[DataClassification] = mapped_column(SqlEnum(DataClassification))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    label: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(150))
    prompt: Mapped[str] = mapped_column(Text)
    style: Mapped[str] = mapped_column(String(50), default="modern")
    aspect_ratio: Mapped[str] = mapped_column(String(20), default="16:9")
    resolution: Mapped[str] = mapped_column(String(20), default="2k")
    deliverable: Mapped[str] = mapped_column(String(100), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped[User] = relationship(back_populates="prompt_templates")


class ProviderProfile(Base):
    __tablename__ = "provider_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    api_key: Mapped[str] = mapped_column(Text)
    base_url: Mapped[str] = mapped_column(String(255))
    model_name: Mapped[str] = mapped_column(String(150))
    adapter_kind: Mapped[str] = mapped_column(String(50), default="openai_compatible")
    capabilities: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["image.generate"])
    quality: Mapped[str] = mapped_column(String(50), default="medium")
    output_format: Mapped[str] = mapped_column(String(20), default="png")
    timeout_seconds: Mapped[float] = mapped_column(Float, default=90.0)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    reference_mode: Mapped[str] = mapped_column(String(50), default="disabled")
    reference_caption_model: Mapped[str | None] = mapped_column(String(150), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
