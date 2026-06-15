from contextlib import asynccontextmanager
import logging
import uuid

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from redis import Redis

from app.core.config import settings, validate_required_for_production
from app.core.logging import setup_logging
from app.core.middleware import (
    AccessLogMiddleware,
    CorrelationIdMiddleware,
    StrictCORSMiddleware,
    UnhandledExceptionMiddleware,
)
from app.core.rate_limit import RateLimitMiddleware
from app.database import Base, SessionLocal, engine
from app.routers import agent, assets, auth, chat, dashboard, feedback, health, inspiration, projects, prompt_templates, providers, search, studio_agent, tasks, users, workflows
from app.services.bootstrap import ensure_schema, seed_initial_data
from app.services.media_storage import media_root_path, validate_storage_backend_configuration
from app.services.session_cleanup import run_session_cleanup_once
from app.services.task_stale_recovery import recover_stale_tasks

# Configure structured logging before startup validation.
setup_logging()

# Validate required env vars before binding port (exits if missing in production)
validate_required_for_production()
validate_storage_backend_configuration()

SESSION_CLEANUP_LOCK_KEY = "qmdh:session-cleanup-lock"
SESSION_CLEANUP_LOCK_TTL_SECONDS = 300
SESSION_CLEANUP_UNLOCK_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
end
return 0
"""


def _run_session_cleanup_job() -> None:
    logger = logging.getLogger(__name__)
    lock_token = uuid.uuid4().hex
    client = Redis.from_url(settings.redis_url, decode_responses=True)
    acquired = False

    try:
        acquired = bool(client.set(
            SESSION_CLEANUP_LOCK_KEY,
            lock_token,
            nx=True,
            ex=SESSION_CLEANUP_LOCK_TTL_SECONDS,
        ))
        if not acquired:
            logger.info("Session cleanup skipped because lock is already held")
            return
        run_session_cleanup_once(SessionLocal)
    except Exception:
        logger.exception("Scheduled session cleanup failed")
    finally:
        if acquired:
            try:
                client.eval(SESSION_CLEANUP_UNLOCK_SCRIPT, 1, SESSION_CLEANUP_LOCK_KEY, lock_token)
            except Exception:
                logger.exception("Failed to release session cleanup lock")
        client.close()


def _run_stale_task_recovery_job() -> None:
    logger = logging.getLogger(__name__)
    try:
        with SessionLocal() as db:
            recovered = recover_stale_tasks(db)
        if recovered:
            logger.info("Recovered %s stale task(s)", recovered)
    except Exception:
        logger.exception("Stale task recovery failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_schema(engine)
    media_root_path()
    with SessionLocal() as db:
        seed_initial_data(db)
        recover_stale_tasks(db)

    scheduler = BackgroundScheduler()
    scheduler.add_job(
        _run_session_cleanup_job,
        "interval",
        seconds=settings.get_session_cleanup_interval_seconds(),
        id="session_cleanup",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        _run_stale_task_recovery_job,
        "interval",
        seconds=120,
        id="stale_task_recovery",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.start()

    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(title=settings.app_name, lifespan=lifespan)

# Middleware stack order (outermost first):
# CORS → CorrelationId → AccessLog → RateLimit → UnhandledException
# Note: FastAPI applies middleware in reverse add order, so add innermost first.
app.add_middleware(UnhandledExceptionMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(AccessLogMiddleware)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(
    StrictCORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.mount(settings.media_url_prefix, StaticFiles(directory=media_root_path()), name="media")


app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(projects.router, prefix=settings.api_prefix)
app.include_router(providers.router, prefix=settings.api_prefix)
app.include_router(workflows.router, prefix=settings.api_prefix)
app.include_router(tasks.router, prefix=settings.api_prefix)
app.include_router(agent.router, prefix=settings.api_prefix)
app.include_router(assets.router, prefix=settings.api_prefix)
app.include_router(feedback.router, prefix=settings.api_prefix)
app.include_router(dashboard.router, prefix=settings.api_prefix)
app.include_router(prompt_templates.router, prefix=settings.api_prefix)
app.include_router(users.router, prefix=settings.api_prefix)
app.include_router(inspiration.router, prefix=settings.api_prefix)
app.include_router(chat.router, prefix=settings.api_prefix)
app.include_router(search.router, prefix=settings.api_prefix)
if settings.studio_agent_enabled:
    app.include_router(studio_agent.router, prefix=settings.api_prefix)
