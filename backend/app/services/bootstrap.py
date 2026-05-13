from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models import Asset, AssetType, DataClassification, InspirationPost, Project, User, Workflow
from app.services.media_storage import write_preview_svg

LOCAL_DEV_ACCOUNTS = [
    {
        "name": "qmdh.admin",
        "display_name": "Admin",
        "role": "admin",
        "password": "qmdh-admin-2026",
        "project_codes": ["*"],
        "monthly_quota": None,
    },
    {
        "name": "qmdh.ops",
        "display_name": "Ops",
        "role": "ops",
        "password": "qmdh-ops-2026",
        "project_codes": ["*"],
        "monthly_quota": None,
    },
    {
        "name": "designer.arch",
        "display_name": "Designer",
        "role": "designer",
        "password": "qmdh-arch-2026",
        "project_codes": ["QMDH-001"],
        "monthly_quota": 200.0,
    },
]


def ensure_schema(engine: Engine) -> None:
    """Schema migration is now handled by Alembic. This function is kept for backwards compatibility."""
    # All schema changes are now managed by Alembic migrations.
    # Run `alembic upgrade head` to apply migrations.
    pass


def seed_initial_data(db: Session) -> None:
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
                    monthly_quota=account["monthly_quota"],
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
        if user.monthly_quota is None:
            user.monthly_quota = account["monthly_quota"]
        user.is_active = True

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

    # Seed inspiration posts (external references from ArchDaily, Goood, etc.)
    inspiration_posts = [
        (
            "Moriyama House - 西泽立卫",
            "SANAA 西泽立卫代表作，独立体块组合的居住群落，白色立方体与绿植庭院交织。",
            "建筑",
            "inspiration/moriyama-house.svg",
            ["住宅", "日本", "SANAA", "白色", "体块"],
            "ArchDaily",
            "archdaily.com",
            "moriyama-house",
        ),
        (
            "Villa Savoye - 勒·柯布西耶",
            "现代主义建筑宣言，新建筑五点完整呈现，底层架空、水平长窗、自由平面。",
            "建筑",
            "inspiration/villa-savoye.svg",
            ["住宅", "法国", "现代主义", "柯布西耶", "白"],
            "ArchDaily",
            "archdaily.com",
            "villa-savoye",
        ),
        (
            "宁波博物馆 - 王澍",
            "普利兹克奖得主王澍代表作，瓦爿墙与竹纹混凝土，材料记忆的建构表达。",
            "建筑",
            "inspiration/ningbo-museum.svg",
            ["博物馆", "中国", "王澍", "材料", "文化"],
            "古德设计网",
            "gooood.cn",
            "ningbo-museum",
        ),
        (
            "Luum Temple - Vo Trong Nghia",
            "越南竹构建筑典范，竹拱结构与茅草屋顶，热带气候的可持续建造。",
            "建筑",
            "inspiration/luum-temple.svg",
            ["宗教", "越南", "竹构", "可持续", "热带"],
            "ArchDaily",
            "archdaily.com",
            "luum-temple",
        ),
        (
            "红砖美术馆 - 董功",
            "红砖与光影的对话，圆拱母题与现代空间组织，材料性与建构逻辑统一。",
            "建筑",
            "inspiration/red-brick-museum.svg",
            ["美术馆", "中国", "砖", "光影", "董功"],
            "古德设计网",
            "gooood.cn",
            "red-brick-museum",
        ),
        (
            "Fallingwater - Frank Lloyd Wright",
            "有机建筑典范，悬挑混凝土平台与瀑布交融，建筑与自然的完美结合。",
            "建筑",
            "inspiration/fallingwater.svg",
            ["住宅", "美国", "有机建筑", "赖特", "悬挑"],
            "ArchDaily",
            "archdaily.com",
            "fallingwater",
        ),
        (
            "绩溪博物馆 - 李兴钢",
            "传统徽派空间转译，庭院深深、廊道曲折，当代建筑中的江南意境。",
            "建筑",
            "inspiration/jixi-museum.svg",
            ["博物馆", "中国", "徽派", "庭院", "李兴钢"],
            "古德设计网",
            "gooood.cn",
            "jixi-museum",
        ),
        (
            "Tama Art University Library - 伊东丰雄",
            "混凝土拱廊构成的流动空间，拱形系统的变异与组合，轻盈的结构美学。",
            "建筑",
            "inspiration/tama-library.svg",
            ["图书馆", "日本", "拱", "混凝土", "伊东丰雄"],
            "ArchDaily",
            "archdaily.com",
            "tama-library",
        ),
        (
            "龙美术馆西岸馆 - 柳亦春",
            "工业遗址改造，清水混凝土伞拱结构，大跨度展览空间与历史肌理对话。",
            "建筑",
            "inspiration/long-museum.svg",
            ["美术馆", "中国", "混凝土", "工业改造", "柳亦春"],
            "古德设计网",
            "gooood.cn",
            "long-museum",
        ),
        (
            "Thermal Baths Vals - Peter Zumthor",
            "石材与水的冥想空间，山体与建筑一体化，感官体验的建筑化表达。",
            "建筑",
            "inspiration/thermal-baths.svg",
            ["温泉", "瑞士", "石材", "Zumthor", "冥想"],
            "ArchDaily",
            "archdaily.com",
            "thermal-baths-vals",
        ),
        (
            "阿那亚艺术中心 - 如恩设计",
            "海边精神空间，清水混凝土与光井，孤独感与仪式感的空间营造。",
            "建筑",
            "inspiration/aranya-art-center.svg",
            ["艺术中心", "中国", "混凝土", "海边", "如恩"],
            "古德设计网",
            "gooood.cn",
            "aranya-art-center",
        ),
        (
            "House NA - 藤本壮介",
            "居住的森林，不同标高的平台构成，空间界限消解与自由活动。",
            "建筑",
            "inspiration/house-na.svg",
            ["住宅", "日本", "藤本壮介", "平台", "白色"],
            "ArchDaily",
            "archdaily.com",
            "house-na",
        ),
    ]

    for title, description, category, relative_path, tags, source_name, source_domain, seed in inspiration_posts:
        existing = db.scalar(select(InspirationPost).where(InspirationPost.title == title))
        if existing:
            continue

        image_path = write_preview_svg(
            relative_path,
            title=title,
            eyebrow=source_name,
            detail=description,
            accent_seed=seed,
        )

        db.add(
            InspirationPost(
                title=title,
                description=description,
                image_path=image_path,
                category=category,
                tags=tags,
                source_type="external",
                source_name=source_name,
                source_url=f"https://{source_domain}",
            )
        )

    db.commit()
