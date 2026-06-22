from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.audit import AuditEventType, write_audit_log
from app.core.auth import normalize_user_role
from app.core.config import settings
from app.core.security import hash_password, hash_session_token
from app.models import AgentClient, AgentSkillRelease, Asset, AssetType, DataClassification, InspirationPost, Project, PromptTemplate, User, Workflow
from app.services.default_prompt_templates import DEFAULT_SHARED_PROMPT_TEMPLATES
from app.services.inspiration_media import prepare_inspiration_image
from app.services.media_storage import write_preview_svg

LOCAL_DEV_ACCOUNTS = [
    {
        "name": "qmdh.admin",
        "display_name": "Admin",
        "role": "admin",
        "password": "qmdh-admin-2026",
        "project_codes": ["*"],
        "monthly_quota": None,
        "billing_plan": "internal",
        "billing_status": "active",
        "quota_policy": "unlimited",
        "quota_reset_cycle": "monthly",
    },
    {
        "name": "qmdh.ops",
        "display_name": "Ops",
        "role": "ops",
        "password": "qmdh-ops-2026",
        "project_codes": ["*"],
        "monthly_quota": None,
        "billing_plan": "internal",
        "billing_status": "active",
        "quota_policy": "unlimited",
        "quota_reset_cycle": "monthly",
    },
    {
        "name": "designer.arch",
        "display_name": "Designer",
        "role": "designer",
        "password": "qmdh-arch-2026",
        "project_codes": ["QMDH-001"],
        "monthly_quota": 200.0,
        "billing_plan": "standard",
        "billing_status": "active",
        "quota_policy": "soft_warn",
        "quota_reset_cycle": "monthly",
    },
]


