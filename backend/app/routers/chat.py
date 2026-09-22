"""Chat API router: conversations, messages, streaming."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.audit import AuditEventType, write_audit_log
from app.core.auth import get_current_auth_user, get_optional_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.integrations.studio_agent.agent import (
    ChatAgentThinkingStep,
    StudioAgentReply,
    StudioAgentUnavailableError,
)
from app.models import AgentSkillRelease, ChatMessage, ChatTurnTelemetry, Conversation, ProviderProfile, User
from app.schemas import (
    AgentChatToolOut,
    AgentMemoryEntryOut,
    AgentMemoryPauseIn,
    ChatAgentPolicyLayerOut,
    ChatAgentPolicyOut,
    ChatAgentTaskConfirmIn,
    ChatAgentTaskProposalOut,
    ChatAgentThinkingStepOut,
    ChatAgentToolCallOut,
    ChatAttachmentOut,
    ChatAttachmentUploadIn,
    ChatAttachmentUploadOut,
    ChatMessageCreate,
    ChatMessageOut,
    ChatModelOut,
    ChatTelemetryBatchIn,
    ChatWordExportIn,
    ChatConversationContextStatsOut,
    ConversationCreate,
    ConversationOut,
    ConversationUpdate,
    TaskOut,
)
from app.services.chat_attachment_upload import (
    build_chat_file_relative_path,
    build_chat_image_relative_path,
    decode_chat_file_upload,
    decode_chat_image_upload,
)
from app.services.chat_message_content import (
    attachment_kind_for_path,
    chat_attachment_out,
    serialize_chat_attachments,
)
from app.services.chat_word_export import build_chat_word_document, default_chat_word_file_name
from app.services.media_storage import resolve_storage_path, write_binary_asset
from app.services.chat_context import (
    apply_message_input_tokens,
    compute_context_breakdown,
    estimate_conversation_context,
    pack_chat_context,
)
from app.services.chat_agent_service import (
    embed_agent_message_meta,
    format_agent_thinking_sse,
    format_agent_thinking_step_sse,
    parse_agent_message_meta,
    stream_chat_agent_sse,
)
from app.services.agent_harness_service import run_chat_agent_harness_isolated
from app.services.agent_memory_service import (
    build_compacted_memory_context,
    delete_memory_entry,
    detach_conversation_memories,
    list_memory_entries,
    record_chat_turn_memory,
    set_memory_paused,
    write_hitl_confirmation_memory,
)
from app.services.agent_policy_service import (
    CHAT_AGENT_BASELINE_PROMPT,
    build_chat_policy_summary,
    resolve_effective_chat_policy,
)
from app.services.chat_agent_task_service import proposal_from_confirm_payload, submit_confirmed_chat_agent_task
from app.services.chat_service import (
    chat_error_payload,
    format_chat_error_message,
    _sanitize_error_text,
    get_chat_models,
    provider_profile_has_usable_api_key,
    snapshot_chat_provider_config,
    stream_chat_completion,
)
from app.services.billing import enforce_user_quota, normalize_chat_usage
from app.services.chat_telemetry_service import (
    ChatTurnTracker,
    append_client_telemetry_events,
    begin_chat_turn,
    resolve_outcome_from_error_code,
)
from app.core.logging import get_correlation_id
from app.services.usage_ledger import record_chat_usage_ledger

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


def _format_agent_run_error(exc: Exception) -> tuple[str, str]:
    """Return (user_summary, telemetry_detail)."""
    detail = _sanitize_error_text(str(exc), limit=480)
    lowered = detail.lower()
    if "max retries" in lowered:
        return (
            "助手工具调用失败，常见原因是模型名称或生图参数不正确。"
            "请先让它「列出可用模型」，或前往 Studio 生图。",
            detail,
        )
    if "provider not found" in lowered:
        return ("未找到指定的生图模型，请先列出可用模型后再试。", detail)
    if (
        "402" in detail
        or "max_tokens" in lowered
        or "openrouter_credits" in lowered
        or "requires more credits" in lowered
    ):
        return (
            "上游按过大的 max_tokens 预扣费失败（常见于未限制输出上限）。"
            "请稍后重试；若仍失败，检查 Admin 里该 Chat 模型的网关额度或换模型。",
            detail,
        )
    return ("助手调用失败，请稍后重试。", detail)


def _persist_agent_assistant_message(
    db: Session,
    conversation: Conversation,
    conversation_id: int,
    content: str,
    *,
    tool_calls: tuple | list | None = None,
    task_proposals: tuple | list | None = None,
    thinking_steps: tuple | list | None = None,
    policy_version: str = "code-default",
    token_count: int = 0,
) -> ChatMessage:
    stored_content = embed_agent_message_meta(
        content,
        tool_calls=tool_calls or (),
        task_proposals=task_proposals or (),
        thinking_steps=thinking_steps or (),
        policy_version=policy_version,
    )
    assistant_message = ChatMessage(
        conversation_id=conversation_id,
        role="assistant",
        content=stored_content,
        token_count=max(int(token_count or 0), 0),
    )
    apply_message_input_tokens(assistant_message)
    db.add(assistant_message)
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(assistant_message)
    return assistant_message


def _chat_status_sse(label: str, *, status: str = "preparing") -> str:
    return f"data: {json.dumps({'status': status, 'label': label}, ensure_ascii=False)}\n\n"


def _chat_error_sse(payload: dict[str, object]) -> str:
    return f"data: {json.dumps({'error': payload}, ensure_ascii=False)}\n\n"


def _persist_chat_assistant_reply(
    db: Session,
    *,
    conversation_row: Conversation,
    conversation_id: int,
    provider_for_ledger: ProviderProfile,
    provider_profile_id: int,
    auth_user: AuthUserProfile,
    provider_name: str,
    provider_model_name: str,
    content: str,
    last_usage_payload: dict[str, object],
    user_message: str,
    record_memory: bool = True,
) -> ChatMessage:
    assistant_message = ChatMessage(
        conversation_id=conversation_id,
        role="assistant",
        content=content,
        token_count=int(last_usage_payload.get("total_tokens") or 0),
    )
    apply_message_input_tokens(assistant_message)
    db.add(assistant_message)
    conversation_row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(assistant_message)
    record_chat_usage_ledger(
        db,
        message=assistant_message,
        conversation=conversation_row,
        provider=provider_for_ledger,
        provider_profile_id=provider_profile_id,
        user_id=auth_user.user_id,
        user_name=auth_user.name,
        provider_name=provider_name,
        model_name=provider_model_name,
        prompt_tokens=int(last_usage_payload.get("prompt_tokens") or 0),
        completion_tokens=int(last_usage_payload.get("completion_tokens") or 0),
        total_tokens=int(last_usage_payload.get("total_tokens") or 0),
        usage_payload=last_usage_payload,
    )
    if record_memory and not content.startswith("对话失败"):
        record_chat_turn_memory(
            db,
            user_id=auth_user.user_id,
            conversation_id=conversation_id,
            user_message=user_message,
            assistant_reply=content,
            route="chat",
        )
    db.commit()
    return assistant_message


def _finish_chat_turn_telemetry(
    db: Session,
    tracker: ChatTurnTracker,
    *,
    outcome: str,
    error_code: str = "",
    error_summary: str = "",
    assistant_message_id: int | None = None,
    context_tokens: int = 0,
    context_usage_percent: int = 0,
    finalized_holder: dict[str, bool],
) -> None:
    if finalized_holder.get("done"):
        return
    finalized_holder["done"] = True
    tracker.finalize(
        db,
        outcome=outcome,
        error_code=error_code,
        error_summary=error_summary,
        assistant_message_id=assistant_message_id,
        context_tokens=context_tokens,
        context_usage_percent=context_usage_percent,
    )


def _serialize_chat_message_out(message: ChatMessage) -> ChatMessageOut:
    parsed = parse_agent_message_meta(message.content or "")
    return ChatMessageOut(
        id=message.id,
        role=message.role,
        content=parsed.visible_content,
        attachments=[
            ChatAttachmentOut(**chat_attachment_out(item))
            for item in (message.attachments_json or [])
            if isinstance(item, dict)
        ],
        created_at=message.created_at,
        agent_tool_calls=[
            ChatAgentToolCallOut(name=call.name, summary=call.summary)
            for call in parsed.tool_calls
        ],
        agent_task_proposals=[
            ChatAgentTaskProposalOut(**proposal)
            for proposal in parsed.task_proposals
            if isinstance(proposal, dict)
        ],
        agent_thinking_steps=[
            ChatAgentThinkingStepOut(**step)
            for step in parsed.thinking_steps
            if isinstance(step, dict)
        ],
        policy_version=parsed.policy_version,
    )


def _conversation_out(db: Session, conversation: Conversation) -> ConversationOut:
    provider = db.get(ProviderProfile, conversation.model_provider_id) if conversation.model_provider_id else None
    messages = list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation.id)
            .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        )
    )
    stats = estimate_conversation_context(conversation, messages, provider_profile=provider)
    return ConversationOut(
        id=conversation.id,
        title=conversation.title,
        model_provider_id=conversation.model_provider_id,
        has_context_summary=bool((conversation.context_summary or "").strip()),
        context_usage_percent=stats.usage_percent,
        context_tokens=stats.tokens,
        context_window_tokens=stats.window_tokens,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


async def parse_chat_message_payload(request: Request) -> ChatMessageCreate:
    raw_body = await request.json()
    if isinstance(raw_body, str):
        raw_body = json.loads(raw_body)
    return ChatMessageCreate.model_validate(raw_body)


def _verify_owner(db: Session, conversation_id: int, user_id: int) -> Conversation:
    conversation = db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != user_id:
        raise HTTPException(status_code=403, detail="Conversation access denied")
    return conversation


def _resolve_enabled_chat_provider(db: Session, provider_id: int) -> ProviderProfile:
    provider = db.get(ProviderProfile, provider_id)
    if not provider or not provider.enabled:
        raise HTTPException(status_code=400, detail="Model is disabled or missing")
    if "chat.completions" not in (provider.capabilities or []):
        raise HTTPException(status_code=400, detail="Model does not support chat")
    if not provider_profile_has_usable_api_key(provider):
        raise HTTPException(
            status_code=503,
            detail="该模型的 API Key 当前不可用，请检查 QMDH_ENCRYPTION_KEY 或在模型管理页重新录入密钥。",
        )
    return provider


@router.get("/models", response_model=list[ChatModelOut])
def list_chat_models(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile | None = Depends(get_optional_auth_user),
) -> list[ChatModelOut]:
    del auth_user
    models = get_chat_models(db)
    return [
        ChatModelOut(
            provider_id=model.id,
            provider_name=model.provider_name,
            display_name=(model.display_name or model.model_name or model.provider_name).strip(),
            model_name=model.model_name,
            base_url=model.base_url,
        )
        for model in models
    ]


@router.post("/attachments/upload", response_model=ChatAttachmentUploadOut, status_code=status.HTTP_201_CREATED)
def upload_chat_attachment(
    payload: ChatAttachmentUploadIn,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ChatAttachmentUploadOut:
    del auth_user
    file_name = payload.file_name.strip()
    data_url = payload.data_url.strip()

    if data_url.lower().startswith("data:image/"):
        extension, content = decode_chat_image_upload(file_name, data_url)
        relative_path = build_chat_image_relative_path(file_name, extension)
        kind = "image"
    else:
        extension, content = decode_chat_file_upload(file_name, data_url)
        relative_path = build_chat_file_relative_path(file_name, extension)
        kind = "file"

    storage_path = write_binary_asset(relative_path, content)
    from app.services.chat_message_content import mime_type_for_path

    return ChatAttachmentUploadOut(
        file_name=file_name,
        storage_path=resolve_storage_path(storage_path),
        mime_type=mime_type_for_path(relative_path),
        kind=kind,
    )


@router.post("/conversations", response_model=ConversationOut, status_code=201)
def create_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ConversationOut:
    conversation = Conversation(
        user_id=auth_user.user_id,
        title=payload.title.strip() or "新对话",
        model_provider_id=payload.model_provider_id,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return _conversation_out(db, conversation)


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
def update_conversation(
    conversation_id: int,
    payload: ConversationUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ConversationOut:
    conversation = _verify_owner(db, conversation_id, auth_user.user_id)
    _resolve_enabled_chat_provider(db, payload.model_provider_id)
    conversation.model_provider_id = payload.model_provider_id
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(conversation)
    return _conversation_out(db, conversation)


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile | None = Depends(get_optional_auth_user),
) -> list[ConversationOut]:
    if auth_user is None:
        return []
    conversations = db.scalars(
        select(Conversation)
        .where(Conversation.user_id == auth_user.user_id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
    ).all()
    return [_conversation_out(db, conversation) for conversation in conversations]


@router.get("/conversations/{conversation_id}/context-stats", response_model=ChatConversationContextStatsOut)
def get_conversation_context_stats(
    conversation_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ChatConversationContextStatsOut:
    conversation = _verify_owner(db, conversation_id, auth_user.user_id)
    provider = (
        db.get(ProviderProfile, conversation.model_provider_id)
        if conversation.model_provider_id is not None
        else None
    )
    messages = list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        )
    )
    packed_tokens = int(conversation.context_packed_tokens or 0) or None
    breakdown = compute_context_breakdown(
        conversation,
        messages,
        provider_profile=provider,
        packed_tokens=packed_tokens,
    )
    return ChatConversationContextStatsOut(
        conversation_id=conversation.id,
        stats_updated_at=conversation.context_stats_updated_at,
        **breakdown.as_dict(),
    )


@router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessageOut])
def get_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[ChatMessageOut]:
    _verify_owner(db, conversation_id, auth_user.user_id)
    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    ).all()
    return [
        _serialize_chat_message_out(message)
        for message in messages
    ]


@router.get("/agent-policy", response_model=ChatAgentPolicyOut)
def get_chat_agent_policy(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ChatAgentPolicyOut:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    policy = resolve_effective_chat_policy(db, environment="prod", user_id=auth_user.user_id)
    release_display_name: str | None = None
    if policy.release_id is not None:
        release = db.get(AgentSkillRelease, policy.release_id)
        if release is not None:
            release_display_name = release.display_name
    summary = build_chat_policy_summary(policy, release_display_name=release_display_name)
    enabled_tools = summary["enabled_tools"]
    disabled_tools = summary["disabled_tools"]
    policy_layers = summary["policy_layers"]
    assert isinstance(enabled_tools, list)
    assert isinstance(disabled_tools, list)
    assert isinstance(policy_layers, list)
    return ChatAgentPolicyOut(
        policy_version=str(summary["policy_version"]),
        release_display_name=release_display_name,
        environment=str(summary["environment"]),
        enabled_tools=[AgentChatToolOut(**item) for item in enabled_tools if isinstance(item, dict)],
        disabled_tools=[AgentChatToolOut(**item) for item in disabled_tools if isinstance(item, dict)],
        policy_layers=[ChatAgentPolicyLayerOut(**item) for item in policy_layers if isinstance(item, dict)],
        data_scope_note=str(summary["data_scope_note"]),
        capabilities_summary=str(summary["capabilities_summary"]),
        baseline_prompt=CHAT_AGENT_BASELINE_PROMPT.strip(),
        personalization_summary=summary.get("personalization_summary") if isinstance(summary.get("personalization_summary"), str) else None,
        user_group_name=summary.get("user_group_name") if isinstance(summary.get("user_group_name"), str) else None,
        assigned_agents=[],
    )


@router.get("/agent-memory", response_model=list[AgentMemoryEntryOut])
def list_chat_agent_memory(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[AgentMemoryEntryOut]:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    entries = list_memory_entries(db, user_id=auth_user.user_id, include_paused=True, limit=80)
    return [
        AgentMemoryEntryOut(
            id=entry.id,
            memory_type=entry.memory_type,
            content=entry.content,
            source_turn_ref=entry.source_turn_ref,
            conversation_id=entry.conversation_id,
            is_paused=entry.is_paused,
            created_at=entry.created_at,
        )
        for entry in entries
    ]


@router.post("/agent-memory/{memory_id}/pause", response_model=AgentMemoryEntryOut)
def pause_chat_agent_memory(
    memory_id: int,
    payload: AgentMemoryPauseIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> AgentMemoryEntryOut:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    entry = set_memory_paused(db, user_id=auth_user.user_id, memory_id=memory_id, paused=payload.paused)
    if entry is None:
        raise HTTPException(status_code=404, detail="Memory not found")
    db.commit()
    return AgentMemoryEntryOut(
        id=entry.id,
        memory_type=entry.memory_type,
        content=entry.content,
        source_turn_ref=entry.source_turn_ref,
        conversation_id=entry.conversation_id,
        is_paused=entry.is_paused,
        created_at=entry.created_at,
    )


@router.delete("/agent-memory/{memory_id}", status_code=204)
def delete_chat_agent_memory(
    memory_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not delete_memory_entry(db, user_id=auth_user.user_id, memory_id=memory_id):
        raise HTTPException(status_code=404, detail="Memory not found")
    db.commit()
    return Response(status_code=204)


@router.post(
    "/conversations/{conversation_id}/confirm-agent-task",
    response_model=TaskOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def confirm_chat_agent_task(
    conversation_id: int,
    payload: ChatAgentTaskConfirmIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> TaskOut:
    _verify_owner(db, conversation_id, auth_user.user_id)
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    current_user = db.get(User, auth_user.user_id)
    if current_user is not None:
        enforce_user_quota(db, user=current_user)

    policy = resolve_effective_chat_policy(
        db,
        environment="prod",
        policy_version=(payload.policy_version or "").strip() or None,
        user_id=auth_user.user_id,
    )
    proposal = proposal_from_confirm_payload(payload.model_dump())
    try:
        task_out = submit_confirmed_chat_agent_task(
            db,
            auth_user=auth_user,
            policy=policy,
            proposal=proposal,
            background_tasks=background_tasks,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    write_hitl_confirmation_memory(
        db,
        user_id=auth_user.user_id,
        conversation_id=conversation_id,
        proposal_id=proposal.proposal_id,
        task_id=task_out.id,
        workflow_key=proposal.workflow_key,
    )
    write_audit_log(
        db,
        event_type=AuditEventType.STUDIO_AGENT_ASSIST,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="chat_agent_task",
        target_id=task_out.id,
        target_name=task_out.title,
        project_code=task_out.project_code,
        workflow_key=task_out.workflow_key,
        provider_name=task_out.requested_provider,
        details={
            "conversation_id": conversation_id,
            "proposal_id": proposal.proposal_id,
            "policy_version": policy.policy_version,
        },
    )
    db.commit()
    return task_out


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    conversation = _verify_owner(db, conversation_id, auth_user.user_id)
    # Memory rows keep a FK to conversations; detach/delete them first.
    if auth_user.user_id is not None:
        detach_conversation_memories(db, user_id=auth_user.user_id, conversation_id=conversation_id)
    # Telemetry rows reference conversation/messages; remove before cascade delete.
    db.execute(delete(ChatTurnTelemetry).where(ChatTurnTelemetry.conversation_id == conversation_id))
    db.delete(conversation)
    db.commit()
    return Response(status_code=204)


@router.post("/conversations/{conversation_id}/messages/export-word")
def export_chat_message_word(
    conversation_id: int,
    payload: ChatWordExportIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    from urllib.parse import quote

    conversation = _verify_owner(db, conversation_id, auth_user.user_id)

    content = ""
    message_id = payload.message_id
    if message_id is not None:
        message = db.get(ChatMessage, message_id)
        if not message or message.conversation_id != conversation_id:
            raise HTTPException(status_code=404, detail="Message not found")
        if message.role != "assistant":
            raise HTTPException(status_code=400, detail="Only assistant messages can be exported to Word.")
        content = str(message.content or "").strip()
    else:
        content = payload.content.strip()

    if not content:
        raise HTTPException(status_code=400, detail="Message content is empty.")

    try:
        docx_bytes = build_chat_word_document(content, title=conversation.title)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    file_name = payload.file_name.strip() or default_chat_word_file_name(
        conversation_title=conversation.title,
        message_id=message_id,
    )
    ascii_name = "".join(char if char.isascii() and (char.isalnum() or char in {".", "-", "_"}) else "-" for char in file_name)
    ascii_name = ascii_name.strip("-_.") or "chat-reply.docx"
    disposition = (
        f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(file_name)}'
    )
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": disposition},
    )


@router.post("/telemetry", status_code=204)
def ingest_chat_telemetry(
    payload: ChatTelemetryBatchIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    for item in payload.events:
        append_client_telemetry_events(
            db,
            correlation_id=item.correlation_id,
            user_id=auth_user.user_id,
            events=[
                {
                    "event": item.event,
                    "detail": item.detail,
                    "client_ts_ms": item.client_ts_ms,
                    "conversation_id": item.conversation_id,
                }
            ],
        )
    return Response(status_code=204)


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: int,
    payload: ChatMessageCreate = Depends(parse_chat_message_payload),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
):
    conversation = _verify_owner(db, conversation_id, auth_user.user_id)

    if not conversation.model_provider_id:
        raise HTTPException(status_code=400, detail="Conversation is not linked to a model")
    provider = _resolve_enabled_chat_provider(db, conversation.model_provider_id)
    provider_name = provider.provider_name
    provider_model_name = provider.model_name
    provider_profile_id = conversation.model_provider_id
    provider_config = snapshot_chat_provider_config(provider)
    current_user = db.get(User, auth_user.user_id) if auth_user.user_id is not None else None
    if current_user is not None:
        enforce_user_quota(db, user=current_user)

    content = payload.content.strip()
    attachments = serialize_chat_attachments(
        [
            {
                "storage_path": item.storage_path,
                "file_name": item.file_name,
                "mime_type": item.mime_type,
                "kind": item.kind,
            }
            for item in payload.attachments
        ]
    )
    user_message = ChatMessage(
        conversation_id=conversation_id,
        role="user",
        content=content,
        attachments_json=attachments,
    )
    apply_message_input_tokens(user_message)
    db.add(user_message)

    if conversation.title == "新对话":
        conversation.title = content[:50] or (attachments[0]["file_name"][:50] if attachments else "新对话")
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user_message)

    chat_turn = begin_chat_turn(
        db,
        conversation_id=conversation_id,
        user_id=auth_user.user_id,
        user_message_id=user_message.id,
        provider_name=provider_name,
        model_name=provider_model_name,
        content_length=len(content),
        attachments=attachments,
        agent_mode=bool(payload.agent_mode),
        correlation_id=get_correlation_id(),
    )
    turn_tracker = ChatTurnTracker(turn_id=chat_turn.id)
    telemetry_finalized: dict[str, bool] = {"done": False}
    packed_context_tokens = 0
    packed_context_usage_percent = 0

    all_messages = list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at.asc())
        )
    )
    recent = all_messages[-50:] if len(all_messages) > 50 else all_messages

    if payload.agent_mode:
        policy_version = (payload.policy_version or "").strip() or None

        async def generate_agent():
            assistant_message_id: int | None = None
            try:
                yield f"data: {json.dumps({'correlation_id': get_correlation_id()}, ensure_ascii=False)}\n\n"
                loop = asyncio.get_running_loop()
                thinking_queue: asyncio.Queue[dict[str, str] | None] = asyncio.Queue()
                collected_thinking_steps: list[dict[str, object]] = []
                harness_audit_holder: dict[str, object] = {}

                def upsert_thinking_step(step: dict[str, object]) -> None:
                    key = step.get("key")
                    if isinstance(key, str) and key:
                        for index, existing in enumerate(collected_thinking_steps):
                            if existing.get("key") == key:
                                collected_thinking_steps[index] = step
                                return
                    collected_thinking_steps.append(step)

                def thinking_callback(step: ChatAgentThinkingStep) -> None:
                    payload_dict = step.to_dict()
                    loop.call_soon_threadsafe(thinking_queue.put_nowait, payload_dict)

                async def run_agent() -> StudioAgentReply:
                    try:
                        harness_result = await asyncio.to_thread(
                            run_chat_agent_harness_isolated,
                            recent_messages=recent,
                            new_content=content,
                            user_name=auth_user.name,
                            user_id=auth_user.user_id,
                            conversation_id=conversation_id,
                            provider_id=provider_profile_id,
                            policy_version=policy_version,
                            attachment_names=[item["file_name"] for item in attachments if item.get("file_name")],
                            thinking_callback=thinking_callback,
                        )
                        harness_audit_holder.clear()
                        harness_audit_holder.update(harness_result.audit_details)
                        return harness_result.reply
                    finally:
                        loop.call_soon_threadsafe(thinking_queue.put_nowait, None)

                yield format_agent_thinking_sse()
                agent_task = asyncio.create_task(run_agent())
                agent_reply: StudioAgentReply | None = None
                agent_error: BaseException | None = None

                while True:
                    try:
                        step = await asyncio.wait_for(thinking_queue.get(), timeout=0.05)
                    except asyncio.TimeoutError:
                        if agent_task.done():
                            break
                        continue
                    if step is None:
                        break
                    upsert_thinking_step(step)
                    yield format_agent_thinking_step_sse(step)

                while not thinking_queue.empty():
                    step = thinking_queue.get_nowait()
                    if step is not None:
                        upsert_thinking_step(step)
                        yield format_agent_thinking_step_sse(step)

                try:
                    agent_reply = await agent_task
                except StudioAgentUnavailableError as exc:
                    agent_error = exc
                except Exception as exc:
                    agent_error = exc

                if isinstance(agent_error, StudioAgentUnavailableError):
                    exc = agent_error
                    summary, telemetry_detail = _format_agent_run_error(exc)
                    error_payload = chat_error_payload(
                        code="chat_agent_unavailable",
                        summary=summary,
                        detail="",
                    )
                    error_text = format_chat_error_message(error_payload)
                    yield _chat_error_sse(error_payload)
                    agent_msg = _persist_agent_assistant_message(db, conversation, conversation_id, error_text)
                    assistant_message_id = agent_msg.id
                    _finish_chat_turn_telemetry(
                        db,
                        turn_tracker,
                        outcome="agent_error",
                        error_code="chat_agent_unavailable",
                        error_summary=telemetry_detail,
                        assistant_message_id=assistant_message_id,
                        finalized_holder=telemetry_finalized,
                    )
                    yield "data: [DONE]\n\n"
                    return
                if agent_error is not None:
                    exc = agent_error
                    logger.exception("Chat agent failed for conversation %s", conversation_id)
                    summary, telemetry_detail = _format_agent_run_error(exc)
                    error_payload = chat_error_payload(
                        code="chat_agent_error",
                        summary=summary,
                        detail="",
                    )
                    error_text = format_chat_error_message(error_payload)
                    yield _chat_error_sse(error_payload)
                    agent_msg = _persist_agent_assistant_message(db, conversation, conversation_id, error_text)
                    assistant_message_id = agent_msg.id
                    _finish_chat_turn_telemetry(
                        db,
                        turn_tracker,
                        outcome="agent_error",
                        error_code="chat_agent_error",
                        error_summary=telemetry_detail,
                        assistant_message_id=assistant_message_id,
                        finalized_holder=telemetry_finalized,
                    )
                    yield "data: [DONE]\n\n"
                    return

                assert agent_reply is not None
                compose_done = ChatAgentThinkingStep(
                    key="agent_compose",
                    label="整理回复",
                    detail="回复已生成",
                    status="done",
                ).to_dict()
                upsert_thinking_step(compose_done)
                yield format_agent_thinking_step_sse(compose_done)

                audit_details: dict[str, object] = {
                    "model_name": agent_reply.model_name,
                    "conversation_id": conversation_id,
                    "message_preview": content[:120],
                    "reply_preview": agent_reply.text[:240],
                    "tool_calls": [call.name for call in agent_reply.tool_calls],
                    "task_proposals": [item.get("proposal_id") for item in agent_reply.task_proposals],
                    "thinking_steps": [step.get("key") for step in collected_thinking_steps],
                    "policy_version": agent_reply.policy_version,
                }
                harness_audit = harness_audit_holder
                if isinstance(harness_audit, dict):
                    audit_details.update(harness_audit)

                write_audit_log(
                    db,
                    event_type=AuditEventType.STUDIO_AGENT_ASSIST,
                    actor_name=auth_user.name,
                    actor_id=auth_user.user_id,
                    target_type="chat_agent",
                    provider_name=agent_reply.provider_name,
                    details=audit_details,
                )

                full_content = agent_reply.text.strip() or "助手未返回内容，请重试。"
                assistant_message = _persist_agent_assistant_message(
                    db,
                    conversation,
                    conversation_id,
                    full_content,
                    tool_calls=agent_reply.tool_calls,
                    task_proposals=agent_reply.task_proposals,
                    thinking_steps=collected_thinking_steps,
                    policy_version=agent_reply.policy_version,
                    token_count=agent_reply.total_tokens,
                )
                provider_for_ledger = db.get(ProviderProfile, provider_profile_id)
                if provider_for_ledger is not None:
                    usage_payload = dict(agent_reply.usage_payload or {"source": "chat_agent"})
                    usage_payload.setdefault("prompt_tokens", agent_reply.prompt_tokens)
                    usage_payload.setdefault("completion_tokens", agent_reply.completion_tokens)
                    usage_payload.setdefault("total_tokens", agent_reply.total_tokens)
                    usage_payload.setdefault("input_tokens", agent_reply.prompt_tokens)
                    usage_payload.setdefault("output_tokens", agent_reply.completion_tokens)
                    usage_payload.setdefault("cached_input_tokens", agent_reply.cached_input_tokens)
                    record_chat_usage_ledger(
                        db,
                        message=assistant_message,
                        conversation=conversation,
                        provider=provider_for_ledger,
                        provider_profile_id=provider_profile_id,
                        user_id=auth_user.user_id,
                        user_name=auth_user.name,
                        provider_name=agent_reply.provider_name or provider_for_ledger.provider_name,
                        model_name=agent_reply.model_name or provider_for_ledger.model_name,
                        prompt_tokens=agent_reply.prompt_tokens,
                        completion_tokens=agent_reply.completion_tokens,
                        total_tokens=agent_reply.total_tokens,
                        usage_payload=usage_payload,
                    )
                    db.commit()

                _finish_chat_turn_telemetry(
                    db,
                    turn_tracker,
                    outcome="agent_success",
                    assistant_message_id=assistant_message.id,
                    finalized_holder=telemetry_finalized,
                )
                assistant_message_id = assistant_message.id

                async for chunk in stream_chat_agent_sse(agent_reply):
                    yield chunk
            except asyncio.CancelledError:
                if not telemetry_finalized.get("done"):
                    _finish_chat_turn_telemetry(
                        db,
                        turn_tracker,
                        outcome="interrupted",
                        error_code="chat_stream_interrupted",
                        error_summary="Agent 流式响应提前结束",
                        assistant_message_id=assistant_message_id,
                        finalized_holder=telemetry_finalized,
                    )
                raise
            except Exception as exc:
                logger.exception("Chat agent stream failed for conversation %s", conversation_id)
                if not telemetry_finalized.get("done"):
                    summary, telemetry_detail = _format_agent_run_error(exc)
                    error_payload = chat_error_payload(
                        code="chat_agent_error",
                        summary=summary,
                        detail="",
                    )
                    try:
                        error_text = format_chat_error_message(error_payload)
                        agent_msg = _persist_agent_assistant_message(
                            db, conversation, conversation_id, error_text
                        )
                        assistant_message_id = agent_msg.id
                        yield _chat_error_sse(error_payload)
                    except Exception:
                        logger.exception(
                            "failed to persist agent error message",
                            extra={"conversation_id": conversation_id},
                        )
                    _finish_chat_turn_telemetry(
                        db,
                        turn_tracker,
                        outcome="agent_error",
                        error_code="chat_agent_error",
                        error_summary=telemetry_detail,
                        assistant_message_id=assistant_message_id,
                        finalized_holder=telemetry_finalized,
                    )
            finally:
                if not telemetry_finalized.get("done"):
                    _finish_chat_turn_telemetry(
                        db,
                        turn_tracker,
                        outcome="interrupted",
                        error_code="chat_stream_interrupted",
                        error_summary="Agent 流式响应提前结束",
                        assistant_message_id=assistant_message_id,
                        finalized_holder=telemetry_finalized,
                    )

        return StreamingResponse(
            generate_agent(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    full_content_parts: list[str] = []
    last_error_payload: dict[str, object] | None = None
    last_usage_payload = {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "cached_input_tokens": 0,
        "uncached_input_tokens": 0,
    }

    async def generate():
        nonlocal last_error_payload, last_usage_payload, packed_context_tokens, packed_context_usage_percent

        assistant_persisted = False
        assistant_message_id: int | None = None
        status_pending: list[str] = []

        def queue_status(label: str) -> None:
            status_pending.append(label)
            turn_tracker.note_stage(label)

        def drain_status_events() -> list[str]:
            events: list[str] = []
            while status_pending:
                events.append(_chat_status_sse(status_pending.pop(0)))
            return events

        async def persist_outcome(*, full_content: str, record_memory: bool = True) -> int | None:
            nonlocal assistant_persisted, assistant_message_id
            if assistant_persisted:
                return assistant_message_id
            conversation_row = db.get(Conversation, conversation_id)
            provider_for_ledger = db.get(ProviderProfile, provider_profile_id)
            if conversation_row is None or provider_for_ledger is None:
                return None
            assistant_message = _persist_chat_assistant_reply(
                db,
                conversation_row=conversation_row,
                conversation_id=conversation_id,
                provider_for_ledger=provider_for_ledger,
                provider_profile_id=provider_profile_id,
                auth_user=auth_user,
                provider_name=provider_name,
                provider_model_name=provider_model_name,
                content=full_content,
                last_usage_payload=last_usage_payload,
                user_message=content,
                record_memory=record_memory,
            )
            assistant_persisted = True
            assistant_message_id = assistant_message.id
            return assistant_message.id

        try:
            yield f"data: {json.dumps({'correlation_id': get_correlation_id()}, ensure_ascii=False)}\n\n"
            yield _chat_status_sse("准备处理您的消息…")
            if len(all_messages) >= 12:
                yield _chat_status_sse("检查是否需要压缩早期对话…")

            conversation_row = db.get(Conversation, conversation_id)
            provider_row = db.get(ProviderProfile, provider_profile_id)
            if conversation_row is None:
                last_error_payload = chat_error_payload(
                    code="chat_conversation_missing",
                    summary="会话不存在",
                    detail="Conversation missing",
                )
                yield _chat_error_sse(last_error_payload)
                _finish_chat_turn_telemetry(
                    db,
                    turn_tracker,
                    outcome="stream_error",
                    error_code="chat_conversation_missing",
                    error_summary=str(last_error_payload.get("summary") or ""),
                    finalized_holder=telemetry_finalized,
                )
                yield "data: [DONE]\n\n"
                return

            memory_context = (
                build_compacted_memory_context(
                    db,
                    user_id=auth_user.user_id,
                    conversation_id=conversation_id,
                    query=content,
                ).context
                if auth_user.user_id is not None
                else ""
            )
            if memory_context.strip():
                yield _chat_status_sse("正在召回相关记忆…")

            yield _chat_status_sse("正在整理对话上下文…")
            turn_tracker.mark_pack_start()
            pack_task = asyncio.create_task(
                pack_chat_context(
                    db,
                    conversation_row,
                    all_messages,
                    provider_config,
                    provider_profile=provider_row,
                    memory_context=memory_context,
                    on_status=queue_status,
                )
            )
            while not pack_task.done():
                for event in drain_status_events():
                    yield event
                await asyncio.sleep(0.05)
            for event in drain_status_events():
                yield event

            try:
                packed = pack_task.result()
            except HTTPException as exc:
                detail = str(exc.detail or "Attachment processing failed.")
                last_error_payload = chat_error_payload(
                    code="chat_attachment_error",
                    summary="对话失败：附件处理出错。",
                    detail=detail,
                    status_code=exc.status_code,
                )
                yield _chat_error_sse(last_error_payload)
                assistant_message_id = await persist_outcome(
                    full_content=format_chat_error_message(last_error_payload),
                    record_memory=False,
                )
                _finish_chat_turn_telemetry(
                    db,
                    turn_tracker,
                    outcome="attachment_error",
                    error_code=str(last_error_payload.get("code") or "chat_attachment_error"),
                    error_summary=str(last_error_payload.get("summary") or ""),
                    assistant_message_id=assistant_message_id,
                    finalized_holder=telemetry_finalized,
                )
                yield "data: [DONE]\n\n"
                return

            context_payload = packed.context_payload()
            packed_context_tokens = int(context_payload.get("tokens") or 0)
            packed_context_usage_percent = int(context_payload.get("usage_percent") or 0)
            turn_tracker.mark_pack_end(
                context_tokens=packed_context_tokens,
                context_usage_percent=packed_context_usage_percent,
            )
            yield f"data: {json.dumps({'context': context_payload}, ensure_ascii=False)}\n\n"
            yield _chat_status_sse("正在连接模型并生成回复…", status="generating")
            turn_tracker.mark_upstream_start()

            async for chunk in stream_chat_completion(provider_config, packed.api_messages):
                if chunk.startswith("data: ") and "[DONE]" not in chunk:
                    try:
                        data = json.loads(chunk[6:])
                        if "delta" in data:
                            turn_tracker.mark_first_token()
                            full_content_parts.append(str(data["delta"]))
                        if "usage" in data and isinstance(data["usage"], dict):
                            usage = normalize_chat_usage(data["usage"])
                            last_usage_payload = {
                                "prompt_tokens": usage.prompt_tokens,
                                "completion_tokens": usage.completion_tokens,
                                "total_tokens": usage.total_tokens,
                                "input_tokens": usage.input_tokens,
                                "output_tokens": usage.output_tokens,
                                "cached_input_tokens": usage.cached_input_tokens,
                                "uncached_input_tokens": usage.uncached_input_tokens,
                                **usage.usage_payload,
                            }
                        if "error" in data:
                            raw_error = data["error"]
                            if isinstance(raw_error, dict):
                                last_error_payload = raw_error
                            else:
                                last_error_payload = {
                                    "summary": str(raw_error),
                                    "detail": str(raw_error),
                                    "code": "chat_stream_error",
                                }
                    except (json.JSONDecodeError, TypeError, ValueError):
                        pass
                yield chunk

            full_content = "".join(full_content_parts)
            if full_content:
                assistant_message_id = await persist_outcome(full_content=full_content, record_memory=True)
                _finish_chat_turn_telemetry(
                    db,
                    turn_tracker,
                    outcome="success",
                    assistant_message_id=assistant_message_id,
                    context_tokens=packed_context_tokens,
                    context_usage_percent=packed_context_usage_percent,
                    finalized_holder=telemetry_finalized,
                )
            elif last_error_payload:
                assistant_message_id = await persist_outcome(
                    full_content=format_chat_error_message(last_error_payload),
                    record_memory=False,
                )
                _finish_chat_turn_telemetry(
                    db,
                    turn_tracker,
                    outcome=resolve_outcome_from_error_code(str(last_error_payload.get("code") or "")),
                    error_code=str(last_error_payload.get("code") or ""),
                    error_summary=str(last_error_payload.get("summary") or ""),
                    assistant_message_id=assistant_message_id,
                    context_tokens=packed_context_tokens,
                    context_usage_percent=packed_context_usage_percent,
                    finalized_holder=telemetry_finalized,
                )
            else:
                last_error_payload = chat_error_payload(
                    code="chat_stream_interrupted",
                    summary="对话中断：回复未完成。",
                    detail="连接可能在模型回复前断开。请勿重复发送，稍等片刻后重试；若仍失败请联系管理员。",
                )
                yield _chat_error_sse(last_error_payload)
                assistant_message_id = await persist_outcome(
                    full_content=format_chat_error_message(last_error_payload),
                    record_memory=False,
                )
                _finish_chat_turn_telemetry(
                    db,
                    turn_tracker,
                    outcome="interrupted",
                    error_code="chat_stream_interrupted",
                    error_summary=str(last_error_payload.get("summary") or ""),
                    assistant_message_id=assistant_message_id,
                    context_tokens=packed_context_tokens,
                    context_usage_percent=packed_context_usage_percent,
                    finalized_holder=telemetry_finalized,
                )
        except asyncio.CancelledError:
            if not assistant_persisted and not full_content_parts:
                last_error_payload = chat_error_payload(
                    code="chat_stream_interrupted",
                    summary="对话中断：回复未完成。",
                    detail="请求连接已断开（可能因重复发送或网络波动）。请等待当前处理结束后再试，不要连续点击发送。",
                )
                try:
                    assistant_message_id = await persist_outcome(
                        full_content=format_chat_error_message(last_error_payload),
                        record_memory=False,
                    )
                except Exception:
                    logger.exception(
                        "failed to persist interrupted chat message",
                        extra={"conversation_id": conversation_id},
                    )
                    assistant_message_id = None
            _finish_chat_turn_telemetry(
                db,
                turn_tracker,
                outcome="interrupted",
                error_code="chat_stream_interrupted",
                error_summary="请求连接已断开",
                assistant_message_id=assistant_message_id,
                context_tokens=packed_context_tokens,
                context_usage_percent=packed_context_usage_percent,
                finalized_holder=telemetry_finalized,
            )
            raise
        except Exception as exc:
            logger.exception("chat stream failed", extra={"conversation_id": conversation_id})
            if not assistant_persisted and not full_content_parts:
                last_error_payload = chat_error_payload(
                    code="chat_stream_error",
                    summary="对话失败：请求过程中出现异常。",
                    detail="",
                )
                yield _chat_error_sse(last_error_payload)
                try:
                    assistant_message_id = await persist_outcome(
                        full_content=format_chat_error_message(last_error_payload),
                        record_memory=False,
                    )
                except Exception:
                    logger.exception(
                        "failed to persist chat error message",
                        extra={"conversation_id": conversation_id},
                    )
                    assistant_message_id = None
            _finish_chat_turn_telemetry(
                db,
                turn_tracker,
                outcome="stream_error",
                error_code="chat_stream_error",
                error_summary=_sanitize_error_text(str(exc), limit=255),
                assistant_message_id=assistant_message_id,
                context_tokens=packed_context_tokens,
                context_usage_percent=packed_context_usage_percent,
                finalized_holder=telemetry_finalized,
            )
        finally:
            if not telemetry_finalized.get("done"):
                _finish_chat_turn_telemetry(
                    db,
                    turn_tracker,
                    outcome="interrupted",
                    error_code="chat_stream_interrupted",
                    error_summary="流式响应提前结束",
                    assistant_message_id=assistant_message_id,
                    context_tokens=packed_context_tokens,
                    context_usage_percent=packed_context_usage_percent,
                    finalized_holder=telemetry_finalized,
                )

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
