"""Feedback-only authentication and atomic, persistent submission quotas."""
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException
from sqlalchemy import case, or_, select, update
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse

from app.core.security import hash_session_token
from app.database import get_db
from app.models import SkillFeedbackCredential, User


def get_feedback_credential(x_qmdh_feedback_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    if not x_qmdh_feedback_token or not x_qmdh_feedback_token.startswith("qfb_") or len(x_qmdh_feedback_token) > 100:
        raise HTTPException(401, "Feedback credential required")
    now = datetime.now(timezone.utc)
    credential = db.scalar(select(SkillFeedbackCredential).join(User, User.id == SkillFeedbackCredential.owner_id).where(
        SkillFeedbackCredential.token_hash == hash_session_token(x_qmdh_feedback_token),
        SkillFeedbackCredential.is_active.is_(True), SkillFeedbackCredential.expires_at > now, User.is_active.is_(True)))
    if credential is None:
        raise HTTPException(401, "Feedback credential invalid, revoked or expired")
    minute = now.replace(second=0, microsecond=0)
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    cls = SkillFeedbackCredential
    new_minute = or_(cls.minute_start.is_(None), cls.minute_start < minute)
    new_day = or_(cls.day_start.is_(None), cls.day_start < day)
    # One conditional UPDATE prevents concurrent workers from overspending a quota.
    result = db.execute(update(cls).where(cls.id == credential.id, cls.is_active.is_(True), cls.expires_at > now,
        or_(new_minute, cls.minute_count < cls.per_minute), or_(new_day, cls.day_count < cls.per_day)).values(
        minute_count=case((new_minute, 1), else_=cls.minute_count + 1), minute_start=minute,
        day_count=case((new_day, 1), else_=cls.day_count + 1), day_start=day).execution_options(synchronize_session=False))
    if result.rowcount != 1:
        db.rollback()
        db.refresh(credential)
        if not credential.is_active or credential.expires_at.replace(tzinfo=timezone.utc) <= now:
            raise HTTPException(401, "Feedback credential invalid, revoked or expired")
        reset = day + timedelta(days=1) if credential.day_count >= credential.per_day else minute + timedelta(minutes=1)
        delay = int((reset - now).total_seconds()) + 1
        raise HTTPException(429, "Feedback submission quota exceeded", headers={"Retry-After": str(delay)})
    db.commit()
    return credential


class FeedbackBodyLimitMiddleware:
    """Bound the raw body before FastAPI's JSON parser, including chunked requests."""
    def __init__(self, app, max_bytes=65536):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "POST" or scope.get("path", "").rstrip("/") not in ("/api/v1/feedback/skills/events", "/feedback/skills/events"):
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            return await JSONResponse({"detail": "Invalid Content-Length"}, status_code=400)(scope, receive, send)
        if declared < 0 or declared > self.max_bytes:
            return await JSONResponse({"detail": "Event exceeds 64 KiB"}, status_code=413)(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > self.max_bytes:
                return await JSONResponse({"detail": "Event exceeds 64 KiB"}, status_code=413)(scope, receive, send)
            body.extend(chunk)
            if not message.get("more_body", False):
                break
        delivered = False
        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()
        await self.app(scope, bounded_receive, send)