def ensure_schema(engine: Engine) -> None:
    """Apply lightweight compatibility fixes for local databases that predate newer models."""
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    def existing_columns(table_name: str) -> set[str]:
        if table_name not in table_names:
            return set()
        return {column["name"] for column in inspector.get_columns(table_name)}

    project_columns = existing_columns("projects")
    user_columns = existing_columns("users")
    feedback_columns = existing_columns("user_feedbacks")
    usage_ledger_columns = existing_columns("usage_ledgers")
    prompt_template_columns = existing_columns("prompt_templates")
    provider_profile_columns = existing_columns("provider_profiles")
    inspiration_post_columns = existing_columns("inspiration_posts")
    with engine.begin() as connection:
        if project_columns and "owner_user_id" not in project_columns:
            connection.execute(text("ALTER TABLE projects ADD COLUMN owner_user_id INTEGER"))
        if project_columns:
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_projects_owner_user_id ON projects (owner_user_id)"))
        if user_columns and "billing_plan" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN billing_plan VARCHAR(30) NOT NULL DEFAULT 'standard'"))
        if user_columns and "group_name" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN group_name VARCHAR(120) NOT NULL DEFAULT ''"))
        if user_columns and "billing_status" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN billing_status VARCHAR(20) NOT NULL DEFAULT 'active'"))
        if user_columns and "quota_policy" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN quota_policy VARCHAR(20) NOT NULL DEFAULT 'soft_warn'"))
        if user_columns and "quota_reset_cycle" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN quota_reset_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly'"))
        if feedback_columns and "attachment_paths" not in feedback_columns:
            connection.execute(
                text("ALTER TABLE user_feedbacks ADD COLUMN attachment_paths JSON NOT NULL DEFAULT '[]'")
            )
        chat_message_columns = existing_columns("chat_messages")
        if chat_message_columns and "attachments_json" not in chat_message_columns:
            connection.execute(
                text("ALTER TABLE chat_messages ADD COLUMN attachments_json JSON NOT NULL DEFAULT '[]'")
            )
        if prompt_template_columns and "scope" not in prompt_template_columns:
            connection.execute(
                text("ALTER TABLE prompt_templates ADD COLUMN scope VARCHAR(20) NOT NULL DEFAULT 'private'")
            )
        if prompt_template_columns and "category" not in prompt_template_columns:
            connection.execute(
                text("ALTER TABLE prompt_templates ADD COLUMN category VARCHAR(80) NOT NULL DEFAULT ''")
            )
        if prompt_template_columns and "subcategory" not in prompt_template_columns:
            connection.execute(
                text("ALTER TABLE prompt_templates ADD COLUMN subcategory VARCHAR(80) NOT NULL DEFAULT ''")
            )
        if prompt_template_columns and "is_featured" not in prompt_template_columns:
            connection.execute(
                text("ALTER TABLE prompt_templates ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false")
            )
        if prompt_template_columns and "source_image_path" not in prompt_template_columns:
            connection.execute(
                text("ALTER TABLE prompt_templates ADD COLUMN source_image_path VARCHAR(255) NOT NULL DEFAULT ''")
            )
        if prompt_template_columns and "preview_image_path" not in prompt_template_columns:
            connection.execute(
                text("ALTER TABLE prompt_templates ADD COLUMN preview_image_path VARCHAR(255) NOT NULL DEFAULT ''")
            )
        if prompt_template_columns:
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_prompt_templates_scope ON prompt_templates (scope)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_prompt_templates_category ON prompt_templates (category)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_prompt_templates_is_featured ON prompt_templates (is_featured)"))
        if provider_profile_columns and "strategies" not in provider_profile_columns:
            connection.execute(text("ALTER TABLE provider_profiles ADD COLUMN strategies JSON NOT NULL DEFAULT '{}'"))
        if provider_profile_columns and "api_secret" not in provider_profile_columns:
            connection.execute(text("ALTER TABLE provider_profiles ADD COLUMN api_secret TEXT NOT NULL DEFAULT ''"))
        if provider_profile_columns and "adapter_config" not in provider_profile_columns:
            connection.execute(text("ALTER TABLE provider_profiles ADD COLUMN adapter_config JSON NOT NULL DEFAULT '{}'"))
        if provider_profile_columns and "display_name" not in provider_profile_columns:
            connection.execute(
                text("ALTER TABLE provider_profiles ADD COLUMN display_name VARCHAR(150) NOT NULL DEFAULT ''")
            )
            connection.execute(
                text("UPDATE provider_profiles SET display_name = model_name WHERE COALESCE(display_name, '') = ''")
            )
        if inspiration_post_columns and "source_image_path" not in inspiration_post_columns:
            connection.execute(
                text("ALTER TABLE inspiration_posts ADD COLUMN source_image_path VARCHAR(255) NOT NULL DEFAULT ''")
            )
        if inspiration_post_columns and "media_type" not in inspiration_post_columns:
            connection.execute(
                text("ALTER TABLE inspiration_posts ADD COLUMN media_type VARCHAR(20) NOT NULL DEFAULT 'image'")
            )
        if usage_ledger_columns and "input_tokens" not in usage_ledger_columns:
            connection.execute(text("ALTER TABLE usage_ledgers ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0"))
        if usage_ledger_columns and "output_tokens" not in usage_ledger_columns:
            connection.execute(text("ALTER TABLE usage_ledgers ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0"))
        if usage_ledger_columns and "cached_input_tokens" not in usage_ledger_columns:
            connection.execute(text("ALTER TABLE usage_ledgers ADD COLUMN cached_input_tokens INTEGER NOT NULL DEFAULT 0"))
        if usage_ledger_columns and "uncached_input_tokens" not in usage_ledger_columns:
            connection.execute(text("ALTER TABLE usage_ledgers ADD COLUMN uncached_input_tokens INTEGER NOT NULL DEFAULT 0"))
        if usage_ledger_columns and "usage_payload" not in usage_ledger_columns:
            connection.execute(text("ALTER TABLE usage_ledgers ADD COLUMN usage_payload JSON NOT NULL DEFAULT '{}'"))


def _seed_shared_prompt_templates(db: Session) -> None:
    if not DEFAULT_SHARED_PROMPT_TEMPLATES:
        return

    has_shared_templates = db.scalar(
        select(PromptTemplate.id).where(PromptTemplate.scope == "shared").limit(1)
    )
    if has_shared_templates is not None:
        return

    admin_user = db.scalar(select(User).where(User.role == "admin").order_by(User.id.asc()))
    if admin_user is None:
        return

    for template in DEFAULT_SHARED_PROMPT_TEMPLATES:
        db.add(
            PromptTemplate(
                user_id=admin_user.id,
                scope="shared",
                category=template.get("category", ""),
                subcategory=template.get("subcategory", ""),
                is_featured=bool(template.get("is_featured", False)),
                label=template["label"],
                title=template["title"],
                prompt=template["prompt"],
                style=template["style"],
                aspect_ratio=template["aspect_ratio"],
                resolution=template["resolution"],
                deliverable=template["deliverable"],
                notes=template["notes"],
                source_image_path=template.get("source_image_path", ""),
                preview_image_path=template.get("preview_image_path", ""),
            )
        )

    write_audit_log(
        db=db,
        event_type=AuditEventType.PROMPT_TEMPLATE_CREATED,
        actor_name=admin_user.name,
        actor_id=admin_user.id,
        target_type="prompt_template",
        target_name="bootstrap_shared_templates",
        details={"scope": "shared", "count": len(DEFAULT_SHARED_PROMPT_TEMPLATES)},
    )


