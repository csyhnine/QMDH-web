from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings, validate_required_for_production
from app.core.middleware import AccessLogMiddleware, CorrelationIdMiddleware, UnhandledExceptionMiddleware
from app.core.rate_limit import RateLimitMiddleware
from app.database import Base, SessionLocal, engine
from app.routers import assets, auth, chat, dashboard, health, inspiration, projects, prompt_templates, providers, tasks, users, workflows
from app.services.bootstrap import ensure_schema, seed_initial_data
from app.services.media_storage import media_root_path

# Validate required env vars before binding port (exits if missing in production)
validate_required_for_production()

app = FastAPI(title=settings.app_name)

# Middleware stack order (outermost first):
# CORS → CorrelationId → AccessLog → RateLimit → UnhandledException
# Note: FastAPI applies middleware in reverse add order, so add innermost first.
app.add_middleware(UnhandledExceptionMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(AccessLogMiddleware)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_schema(engine)
    media_root_path()
    with SessionLocal() as db:
        seed_initial_data(db)


app.mount(settings.media_url_prefix, StaticFiles(directory=media_root_path()), name="media")


app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(projects.router, prefix=settings.api_prefix)
app.include_router(providers.router, prefix=settings.api_prefix)
app.include_router(workflows.router, prefix=settings.api_prefix)
app.include_router(tasks.router, prefix=settings.api_prefix)
app.include_router(assets.router, prefix=settings.api_prefix)
app.include_router(dashboard.router, prefix=settings.api_prefix)
app.include_router(prompt_templates.router, prefix=settings.api_prefix)
app.include_router(users.router, prefix=settings.api_prefix)
app.include_router(inspiration.router, prefix=settings.api_prefix)
app.include_router(chat.router, prefix=settings.api_prefix)
