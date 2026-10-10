import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import tempfile
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core.feedback_security import FeedbackBodyLimitMiddleware, get_feedback_credential
from app.core.security import hash_session_token
from app.database import Base
from app.models import SkillFeedbackCredential, User


def test_chunked_body_rejected_before_parser_and_normal_body_preserved():
    async def exercise(chunks, headers=[]):
        sent = []
        delivered = []
        async def downstream(scope, receive, send):
            delivered.append((await receive())["body"])
        messages = [{"type": "http.request", "body": chunk, "more_body": i < len(chunks)-1} for i, chunk in enumerate(chunks)]
        async def receive():
            return messages.pop(0)
        async def send(message):
            sent.append(message)
        await FeedbackBodyLimitMiddleware(downstream)({"type": "http", "path": "/api/v1/feedback/skills/events", "method": "POST", "headers": headers}, receive, send)
        return sent, delivered
    sent, delivered = asyncio.run(exercise([b"a" * 40000, b"b" * 40000]))
    assert not delivered
    assert sent[0]["status"] == 413
    _, delivered = asyncio.run(exercise([b'{"value":', b'"ok"}']))
    assert delivered == [b'{"value":"ok"}']
    sent, delivered = asyncio.run(exercise([], [(b"content-length", b"70000")]))
    assert sent[0]["status"] == 413 and not delivered


def test_atomic_quota_under_concurrent_database_sessions():
    with tempfile.TemporaryDirectory() as folder:
        engine = create_engine("sqlite:///" + Path(folder, "quota.db").as_posix(), connect_args={"check_same_thread": False, "timeout": 20})
        Base.metadata.create_all(engine)
        sessions = sessionmaker(bind=engine)
        token = "qfb_concurrency-test-only"
        with sessions() as db:
            db.add(User(id=1, name="quota-test", password_hash="not-used", role="designer", is_active=True))
            db.add(SkillFeedbackCredential(owner_id=1, device_name="test", token_hash=hash_session_token(token), allowed_skills=[], expires_at=datetime.now(timezone.utc) + timedelta(days=1), per_minute=5, per_day=5))
            db.commit()
        def attempt(_):
            with sessions() as db:
                try:
                    get_feedback_credential(token, db)
                    return 200
                except HTTPException as error:
                    return error.status_code
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(attempt, range(20)))
        assert results.count(200) == 5
        assert results.count(429) == 15
        with sessions() as db:
            row = db.scalar(select(SkillFeedbackCredential))
            assert row.minute_count == row.day_count == 5
        engine.dispose()