def seed_initial_data(db: Session) -> None:
    if settings.bootstrap_admin_name and settings.bootstrap_admin_password:
        admin = db.scalar(select(User).where(User.name == settings.bootstrap_admin_name))
        if not admin:
            db.add(
                User(
                    name=settings.bootstrap_admin_name,
                    display_name=settings.bootstrap_admin_name,
                    role="admin",
                    password_hash=hash_password(settings.bootstrap_admin_password),
                    is_active=True,
                    project_codes=["*"],
                    billing_plan="internal",
                    billing_status="active",
                    quota_policy="unlimited",
                    quota_reset_cycle="monthly",
                )
            )
        elif not admin.password_hash:
            admin.role = "admin"
            admin.display_name = admin.display_name or admin.name
            admin.password_hash = hash_password(settings.bootstrap_admin_password)
            admin.is_active = True
            admin.project_codes = ["*"]
            admin.billing_plan = admin.billing_plan or "internal"
            admin.billing_status = admin.billing_status or "active"
            admin.quota_policy = admin.quota_policy or "unlimited"
            admin.quota_reset_cycle = admin.quota_reset_cycle or "monthly"
        else:
            admin.role = "admin"
            admin.display_name = admin.display_name or admin.name
            admin.is_active = True
            admin.project_codes = ["*"]
            admin.billing_plan = admin.billing_plan or "internal"
            admin.billing_status = admin.billing_status or "active"
            admin.quota_policy = admin.quota_policy or "unlimited"
            admin.quota_reset_cycle = admin.quota_reset_cycle or "monthly"

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
                    monthly_quota=account["monthly_quota"],
                    billing_plan=account["billing_plan"],
                    billing_status=account["billing_status"],
                    quota_policy=account["quota_policy"],
                    quota_reset_cycle=account["quota_reset_cycle"],
                )
            )
            continue

        user.display_name = user.display_name or account["display_name"]
        user.role = normalize_user_role(user.role or account["role"])
        if not user.project_codes:
            user.project_codes = account["project_codes"]
        if not user.password_hash:
            user.password_hash = hash_password(account["password"])
        if user.monthly_quota is None:
            user.monthly_quota = account["monthly_quota"]
        user.billing_plan = user.billing_plan or account["billing_plan"]
        user.billing_status = user.billing_status or account["billing_status"]
        user.quota_policy = user.quota_policy or account["quota_policy"]
        user.quota_reset_cycle = user.quota_reset_cycle or account["quota_reset_cycle"]
        user.is_active = True

    for client_profile in settings.get_agent_client_profiles().values():
        linked_user = db.scalar(select(User).where(User.name == client_profile.user_name))
        if not linked_user:
            continue
        client = db.scalar(select(AgentClient).where(AgentClient.key == client_profile.key))
        if not client:
            client = AgentClient(
                key=client_profile.key,
                display_name=client_profile.display_name or client_profile.key,
                device_id=client_profile.device_id,
                token_hash=hash_session_token(client_profile.token),
                user_id=linked_user.id,
                role=client_profile.role,
                environment=client_profile.environment,
                project_codes=list(client_profile.project_codes),
                capabilities=list(client_profile.capabilities),
                client_metadata={},
                is_active=True,
            )
            db.add(client)
            continue

        client.display_name = client_profile.display_name or client.display_name or client.key
        client.device_id = client_profile.device_id
        client.token_hash = hash_session_token(client_profile.token)
        client.user_id = linked_user.id
        client.role = client_profile.role
        client.environment = client_profile.environment
        client.project_codes = list(client_profile.project_codes)
        client.capabilities = list(client_profile.capabilities)
        client.client_metadata = client.client_metadata or {}
        client.is_active = True

    _seed_shared_prompt_templates(db)

    default_release = db.scalar(select(AgentSkillRelease).where(AgentSkillRelease.key == "qmdh-official-test"))
    if not default_release:
        db.add(
            AgentSkillRelease(
                key="qmdh-official-test",
                display_name="QMDH 官方技能集（测试）",
                environment="test",
                openclaw_version="latest",
                skill_keys=[
                    "qmdh-image-generate",
                    "qmdh-image-edit",
                    "qmdh-save-inspiration",
                    "qmdh-save-project-asset",
                    "qmdh-save-research-summary",
                ],
                notes="默认测试环境技能集，用于 OpenClaw 与 QMDH 联调。",
                is_active=True,
            )
        )

    projects = [
        ("QMDH 示范项目", "QMDH-001", DataClassification.b),
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
            "image-upscale",
            "高清放大",
            "调用 AI 超分，将效果图放大到 2x / 4x 等更高分辨率。",
            "image",
            "P1",
            "image.upscale",
            {"demo_fields": ["source_image", "upscale_style", "upscale_noise", "upscale_scale"]},
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

    # Seed inspiration posts with real images from ArchDaily
    # Format: (title, description, category, image_url, tags, source_name, source_url)
    inspiration_posts = [
        (
            "The Spiral - BIG",
            "纽约哈德逊广场旁的螺旋形办公塔楼，层层退台花园创造垂直城市景观。",
            "建筑",
            "https://images.adsttc.com/media/images/6538/45a3/9875/1566/a119/2cf1/large_jpg/the-spiral-big_1.jpg",
            ["办公", "美国", "BIG", "螺旋", "高层"],
            "archdaily.com",
            "https://www.archdaily.com/1008788/the-spiral-big",
        ),
        (
            "Tree Art Museum - 大朴建筑",
            "北京宋庄艺术区的混凝土美术馆，粗犷的清水混凝土与精致的光影对话。",
            "建筑",
            "https://images.adsttc.com/media/images/5170/a2b7/b3fc/4b20/1400/0012/large_jpg/0.jpg",
            ["美术馆", "中国", "混凝土", "光影", "大朴"],
            "archdaily.com",
            "https://www.archdaily.com/362012/tree-art-museum-daipu-architects",
        ),
        (
            "杨丽萍表演艺术中心 - 朱锫",
            "大理洱海边的表演艺术中心，屋顶如山峦起伏，与苍山洱海对话。",
            "建筑",
            "https://images.adsttc.com/media/images/6127/989b/f91c/8159/1f00/0061/large_jpg/01.jpg",
            ["剧院", "中国", "朱锫", "山水", "混凝土"],
            "archdaily.com",
            "https://www.archdaily.com/967481/yangliping-performing-arts-center-studio-zhu-pei",
        ),
        (
            "和美术馆 - 安藤忠雄",
            "顺德的双螺旋楼梯美术馆，清水混凝土圆形空间与岭南水乡对话。",
            "建筑",
            "https://images.adsttc.com/media/images/609b/c580/c890/d701/642e/2746/large_jpg/new.jpg",
            ["美术馆", "中国", "安藤忠雄", "混凝土", "螺旋"],
            "archdaily.com",
            "https://www.archdaily.com/961553/he-art-museum-tadao-ando",
        ),
        (
            "Aman New York - Jean-Michel Gathy",
            "纽约皇冠大厦内的奢华酒店，极简日式美学与Art Deco建筑的融合。",
            "室内",
            "https://images.adsttc.com/media/images/633a/b652/7120/027c/ea79/57ee/large_jpg/jean-michel-gathy-aman-new-york_1.jpg",
            ["酒店", "美国", "极简", "奢华", "日式"],
            "archdaily.com",
            "https://www.archdaily.com/989917/aman-new-york-jean-michel-gathy",
        ),
        (
            "安徒生博物馆 - 隈研吾",
            "丹麦欧登塞的地下博物馆，圆形花园与地下展厅，童话般的沉浸式空间。",
            "建筑",
            "https://images.adsttc.com/media/images/623c/8679/40c9/f001/65ef/d5d7/large_jpg/hcandersen-hus-museum-kengo-kuma-and-associates_1.jpg",
            ["博物馆", "丹麦", "隈研吾", "地下", "花园"],
            "archdaily.com",
            "https://www.archdaily.com/979082/hcandersen-hus-museum-kengo-kuma-and-associates",
        ),
        (
            "卡塔尔国家博物馆 - Jean Nouvel",
            "沙漠玫瑰结晶形态的博物馆，交错圆盘构成的雕塑性建筑。",
            "建筑",
            "https://images.adsttc.com/media/images/5c9c/cb15/284d/d1e4/1600/0026/large_jpg/1.jpg",
            ["博物馆", "卡塔尔", "Jean Nouvel", "雕塑", "沙漠"],
            "archdaily.com",
            "https://www.archdaily.com/913989/national-museum-of-qatar-atelier-jean-nouvel",
        ),
        (
            "The Exchange - 隈研吾",
            "悉尼达令广场的木构编织建筑，6公里木条编织成有机形态的公共空间。",
            "建筑",
            "https://images.adsttc.com/media/images/604b/c37f/f91c/81c7/db00/0048/large_jpg/LMY_The_Exchange_0001.jpg",
            ["公共", "澳大利亚", "隈研吾", "木构", "编织"],
            "archdaily.com",
            "https://www.archdaily.com/958498/the-exchange-kengo-kuma-and-associates",
        ),
        (
            "浦东美术馆 - Jean Nouvel",
            "上海陆家嘴的当代美术馆，大理石与玻璃的极简立方体，框景外滩天际线。",
            "建筑",
            "https://images.adsttc.com/media/images/6128/a9be/f91c/811f/3100/0039/large_jpg/%E6%B5%A6%E4%B8%9C%E7%BE%8E%E6%9C%AF%E9%A6%86.jpg",
            ["美术馆", "中国", "Jean Nouvel", "极简", "框景"],
            "archdaily.com",
            "https://www.archdaily.com/967555/atelier-jean-nouvels-museum-of-art-pudong-opens-to-the-public",
        ),
        (
            "Serpentine Pavilion 2023 - Lina Ghotmeh",
            "伦敦蛇形画廊年度临时建筑，木构穹顶如同大地的延伸。",
            "建筑",
            "https://images.adsttc.com/media/images/62d5/4a53/06cd/f701/664c/f423/large_jpg/the-serpentine-pavilion-2023-lina-ghotmeh_1.jpg",
            ["展亭", "英国", "木构", "临时建筑", "穹顶"],
            "archdaily.com",
            "https://www.archdaily.com/985553/serpentine-pavilion-2023-lina-ghotmeh",
        ),
        (
            "Chapel of Sound - OPEN建筑事务所",
            "北京长城脚下的音乐厅，混凝土洞穴般的声学空间与山谷共鸣。",
            "建筑",
            "https://images.adsttc.com/media/images/61a8/3450/e4df/6101/69c8/6e0b/large_jpg/chapel-of-sound-open-architecture_5.jpg",
            ["音乐厅", "中国", "OPEN", "混凝土", "山谷"],
            "archdaily.com",
            "https://www.archdaily.com/972823/monolithic-concert-hall-open-architecture",
        ),
        (
            "teamLab Borderless Jeddah",
            "沙特吉达的沉浸式数字艺术空间，无边界的光影互动体验。",
            "室内",
            "https://images.adsttc.com/media/images/61b8/6b04/f91c/81da/b400/0002/large_jpg/NHK_teamlab_borderless_jeddah_01.jpg",
            ["展览", "沙特", "数字艺术", "沉浸式", "光影"],
            "archdaily.com",
            "https://www.archdaily.com/973553/teamlab-borderless-jeddah-teamlab",
        ),
        (
            "寿县文化艺术中心 - 朱锫",
            "安徽寿县的文化艺术中心，楚文化与当代建筑的对话，大地景观建筑。",
            "建筑",
            "https://images.adsttc.com/media/images/5e55/0610/6ee6/7e4e/7800/025a/large_jpg/1.jpg",
            ["文化中心", "中国", "朱锫", "楚文化", "景观"],
            "archdaily.com",
            "https://www.archdaily.com/934401/shou-county-culture-and-art-center-studio-zhu-pei",
        ),
        (
            "淄博华侨城艺术中心 - 朱锫",
            "内向型实验建筑，传统中国书院'合院'概念的当代转译。",
            "建筑",
            "https://images.adsttc.com/media/images/637f/40f9/389f/3d03/e0a1/eb86/large_jpg/zibo-oct-art-center-studio-zhu-pei_5.jpg",
            ["艺术中心", "中国", "朱锫", "合院", "实验"],
            "archdaily.com",
            "https://www.archdaily.com/992656/zibo-oct-art-center-studio-zhu-pei",
        ),
    ]

    for title, description, category, image_url, tags, source_name, source_url in inspiration_posts:
        existing = db.scalar(select(InspirationPost).where(InspirationPost.title == title))
        if existing:
            if existing.source_type == "external":
                existing.image_path = prepare_inspiration_image(
                    existing.image_path,
                    title=existing.title,
                    source_url=existing.source_url,
                    namespace="seed",
                )
            continue

        db.add(
            InspirationPost(
                title=title,
                description=description,
                image_path=prepare_inspiration_image(
                    image_url,
                    title=title,
                    source_url=source_url,
                    namespace="seed",
                ),
                category=category,
                tags=tags,
                source_type="external",
                source_name=source_name,
                source_url=source_url,
            )
        )

    db.commit()
