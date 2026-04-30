from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models import Asset, AssetType, DataClassification, Project, User, Workflow
from app.services.media_storage import write_preview_svg

LOCAL_DEV_ACCOUNTS = [
    {
        "name": "qmdh.owner",
        "display_name": "QMDH Owner",
        "role": "owner",
        "password": "qmdh-owner-2026",
        "project_codes": ["*"],
    },
    {
        "name": "qmdh.admin",
        "display_name": "QMDH Admin",
        "role": "admin",
        "password": "qmdh-admin-2026",
        "project_codes": ["*"],
    },
    {
        "name": "qmdh.ops",
        "display_name": "QMDH Ops",
        "role": "ops",
        "password": "qmdh-ops-2026",
        "project_codes": ["*"],
    },
    {
        "name": "designer.arch",
        "display_name": "Architecture Designer",
        "role": "designer",
        "password": "qmdh-arch-2026",
        "project_codes": ["QMDH-001"],
    },
    {
        "name": "designer.landscape",
        "display_name": "Landscape Designer",
        "role": "designer",
        "password": "qmdh-landscape-2026",
        "project_codes": ["QMDH-001"],
    },
    {
        "name": "designer.sec",
        "display_name": "Secure Project Designer",
        "role": "designer",
        "password": "qmdh-sec-2026",
        "project_codes": ["QMDH-SEC"],
    },
]


def ensure_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    asset_columns = {column["name"] for column in inspector.get_columns("assets")} if inspector.has_table("assets") else set()
    user_columns = {column["name"] for column in inspector.get_columns("users")} if inspector.has_table("users") else set()

    statements: list[str] = []
    if "prompt_text" not in asset_columns:
        statements.append("ALTER TABLE assets ADD COLUMN prompt_text TEXT")
    if "like_count" not in asset_columns:
        statements.append("ALTER TABLE assets ADD COLUMN like_count INTEGER DEFAULT 0 NOT NULL")
    if "share_count" not in asset_columns:
        statements.append("ALTER TABLE assets ADD COLUMN share_count INTEGER DEFAULT 0 NOT NULL")
    if "source_task_id" not in asset_columns:
        statements.append("ALTER TABLE assets ADD COLUMN source_task_id INTEGER")
    if user_columns:
        if "display_name" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN display_name VARCHAR(150)")
        if "password_hash" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN password_hash TEXT")
        if "is_active" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE")
        if "project_codes" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN project_codes JSON")
        if "last_login_at" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP")
        if "updated_at" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))
        if user_columns:
            connection.execute(text("UPDATE users SET display_name = name WHERE display_name IS NULL OR display_name = ''"))
            connection.execute(text("UPDATE users SET password_hash = '' WHERE password_hash IS NULL"))
            connection.execute(text("UPDATE users SET is_active = TRUE WHERE is_active IS NULL"))
            connection.execute(text("UPDATE users SET project_codes = '[\"QMDH-001\"]' WHERE project_codes IS NULL"))


