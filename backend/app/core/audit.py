"""Audit logging utilities for management operations."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import AuditLog, DataClassification


def write_audit_log(
    db: Session,
    event_type: str,
    actor_name: str,
    actor_id: int | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    target_name: str | None = None,
    project_code: str | None = None,
    workflow_key: str | None = None,
    provider_name: str | None = None,
    classification: DataClassification | None = None,
    details: dict | None = None,
) -> AuditLog:
    """Write an audit log entry."""
    log = AuditLog(
        event_type=event_type,
        actor_name=actor_name,
        actor_id=actor_id,
        target_type=target_type,
        target_id=target_id,
        target_name=target_name,
        project_code=project_code,
        workflow_key=workflow_key,
        provider_name=provider_name,
        classification=classification,
        details=details or {},
    )
    db.add(log)
    return log


# Common event types
class AuditEventType:
    # Task events
    TASK_CREATED = "task.created"
    TASK_DELETED = "task.deleted"

    # User events
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_PASSWORD_RESET = "user.password_reset"
    USER_DISABLED = "user.disabled"
    USER_ENABLED = "user.enabled"

    # Provider events
    PROVIDER_CREATED = "provider.created"
    PROVIDER_UPDATED = "provider.updated"
    PROVIDER_DELETED = "provider.deleted"
    PROVIDER_API_KEY_CHANGED = "provider.api_key_changed"

    # Project events
    PROJECT_CREATED = "project.created"
    PROJECT_UPDATED = "project.updated"
    PROJECT_DELETED = "project.deleted"
    PROJECT_MEMBER_ADDED = "project.member_added"
    PROJECT_MEMBER_REMOVED = "project.member_removed"

    # Inspiration events
    INSPIRATION_CREATED = "inspiration.created"
    INSPIRATION_DELETED = "inspiration.deleted"

    # Prompt template events
    PROMPT_TEMPLATE_CREATED = "prompt_template.created"
    PROMPT_TEMPLATE_UPDATED = "prompt_template.updated"
    PROMPT_TEMPLATE_DELETED = "prompt_template.deleted"
