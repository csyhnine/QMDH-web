"""Agent persona catalog, user roster, and effective tool resolution."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AgentPersona, User, UserAgentAssignment
from app.services.agent_policy_service import EffectiveChatPolicy, normalize_chat_tool_allowlist

DEFAULT_PERSONA_PACK: tuple[dict[str, object], ...] = (
    {
        "key": "qmdh-coordinator",
        "display_name": "协调助手",
        "role": "coordinator",
        "system_prompt_template": (
            "你是 QMDH 设计助手的协调 Agent，负责理解用户意图、汇总其他 Agent 的结论，"
            "并在寒暄或综合问题时直接给出简洁专业的中文回复。"
            "不要代替检索或生图 Agent 执行具体 tool。"
        ),
        "chat_tool_allowlist": ["summarize_generation_stack"],
        "memory_scope": "user",
        "sort_order": 0,
    },
    {
        "key": "qmdh-research",
        "display_name": "检索助手",
        "role": "research",
        "system_prompt_template": (
            "你是 QMDH 检索 Agent，专注搜索灵感库、共享模板与生成栈配置。"
            "优先调用 tool 给出可执行的检索结论，回答简洁、结构化。"
        ),
        "chat_tool_allowlist": [
            "search_inspiration_posts",
            "search_shared_templates",
            "fetch_reference_page",
            "import_reference_page",
            "match_reference_intent",
            "list_enabled_image_providers",
            "list_active_workflows",
            "summarize_generation_stack",
        ],
        "memory_scope": "both",
        "sort_order": 10,
    },
    {
        "key": "qmdh-studio",
        "display_name": "生图助手",
        "role": "studio",
        "system_prompt_template": (
            "你是 QMDH 生图 Agent，负责在用户确认前生成待提交的生图/改图任务提案。"
            "必须先 list_enabled_image_providers，再调用 propose 工具；不要假装已完成生图。"
        ),
        "chat_tool_allowlist": [
            "list_enabled_image_providers",
            "propose_image_generate_task",
            "propose_image_edit_task",
        ],
        "memory_scope": "both",
        "sort_order": 20,
    },
)

STUDIO_ROUTE_KEYWORDS: tuple[str, ...] = (
    "生图",
    "改图",
    "生成图",
    "画一张",
    "出图",
    "渲染",
    "image generate",
    "image edit",
    "propose",
)
RESEARCH_ROUTE_KEYWORDS: tuple[str, ...] = (
    "搜索",
    "检索",
    "灵感",
    "模板",
    "模型",
    "工作流",
    "生成栈",
    "配置",
    "找",
    "汇总",
    "列出",
    "参考",
    "意向",
    "体量",
    "案例",
    "抓取",
    "链接",
)


@dataclass(frozen=True)
class AssignedAgentPersona:
    id: int
    key: str
    display_name: str
    role: str
    system_prompt_template: str
    chat_tool_allowlist: tuple[str, ...]
    memory_scope: str
    is_primary: bool


def intersect_allowlists(*allowlists: tuple[str, ...]) -> tuple[str, ...]:
    if not allowlists:
        return ()
    allowed = set(allowlists[0])
    for item in allowlists[1:]:
        allowed &= set(item)
    ordered: list[str] = []
    for key in allowlists[0]:
        if key in allowed and key not in ordered:
            ordered.append(key)
    for item in allowlists[1:]:
        for key in item:
            if key in allowed and key not in ordered:
                ordered.append(key)
    return tuple(ordered)


def resolve_persona_allowlist(
    policy: EffectiveChatPolicy,
    persona: AgentPersona | AssignedAgentPersona,
) -> tuple[str, ...]:
    persona_keys = normalize_chat_tool_allowlist(list(persona.chat_tool_allowlist or []))
    return intersect_allowlists(policy.chat_tool_allowlist, persona_keys)


def build_persona_system_prompt(*, policy: EffectiveChatPolicy, persona: AssignedAgentPersona) -> str:
    overlay = (persona.system_prompt_template or "").strip()
    if overlay:
        return f"{policy.system_prompt.strip()}\n\n{overlay}"
    return policy.system_prompt.strip()


def list_active_personas(db: Session) -> list[AgentPersona]:
    return list(
        db.scalars(
            select(AgentPersona)
            .where(AgentPersona.is_active == True)  # noqa: E712
            .order_by(AgentPersona.sort_order.asc(), AgentPersona.id.asc())
        ).all()
    )


def get_persona_by_key(db: Session, key: str) -> AgentPersona | None:
    normalized = key.strip()
    if not normalized:
        return None
    return db.scalar(select(AgentPersona).where(AgentPersona.key == normalized))


def ensure_default_personas(db: Session) -> dict[str, AgentPersona]:
    personas: dict[str, AgentPersona] = {}
    for item in DEFAULT_PERSONA_PACK:
        key = str(item["key"])
        persona = db.scalar(select(AgentPersona).where(AgentPersona.key == key))
        if persona is None:
            persona = AgentPersona(
                key=key,
                display_name=str(item["display_name"]),
                role=str(item["role"]),
                system_prompt_template=str(item["system_prompt_template"]),
                chat_tool_allowlist=list(item["chat_tool_allowlist"]),
                memory_scope=str(item["memory_scope"]),
                sort_order=int(item["sort_order"]),
                is_active=True,
            )
            db.add(persona)
            db.flush()
        personas[key] = persona
    return personas


def ensure_default_roster_for_user(db: Session, user_id: int) -> list[UserAgentAssignment]:
    personas = ensure_default_personas(db)
    existing = list(
        db.scalars(select(UserAgentAssignment).where(UserAgentAssignment.user_id == user_id)).all()
    )
    if existing:
        return existing

    assignments: list[UserAgentAssignment] = []
    for key, persona in personas.items():
        assignment = UserAgentAssignment(
            user_id=user_id,
            persona_id=persona.id,
            is_primary=(key == "qmdh-coordinator"),
            is_active=True,
        )
        db.add(assignment)
        assignments.append(assignment)
    db.flush()
    return assignments


def ensure_default_rosters_for_designers(db: Session) -> None:
    ensure_default_personas(db)
    designers = db.scalars(select(User).where(User.is_active == True, User.role == "designer")).all()  # noqa: E712
    for user in designers:
        ensure_default_roster_for_user(db, user.id)


def load_user_agent_roster(db: Session, user_id: int | None) -> list[AssignedAgentPersona]:
    if user_id is None:
        return []

    assignments = db.scalars(
        select(UserAgentAssignment)
        .join(AgentPersona, AgentPersona.id == UserAgentAssignment.persona_id)
        .where(
            UserAgentAssignment.user_id == user_id,
            UserAgentAssignment.is_active == True,  # noqa: E712
            AgentPersona.is_active == True,  # noqa: E712
        )
        .order_by(AgentPersona.sort_order.asc(), AgentPersona.id.asc())
    ).all()

    if not assignments:
        assignments = ensure_default_roster_for_user(db, user_id)

    roster: list[AssignedAgentPersona] = []
    for assignment in assignments:
        persona = assignment.persona or db.get(AgentPersona, assignment.persona_id)
        if persona is None or not persona.is_active or not assignment.is_active:
            continue
        roster.append(
            AssignedAgentPersona(
                id=persona.id,
                key=persona.key,
                display_name=persona.display_name,
                role=persona.role,
                system_prompt_template=persona.system_prompt_template or "",
                chat_tool_allowlist=tuple(normalize_chat_tool_allowlist(list(persona.chat_tool_allowlist or []))),
                memory_scope=persona.memory_scope or "both",
                is_primary=assignment.is_primary,
            )
        )
    return roster


def get_persona_from_roster(roster: list[AssignedAgentPersona], role: str) -> AssignedAgentPersona | None:
    for item in roster:
        if item.role == role:
            return item
    return None


def classify_route(message: str, *, roster: list[AssignedAgentPersona]) -> str:
    from app.services.agent_routing_service import resolve_route

    decision = resolve_route(message, roster=roster)
    if decision.route == "research_then_studio":
        return "research"
    return decision.route


def replace_user_roster(
    db: Session,
    *,
    user_id: int,
    persona_ids: list[int],
    primary_persona_id: int | None = None,
) -> list[UserAgentAssignment]:
    user = db.get(User, user_id)
    if user is None:
        raise ValueError("User not found")

    normalized_ids = list(dict.fromkeys(persona_ids))
    if not normalized_ids:
        raise ValueError("At least one persona is required")

    personas = list(
        db.scalars(
            select(AgentPersona).where(
                AgentPersona.id.in_(normalized_ids),
                AgentPersona.is_active == True,  # noqa: E712
            )
        ).all()
    )
    if len(personas) != len(normalized_ids):
        raise ValueError("One or more personas are missing or inactive")

    if primary_persona_id is None:
        primary_persona_id = normalized_ids[0]
    if primary_persona_id not in normalized_ids:
        raise ValueError("primary_persona_id must be included in persona_ids")

    existing = list(db.scalars(select(UserAgentAssignment).where(UserAgentAssignment.user_id == user_id)).all())
    existing_by_persona = {item.persona_id: item for item in existing}

    active_ids = set(normalized_ids)
    for assignment in existing:
        if assignment.persona_id not in active_ids:
            assignment.is_active = False
            assignment.is_primary = False

    updated: list[UserAgentAssignment] = []
    for persona_id in normalized_ids:
        assignment = existing_by_persona.get(persona_id)
        if assignment is None:
            assignment = UserAgentAssignment(user_id=user_id, persona_id=persona_id)
            db.add(assignment)
        assignment.is_active = True
        assignment.is_primary = persona_id == primary_persona_id
        updated.append(assignment)
    db.flush()
    return updated