def seed_initial_data(db: Session) -> None:
    users = [("reviewer", "reviewer"), ("designer.lead", "lead_designer")]
    for name, role in users:
        existing = db.scalar(select(User).where(User.name == name))
        if not existing:
            db.add(User(name=name, display_name=name, role=role, project_codes=["QMDH-001"]))

    if settings.bootstrap_admin_name and settings.bootstrap_admin_password:
        admin = db.scalar(select(User).where(User.name == settings.bootstrap_admin_name))
        if not admin:
            db.add(
                User(
                    name=settings.bootstrap_admin_name,
                    display_name=settings.bootstrap_admin_name,
                    role="owner",
                    password_hash=hash_password(settings.bootstrap_admin_password),
                    is_active=True,
                    project_codes=["*"],
                )
            )
        elif not admin.password_hash:
            admin.role = "owner"
            admin.display_name = admin.display_name or admin.name
            admin.password_hash = hash_password(settings.bootstrap_admin_password)
            admin.is_active = True
            admin.project_codes = ["*"]

    for account in LOCAL_DEV_ACCOUNTS:
        user = db.scalar(select(User).where(User.name == account["name"]))
        if not user:
            db.add(
                User(
                    name=account["name"],
                    display_name=account["display_name"],
                    role=account["role"],
                    password_hash=hash_password(account["password"]),
                    is_active=True,
                    project_codes=account["project_codes"],
                )
            )
            continue

        user.display_name = user.display_name or account["display_name"]
        if user.role not in {"owner", "admin", "ops", "designer"}:
            user.role = account["role"]
        if not user.project_codes:
            user.project_codes = account["project_codes"]
        if not user.password_hash:
            user.password_hash = hash_password(account["password"])
        user.is_active = True

    projects = [
        ("QMDH 示范项目", "QMDH-001", DataClassification.b),
        ("涉密改造项目", "QMDH-SEC", DataClassification.a),
    ]
    for name, code, classification in projects:
        existing = db.scalar(select(Project).where(Project.code == code))
        if not existing:
            db.add(Project(name=name, code=code, classification=classification))

    workflows = [
        (
            "image-generate",
            "图像生成",
            "统一调用图像模型，生成建筑、景观或展示画面的效果图方案。",
            "image",
            "P1",
            "image.generate",
            {"demo_fields": ["reference_image", "style", "prompt_supplement"]},
        ),
        (
            "image-edit",
            "局部重绘",
            "针对已有图片进行局部改图、材质替换与方案微调。",
            "image",
            "P1",
            "image.edit",
            {"demo_fields": ["source_image", "mask", "edit_prompt"]},
        ),
        (
            "video-generate",
            "视频生成",
            "将图像素材和镜头说明转成漫游视频或演示短片任务。",
            "video",
            "P1",
            "video.generate",
            {"demo_fields": ["storyboard", "source_images", "motion_prompt"]},
        ),
        (
            "report-generate",
            "前期报告生成",
            "基于项目地点与关键字生成结构化前期分析报告。",
            "document",
            "P1",
            "document.generate",
            {"demo_fields": ["location", "project_type", "keywords"]},
        ),
        (
            "ppt-generate",
            "汇报页生成",
            "把效果图与项目说明组合成汇报页草稿，便于快速整理材料。",
            "document",
            "P1",
            "document.generate",
            {"demo_fields": ["project_info", "images", "highlights"]},
        ),
        (
            "prompt-reverse",
            "提示词反推",
            "从优质图片中反推可复用的提示词、镜头语言和标签。",
            "prompt",
            "P1",
            "text.generate",
            {"demo_fields": ["image"]},
        ),
    ]
    for key, name, description, category, priority, capability, config in workflows:
        existing = db.scalar(select(Workflow).where(Workflow.key == key))
        if not existing:
            db.add(
                Workflow(
                    key=key,
                    name=name,
                    description=description,
                    category=category,
                    priority=priority,
                    provider_capability=capability,
                    config=config,
                )
            )

    project = db.scalar(select(Project).where(Project.code == "QMDH-001"))
    waterfront_preview = write_preview_svg(
        "seed/waterfront-render-01.svg",
        title="滨水更新效果图",
        eyebrow="gallery seed",
        detail="现代城市界面 / 滨水步道 / 玻璃与石材立面 / 清晨漫反射",
        accent_seed="waterfront-render-01",
    )
    night_preview = write_preview_svg(
        "seed/night-commercial-01.svg",
        title="街角商业夜景图",
        eyebrow="gallery seed",
        detail="夜景灯光克制 / 橱窗暖光 / 湿润路面反射 / 真实摄影质感",
        accent_seed="night-commercial-01",
    )
    hotel_preview = write_preview_svg(
        "seed/mountain-hotel-01.svg",
        title="山地酒店概念图",
        eyebrow="gallery seed",
        detail="深色石材与木格栅 / 薄雾山谷背景 / 低饱和自然光",
        accent_seed="mountain-hotel-01",
    )
    demo_assets = [
        (
            "滨水更新效果图",
            AssetType.image,
            waterfront_preview,
            "现代城市界面，滨水步道，轻雾天气，玻璃与石材立面，清晨漫反射，建筑摄影视角。",
            18,
            7,
            ["滨水", "城市更新", "效果图"],
        ),
        (
            "街角商业夜景图",
            AssetType.image,
            night_preview,
            "街角商业综合体，夜景灯光克制，橱窗暖光，湿润路面反射，真实摄影质感。",
            32,
            11,
            ["夜景", "商业", "灯光"],
        ),
        (
            "山地酒店概念图",
            AssetType.image,
            hotel_preview,
            "山地酒店，深色石材与木格栅，薄雾山谷背景，低饱和和自然光，建筑竞赛视觉。",
            25,
            9,
            ["酒店", "山地", "概念"],
        ),
        (
            "示范漫游视频封面",
            AssetType.video,
            "nas://gallery/qmdh-001/video-cover-01.mp4",
            "建筑漫游视频，慢速推进镜头，入口广场到中庭空间转换，展陈级叙事节奏。",
            10,
            4,
            ["视频", "漫游", "封面"],
        ),
    ]

    for name, asset_type, storage_path, prompt_text, like_count, share_count, tags in demo_assets:
        existing = db.scalar(select(Asset).where(Asset.name == name))
        if not existing:
            db.add(
                Asset(
                    name=name,
                    asset_type=asset_type,
                    project_id=project.id if project else None,
                    storage_path=storage_path,
                    prompt_text=prompt_text,
                    like_count=like_count,
                    share_count=share_count,
                    tags=tags,
                )
            )
        elif existing.asset_type == AssetType.image and existing.source_task_id is None and existing.storage_path.startswith("nas://"):
            existing.storage_path = storage_path

    db.commit()
