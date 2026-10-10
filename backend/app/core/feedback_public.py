"""Anonymous intake budgets. Caller headers never establish an identity."""
from datetime import datetime, timedelta, timezone
import hashlib
import ipaddress

from fastapi import HTTPException, Request
from sqlalchemy import case, delete, or_, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.models import SkillFeedbackPublicQuota
from app.core.config import settings


def origin_hash(request: Request) -> str:
    # Default: transport peer. An explicitly trusted ingress may supply the
    # single X-Real-IP it overwrites; never trust a caller's X-Forwarded-For.
    peer = request.client.host if request.client else "unknown"
    try:
        address = ipaddress.ip_address(peer)
        trusted = [ipaddress.ip_network(item.strip()) for item in settings.feedback_trusted_proxy_cidrs.split(",") if item.strip()]
        if any(address in network for network in trusted):
            forwarded = request.headers.get("x-real-ip")
            if forwarded:
                address = ipaddress.ip_address(forwarded)
        # Rotating addresses inside an IPv6 /64 must not create new allocations.
        peer = str(ipaddress.ip_network(f"{address}/64", strict=False)) if address.version == 6 else str(address)
    except ValueError:
        # Invalid proxy config/header falls back to the peer, never arbitrary text.
        try:
            address = ipaddress.ip_address(peer)
            peer = str(ipaddress.ip_network(f"{address}/64", strict=False)) if address.version == 6 else str(address)
        except ValueError:
            pass
    return hashlib.sha256(peer.encode()).hexdigest()


def consume_public_budget(db, kind: str, origin: str, now: datetime | None = None):
    """Atomic global + peer budgets, in the caller's transaction; fail closed."""
    now = now or datetime.now(timezone.utc)
    hour = now.replace(minute=0, second=0, microsecond=0)
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # A rotating credential, task id or skill version cannot bypass these limits.
    limits = (("global", 50, 200), (origin, 5, 20)) if kind == "session" else (("global", 500, 2000), (origin, 50, 100))
    dialect = db.get_bind().dialect.name
    insert = pg_insert if dialect == "postgresql" else sqlite_insert if dialect == "sqlite" else None
    if insert is None:
        raise HTTPException(503, "Public feedback quota storage unavailable")
    cls = SkillFeedbackPublicQuota
    # Accepted origins are bounded by the global allocation. Drop only stale
    # rate-limit metadata, never credentials, task records or evidence.
    db.execute(delete(cls).where(cls.day_start < day - timedelta(days=2)))
    for scope, hourly, daily in limits:
        key = f"{kind}:{scope}"
        db.execute(insert(cls).values(key=key, hour_start=hour, day_start=day, hour_count=0, day_count=0).on_conflict_do_nothing(index_elements=[cls.key]))
        new_hour = cls.hour_start < hour
        new_day = cls.day_start < day
        result = db.execute(update(cls).where(cls.key == key,
            or_(new_hour, cls.hour_count < hourly), or_(new_day, cls.day_count < daily)).values(
                hour_start=hour, day_start=day,
                hour_count=case((new_hour, 1), else_=cls.hour_count + 1),
                day_count=case((new_day, 1), else_=cls.day_count + 1)).execution_options(synchronize_session=False))
        if result.rowcount != 1:
            row = db.get(cls, key, populate_existing=True)
            reset = day + timedelta(days=1) if row.day_count >= daily else hour + timedelta(hours=1)
            db.rollback()
            raise HTTPException(429, "Public feedback quota exceeded", headers={"Retry-After": str(int((reset-now).total_seconds())+1)})
