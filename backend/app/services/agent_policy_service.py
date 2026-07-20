"""Resolve effective Chat agent policy from AgentSkillRelease records (B1 slim)."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AgentSkillRelease

CHAT_AGENT_BASELINE_PROMPT = (
    "你是 QMDH 设计助手，在 Chat 对话区为设计师提供咨询式帮助。"
    "你可以检索院内灵感库、共享 prompt 模板、已启用的图像/视频模型与工作流配置，"
    "并用清晰的中文解释检索结果与下一步建议。"
    "用户仅寒暄、问候、感谢或未提出检索/配置需求时，直接简短友好回复，不要调用任何工具。"
    "若用户希望直接生图或改图，引导其前往 Studio 生成页提交持久化异步任务。"
    "回答应简洁、专业，优先给出可执行的检索结论。"
)

CHAT_AGENT_DATA_SCOPE_NOTE = (
    "当前助手可检索院内灵感库与共享模板，并汇总已启用的模型与工作流配置。"
)

DEFAULT_CHAT_TOOL_ALLOWLIST: tuple[str, ...] = (
    "search_inspiration_posts",
    "search_shared_templates",
    "list_enabled_image_providers",
    "list_active_workflows",
    "summarize_generation_stack",
)

CHAT_TOOL_CATALOG: tuple[dict[str, str], ...] = (
    {
        "key": "search_inspiration_posts",
        "label": "搜索灵感帖子",
        "description": "检索已入库 inspiration_posts（Meilisearch / PostgreSQL）。",
    },
    {
        "key": "search_shared_templates",
        "label": "搜索共享模板",
        "description": "检索院内共享 prompt 模板。",
    },
    {
        "key": "list_enabled_image_providers",
        "label": "列出可用模型",
        "description": "列出已启用的图像/视频 ProviderProfile。",
    },
    {
        "key": "list_active_workflows",
        "label": "列出工作流",
        "description": "列出当前可用 workflow keys。",
    },
    {
        "key": "summarize_generation_stack",
        "label": "汇总生成栈",
        "description": "汇总模型与工作流配置摘要。",
    },
)


@dataclass(frozen=True)
class ChatPolicyLayer:
    layer: str
    label: str
    detail: str | None = None
    disabled_tool_keys: tuple[str, ...] = ()
    prompt_overlay: str = ""


@dataclass(frozen=True)
class EffectiveChatPolicy:
    policy_version: str
    release_id: int | None
    release_key: str
    environment: str
    system_prompt: str
    chat_tool_allowlist: tuple[str, ...]
    layers: tuple[ChatPolicyLayer, ...] = ()
    disabled_tool_keys: tuple[str, ...] = ()
    user_group_name: str | None = None


def normalize_chat_tool_allowlist(values: list[str] | None) -> tuple[str, ...]:
    allowed = {item["key"] for item in CHAT_TOOL_CATALOG}
    normalized: list[str] = []
    for raw in values or []:
        key = str(raw).strip()
        if key and key in allowed and key not in normalized:
            normalized.append(key)
    if not normalized:
        return DEFAULT_CHAT_TOOL_ALLOWLIST
    return tuple(normalized)


def build_chat_system_prompt(*, baseline: str, template: str | None) -> str:
    overlay = (template or "").strip()
    if not overlay:
        return baseline.strip()
    return f"{baseline.strip()}\n\n{overlay}"


def resolve_effective_chat_policy(
    db: Session,
    *,
    environment: str = "prod",
    policy_version: str | None = None,
    user_id: int | None = None,
) -> EffectiveChatPolicy:
    del user_id  # B1: no per-user overrides

    release: AgentSkillRelease | None = None
    pinned_key = (policy_version or "").strip()

    if pinned_key:
        release = db.scalar(
            select(AgentSkillRelease).where(
                AgentSkillRelease.key == pinned_key,
                AgentSkillRelease.is_active == True,  # noqa: E712
            )
        )
        if release is None:
            release = db.scalar(select(AgentSkillRelease).where(AgentSkillRelease.key == pinned_key))

    if release is None:
        release = db.scalar(
            select(AgentSkillRelease)
            .where(
                AgentSkillRelease.environment == environment,
                AgentSkillRelease.is_active == True,  # noqa: E712
            )
            .order_by(AgentSkillRelease.updated_at.desc(), AgentSkillRelease.id.desc())
        )

    if release is None:
        return EffectiveChatPolicy(
            policy_version="code-default",
            release_id=None,
            release_key="code-default",
            environment=environment,
            system_prompt=CHAT_AGENT_BASELINE_PROMPT.strip(),
            chat_tool_allowlist=DEFAULT_CHAT_TOOL_ALLOWLIST,
            layers=(
                ChatPolicyLayer(
                    layer="global",
                    label="代码默认",
                    detail="code-default",
                ),
            ),
        )

    allowlist = normalize_chat_tool_allowlist(list(release.chat_tool_allowlist or []))
    return EffectiveChatPolicy(
        policy_version=release.key,
        release_id=release.id,
        release_key=release.key,
        environment=release.environment,
        system_prompt=build_chat_system_prompt(
            baseline=CHAT_AGENT_BASELINE_PROMPT,
            template=release.system_prompt_template,
        ),
        chat_tool_allowlist=allowlist,
        layers=(
            ChatPolicyLayer(
                layer="global",
                label="全局发布",
                detail=release.key,
            ),
        ),
    )


def list_chat_tool_catalog() -> list[dict[str, str]]:
    return [dict(item) for item in CHAT_TOOL_CATALOG]


def chat_tool_catalog_map() -> dict[str, dict[str, str]]:
    return {item["key"]: dict(item) for item in CHAT_TOOL_CATALOG}


def build_enabled_tool_records(allowlist: tuple[str, ...]) -> list[dict[str, str]]:
    catalog = chat_tool_catalog_map()
    records: list[dict[str, str]] = []
    for key in allowlist:
        item = catalog.get(key)
        if item:
            records.append(dict(item))
    return records


def build_disabled_tool_records(disabled_keys: tuple[str, ...]) -> list[dict[str, str]]:
    catalog = chat_tool_catalog_map()
    records: list[dict[str, str]] = []
    for key in disabled_keys:
        item = catalog.get(key)
        if item:
            records.append(dict(item))
    return records


def build_chat_policy_summary(
    policy: EffectiveChatPolicy,
    *,
    release_display_name: str | None = None,
) -> dict[str, object]:
    enabled_tools = build_enabled_tool_records(policy.chat_tool_allowlist)
    disabled_tools = build_disabled_tool_records(policy.disabled_tool_keys)
    return {
        "policy_version": policy.policy_version,
        "release_display_name": release_display_name,
        "environment": policy.environment,
        "enabled_tools": enabled_tools,
        "disabled_tools": disabled_tools,
        "policy_layers": [
            {
                "layer": layer.layer,
                "label": layer.label,
                "detail": layer.detail,
                "disabled_tool_keys": list(layer.disabled_tool_keys),
                "prompt_overlay": layer.prompt_overlay,
            }
            for layer in policy.layers
        ],
        "data_scope_note": CHAT_AGENT_DATA_SCOPE_NOTE,
        "capabilities_summary": "、".join(item["label"] for item in enabled_tools) or "暂无可用工具",
        "personalization_summary": None,
        "user_group_name": None,
    }
