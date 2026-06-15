"""Chat API router: conversations, messages, streaming."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import ChatMessage, Conversation, ProviderProfile, User
from app.schemas import (
    ChatAttachmentOut,
    ChatAttachmentUploadIn,
    ChatAttachmentUploadOut,
    ChatMessageCreate,
    ChatMessageOut,
    ChatModelOut,
    ChatWordExportIn,
    ConversationCreate,
    ConversationOut,
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
from app.services.chat_service import (
    format_chat_error_message,
    get_chat_models,
    provider_profile_has_usable_api_key,
    snapshot_chat_provider_config,
    stream_chat_completion,
)
from app.services.billing import enforce_user_quota, normalize_chat_usage
from app.services.usage_ledger import record_chat_usage_ledger

router = APIRouter(prefix="/chat", tags=["chat"])


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
    return [
        ChatMessageOut(
            id=message.id,
            role=message.role,
            content=message.content,
            attachments=[
                ChatAttachmentOut(**chat_attachment_out(item))
                for item in (message.attachments_json or [])
                if isinstance(item, dict)
            ],
            created_at=message.created_at,
        )
        for message in messages
    ]


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
