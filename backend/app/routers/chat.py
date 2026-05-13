"""Chat API router: conversations, messages, streaming."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import ChatMessage, Conversation, ProviderProfile
from app.schemas import (
    ChatMessageCreate,
    ChatMessageOut,
    ChatModelOut,
    ConversationCreate,
    ConversationOut,
)
from app.services.chat_service import build_chat_messages, get_chat_models, stream_chat_completion

router = APIRouter(prefix="/chat", tags=["chat"])


def _verify_owner(db: Session, conversation_id: int, user_id: int) -> Conversation:
    conv = db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    if conv.user_id != user_id:
        raise HTTPException(status_code=403, detail="无权访问该对话")
    return conv


@router.get("/models", response_model=list[ChatModelOut])
def list_chat_models(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[ChatModelOut]:
    models = get_chat_models(db)
    return [
        ChatModelOut(
            provider_id=m.id,
            provider_name=m.provider_name,
            model_name=m.model_name,
            base_url=m.base_url,
        )
        for m in models
    ]


@router.post("/conversations", response_model=ConversationOut, status_code=201)
def create_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ConversationOut:
    conv = Conversation(
        user_id=auth_user.user_id,
        title=payload.title.strip() or "新对话",
        model_provider_id=payload.model_provider_id,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return ConversationOut(
        id=conv.id,
        title=conv.title,
        model_provider_id=conv.model_provider_id,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[ConversationOut]:
    convs = db.scalars(
        select(Conversation)
        .where(Conversation.user_id == auth_user.user_id)
        .order_by(Conversation.updated_at.desc())
    ).all()
    return [
        ConversationOut(
            id=c.id,
            title=c.title,
            model_provider_id=c.model_provider_id,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in convs
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
        ChatMessageOut(id=m.id, role=m.role, content=m.content, created_at=m.created_at)
        for m in messages
    ]


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
):
    conv = _verify_owner(db, conversation_id, auth_user.user_id)
    db.delete(conv)
    db.commit()
    return Response(status_code=204)


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: int,
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
):
    conv = _verify_owner(db, conversation_id, auth_user.user_id)

    # Get provider
    if not conv.model_provider_id:
        raise HTTPException(status_code=400, detail="对话未关联模型")
    provider = db.get(ProviderProfile, conv.model_provider_id)
    if not provider or not provider.enabled:
        raise HTTPException(status_code=400, detail="模型已禁用或不存在")

    # Persist user message
    user_msg = ChatMessage(
        conversation_id=conversation_id,
        role="user",
        content=payload.content.strip(),
    )
    db.add(user_msg)

    # Update conversation title if first message
    existing_count = db.scalar(
        select(ChatMessage.id).where(ChatMessage.conversation_id == conversation_id).limit(2)
    )
    if conv.title == "新对话":
        conv.title = payload.content.strip()[:50]

    db.commit()

    # Build messages for API call
    messages = build_chat_messages(db, conversation_id, "")
    # Remove the empty last message (we already added user_msg to DB)
    # Actually rebuild without appending since user msg is already in DB
    all_msgs = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    ).all()
    recent = all_msgs[-50:] if len(all_msgs) > 50 else all_msgs
    api_messages = [{"role": m.role, "content": m.content} for m in recent]

    # Stream response
    full_content_parts: list[str] = []

    async def generate():
        async for chunk in stream_chat_completion(provider, api_messages):
            # Collect content for persistence
            if chunk.startswith("data: ") and "[DONE]" not in chunk:
                try:
                    data = json.loads(chunk[6:])
                    if "delta" in data:
                        full_content_parts.append(data["delta"])
                except (json.JSONDecodeError, KeyError):
                    pass
            yield chunk

        # Persist assistant message after streaming completes
        full_content = "".join(full_content_parts)
        if full_content:
            assistant_msg = ChatMessage(
                conversation_id=conversation_id,
                role="assistant",
                content=full_content,
            )
            db.add(assistant_msg)
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
