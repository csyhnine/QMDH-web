"""Chat API router: conversations, messages, streaming."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import AuditEventType, write_audit_log
from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import AgentSkillRelease, ChatMessage, Conversation, ProviderProfile, User
from app.schemas import (
    AssignedAgentOut,
    ChatAttachmentOut,
    ChatAttachmentUploadIn,
    ChatAttachmentUploadOut,
    AgentChatToolOut,
    ChatAgentPolicyLayerOut,
    ChatAgentPolicyOut,
    ChatAgentTaskConfirmIn,
    ChatAgentTaskProposalOut,
    ChatAgentThinkingStepOut,
    ChatAgentToolCallOut,
    ChatMessageCreate,
    ChatMessageOut,
    ChatModelOut,
    ChatWordExportIn,
    ConversationCreate,
    ConversationOut,
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
    build_provider_messages,
    chat_attachment_out,
    serialize_chat_attachments,
)
from app.services.chat_word_export import build_chat_word_document, default_chat_word_file_name
from app.services.media_storage import resolve_storage_path, write_binary_asset
from app.integrations.studio_agent.agent import ChatAgentThinkingStep, StudioAgentReply, StudioAgentUnavailableError
from app.services.multi_agent_runner import get_harness_audit, resume_multi_agent_graph_after_task_confirm, run_multi_agent_chat_isolated
from app.services.agent_persona_service import load_user_agent_roster
from app.services.chat_agent_service import (
    embed_agent_message_meta,
    format_agent_thinking_sse,
    format_agent_thinking_step_sse,
    parse_agent_message_meta,
    stream_chat_agent_sse,
)
from app.services.agent_policy_service import (
    CHAT_AGENT_BASELINE_PROMPT,
    build_chat_policy_summary,
    resolve_effective_chat_policy,
)
from app.services.chat_service import (
    chat_error_payload,
    format_chat_error_message,
    get_chat_models,
    provider_profile_has_usable_api_key,
    snapshot_chat_provider_config,
    stream_chat_completion,
)
from app.services.billing import enforce_user_quota, normalize_chat_usage
from app.services.chat_agent_task_service import proposal_from_confirm_payload, submit_confirmed_chat_agent_task
from app.services.usage_ledger import record_chat_usage_ledger

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


def _format_agent_run_error(exc: Exception) -> tuple[str, str]:
    detail = str(exc).strip()
    lowered = detail.lower()
    if "max retries" in lowered:
        return (
            "助手工具调用失败，常见原因是模型名称或生图参数不正确。"
            "请先让它「列出可用模型」，或前往 Studio 生图。",
            detail[:320],
        )
    if "provider not found" in lowered:
        return ("未找到指定的生图模型，请先列出可用模型后再试。", detail[:320])
    return ("助手调用失败，请稍后重试。", detail[:320])


async def parse_chat_message_payload(request: Request) -> ChatMessageCreate:
    raw_body = await request.json()
    if isinstance(raw_body, str):
        raw_body = json.loads(raw_body)
    return ChatMessageCreate.model_validate(raw_body)


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
) -> None:
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
        token_count=0,
    )
    db.add(assistant_message)
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()


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


def _verify_owner(db: Session, conversation_id: int, user_id: int) -> Conversation:
    conversation = db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != user_id:
        raise HTTPException(status_code=403, detail="Conversation access denied")
    return conversation


@router.get("/models", response_model=list[ChatModelOut])
def list_chat_models(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
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
    return ConversationOut(
        id=conversation.id,
        title=conversation.title,
        model_provider_id=conversation.model_provider_id,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[ConversationOut]:
    conversations = db.scalars(
        select(Conversation)
        .where(Conversation.user_id == auth_user.user_id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
    ).all()
    return [
        ConversationOut(
            id=conversation.id,
            title=conversation.title,
            model_provider_id=conversation.model_provider_id,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
        )
        for conversation in conversations
    ]


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
    return [_serialize_chat_message_out(message) for message in messages]


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
    roster = load_user_agent_roster(db, auth_user.user_id)
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
        assigned_agents=[
            AssignedAgentOut(
                key=item.key,
                display_name=item.display_name,
                role=item.role,
                is_primary=item.is_primary,
            )
            for item in roster
        ],
    )


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

    graph_resumed = resume_multi_agent_graph_after_task_confirm(
        db,
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
            "graph_resumed": graph_resumed,
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
    provider = db.get(ProviderProfile, conversation.model_provider_id)
    if not provider or not provider.enabled:
        raise HTTPException(status_code=400, detail="Model is disabled or missing")
    if not provider_profile_has_usable_api_key(provider):
        raise HTTPException(
            status_code=503,
            detail="该模型的 API Key 当前不可用，请检查 QMDH_ENCRYPTION_KEY 或在模型管理页重新录入密钥。",
        )
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
    db.add(user_message)

    if conversation.title == "新对话":
        conversation.title = content[:50] or (attachments[0]["file_name"][:50] if attachments else "新对话")
    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()

    all_messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    ).all()
    recent = all_messages[-50:] if len(all_messages) > 50 else all_messages

    if payload.agent_mode:
        policy_version = (payload.policy_version or "").strip() or None

        async def generate_agent():
            loop = asyncio.get_running_loop()
            thinking_queue: asyncio.Queue[dict[str, str] | None] = asyncio.Queue()
            collected_thinking_steps: list[dict[str, object]] = []

            def thinking_callback(step: ChatAgentThinkingStep) -> None:
                payload = step.to_dict()
                loop.call_soon_threadsafe(thinking_queue.put_nowait, payload)

            async def run_agent() -> StudioAgentReply:
                try:
                    return await asyncio.to_thread(
                        run_multi_agent_chat_isolated,
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
                collected_thinking_steps.append(step)
                yield format_agent_thinking_step_sse(step)

            while not thinking_queue.empty():
                step = thinking_queue.get_nowait()
                if step is not None:
                    collected_thinking_steps.append(step)
                    yield format_agent_thinking_step_sse(step)

            try:
                agent_reply = await agent_task
            except StudioAgentUnavailableError as exc:
                agent_error = exc
            except Exception as exc:
                agent_error = exc

            if isinstance(agent_error, StudioAgentUnavailableError):
                exc = agent_error
                summary, detail = _format_agent_run_error(exc)
                error_text = format_chat_error_message(
                    chat_error_payload(
                        code="chat_agent_unavailable",
                        summary=summary,
                        detail=detail,
                    )
                )
                yield f"data: {json.dumps({'error': {'summary': error_text, 'detail': detail, 'code': 'chat_agent_unavailable'}}, ensure_ascii=False)}\n\n"
                _persist_agent_assistant_message(db, conversation, conversation_id, error_text)
                yield "data: [DONE]\n\n"
                return
            if agent_error is not None:
                exc = agent_error
                logger.exception("Chat agent failed for conversation %s", conversation_id)
                summary, detail = _format_agent_run_error(exc)
                error_text = format_chat_error_message(
                    chat_error_payload(
                        code="chat_agent_error",
                        summary=summary,
                        detail=detail,
                    )
                )
                yield f"data: {json.dumps({'error': {'summary': error_text, 'detail': detail, 'code': 'chat_agent_error'}}, ensure_ascii=False)}\n\n"
                _persist_agent_assistant_message(db, conversation, conversation_id, error_text)
                yield "data: [DONE]\n\n"
                return

            assert agent_reply is not None
            compose_done = ChatAgentThinkingStep(
                key="agent_compose",
                label="整理回复",
                detail="回答已生成",
                status="done",
            ).to_dict()
            collected_thinking_steps.append(compose_done)
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
            audit_details.update(get_harness_audit(agent_reply))

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
            _persist_agent_assistant_message(
                db,
                conversation,
                conversation_id,
                full_content,
                tool_calls=agent_reply.tool_calls,
                task_proposals=agent_reply.task_proposals,
                thinking_steps=collected_thinking_steps,
                policy_version=agent_reply.policy_version,
            )

            async for chunk in stream_chat_agent_sse(agent_reply):
                yield chunk

        return StreamingResponse(
            generate_agent(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    api_messages = build_provider_messages(recent)

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
        nonlocal last_error_payload, last_usage_payload

        async for chunk in stream_chat_completion(provider_config, api_messages):
            if chunk.startswith("data: ") and "[DONE]" not in chunk:
                try:
                    data = json.loads(chunk[6:])
                    if "delta" in data:
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
            assistant_message = ChatMessage(
                conversation_id=conversation_id,
                role="assistant",
                content=full_content,
                token_count=last_usage_payload["total_tokens"],
            )
            db.add(assistant_message)
            conversation.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(assistant_message)
            record_chat_usage_ledger(
                db,
                message=assistant_message,
                conversation=conversation,
                provider=provider,
                provider_profile_id=provider_profile_id,
                user_id=auth_user.user_id,
                user_name=auth_user.name,
                provider_name=provider_name,
                model_name=provider_model_name,
                prompt_tokens=last_usage_payload["prompt_tokens"],
                completion_tokens=last_usage_payload["completion_tokens"],
                total_tokens=last_usage_payload["total_tokens"],
                usage_payload=last_usage_payload,
            )
            db.commit()
        elif last_error_payload:
            assistant_message = ChatMessage(
                conversation_id=conversation_id,
                role="assistant",
                content=format_chat_error_message(last_error_payload),
                token_count=last_usage_payload["total_tokens"],
            )
            db.add(assistant_message)
            conversation.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(assistant_message)
            record_chat_usage_ledger(
                db,
                message=assistant_message,
                conversation=conversation,
                provider=provider,
                provider_profile_id=provider_profile_id,
                user_id=auth_user.user_id,
                user_name=auth_user.name,
                provider_name=provider_name,
                model_name=provider_model_name,
                prompt_tokens=last_usage_payload["prompt_tokens"],
                completion_tokens=last_usage_payload["completion_tokens"],
                total_tokens=last_usage_payload["total_tokens"],
                usage_payload=last_usage_payload,
            )
            db.commit()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
