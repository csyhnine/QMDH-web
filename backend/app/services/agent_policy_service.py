"""Resolve effective Chat agent policy from AgentSkillRelease records (B1 slim + gov overrides)."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AgentPolicyOverride, AgentSkillRelease, User

CHAT_AGENT_BASELINE_PROMPT = (
    "你是 QMDH 设计助手，在网页 Chat 为设计师提供帮助。"
    "系统已自动提供当前可用的生图/视频模型列表；创建任务时 requested_provider 必须使用列表中的 provider_name。"
    "用户仅寒暄、问候、感谢时，直接简短友好回复，不要调用任何工具。"
    "若用户要找 prompt 模板，可调用 search_shared_templates。"
    "若用户明确要求生图、改图或生成视频，且对应 create_* 工具已启用，"
    "直接调用 create_image_generate_task / create_image_edit_task / create_video_generate_task；"
    "工具会立即入队生成，不要再说「请确认提交」，也不要声称图片已经完成显示——告知用户任务已开始，结果会在卡片中更新。"
    "若创建任务工具未启用，引导用户前往 Studio。"
    "回答应简洁、专业。"
)

CHAT_AGENT_DATA_SCOPE_NOTE = (
    "当前助手可检索共享模板；可用模型由系统自动注入。"
    "生图/改图/视频任务创建后立即入队，结果在对话卡片中展示。"
)

# Slim defaults: templates + create tasks + memory. Low-value tools stay in catalog for opt-in.
DEFAULT_CHAT_TOOL_ALLOWLIST: tuple[str, ...] = (
    "search_shared_templates",
    "create_image_generate_task",
    "create_image_edit_task",
    "create_video_generate_task",
    "memory_recall",
    "memory_store",
    "memory_forget",
)

# Old propose_* keys still accepted when loading releases / overrides.
CHAT_TOOL_KEY_ALIASES: dict[str, str] = {
    "propose_image_generate_task": "create_image_generate_task",
    "propose_image_edit_task": "create_image_edit_task",
    "propose_video_generate_task": "create_video_generate_task",
}

CHAT_TOOL_CATALOG: tuple[dict[str, str], ...] = (
    {
        "key": "search_shared_templates",
        "label": "搜索共享模板",
        "description": "检索院内共享 prompt 模板。",
    },
    {
        "key": "create_image_generate_task",
        "label": "创建生图任务",
        "description": "【Web Chat】立即创建并入队生图任务，结果在对话卡片展示。",
    },
    {
        "key": "create_image_edit_task",
        "label": "创建改图任务",
        "description": "【Web Chat】立即创建并入队改图任务。",
    },
    {
        "key": "create_video_generate_task",
        "label": "创建视频任务",
        "description": "【Web Chat】立即创建并入队视频任务。",
    },
    {
        "key": "memory_recall",
        "label": "检索记忆库",
        "description": "按语义/关键词检索当前设计师的私有记忆。",
    },
    {
        "key": "memory_store",
        "label": "写入记忆库",
        "description": "将重要偏好/事实写入当前用户私有记忆库。",
    },
    {
        "key": "memory_forget",
        "label": "删除记忆",
        "description": "按 memory_id 删除当前用户自己的一条记忆。",
    },
    {
        "key": "search_inspiration_posts",
        "label": "搜索灵感帖子（可选）",
        "description": "检索灵感库。库内容较少时可关闭，避免空搜。",
    },
    {
        "key": "list_enabled_image_providers",
        "label": "列出可用模型（可选）",
        "description": "通常无需勾选：系统已自动注入可用模型。",
    },
    {
        "key": "list_active_workflows",
        "label": "列出工作流（可选）",
        "description": "列出 workflow keys；设计师一般不需要。",
    },
    {
        "key": "summarize_generation_stack",
        "label": "汇总生成栈（可选）",
        "description": "模型+工作流摘要，偏调试用。",
    },
    {
        "key": "read_skill_resource",
        "label": "读取 Skill 附属文件（可选）",
        "description": "读取已启用 Skill 包内 references 等文本；有 GitHub Skill 包时才有用。",
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


def canonicalize_chat_tool_key(raw: str) -> str:
    key = str(raw or "").strip()
    return CHAT_TOOL_KEY_ALIASES.get(key, key)


def normalize_chat_tool_allowlist(values: list[str] | None) -> tuple[str, ...]:
    allowed = {item["key"] for item in CHAT_TOOL_CATALOG}
    normalized: list[str] = []
    for raw in values or []:
        key = canonicalize_chat_tool_key(raw)
        if key and key in allowed and key not in normalized:
            normalized.append(key)
    if not normalized:
        return DEFAULT_CHAT_TOOL_ALLOWLIST
    return tuple(normalized)


def normalize_disabled_tool_keys(values: list[str] | None) -> tuple[str, ...]:
    allowed = {item["key"] for item in CHAT_TOOL_CATALOG}
    normalized: list[str] = []
    for raw in values or []:
        key = canonicalize_chat_tool_key(raw)
        if key and key in allowed and key not in normalized:
            normalized.append(key)
    return tuple(normalized)


def build_chat_system_prompt(*, baseline: str, template: str | None) -> str:
    overlay = (template or "").strip()
    if not overlay:
        return baseline.strip()
    return f"{baseline.strip()}\n\n{overlay}"


def _load_scope_override(db: Session, *, scope: str, scope_key: str) -> AgentPolicyOverride | None:
    if not scope_key.strip():
        return None
    return db.scalar(
        select(AgentPolicyOverride).where(
            AgentPolicyOverride.scope == scope,
            AgentPolicyOverride.scope_key == scope_key,
            AgentPolicyOverride.is_active == True,  # noqa: E712
        )
    )


def _apply_override(
    *,
    prompt: str,
    allowlist: tuple[str, ...],
    override: AgentPolicyOverride | None,
    layer: str,
    label: str,
    detail: str | None,
) -> tuple[str, tuple[str, ...], ChatPolicyLayer | None, tuple[str, ...]]:
    if override is None:
        return prompt, allowlist, None, ()

    disabled = normalize_disabled_tool_keys(list(override.disabled_tool_keys or []))
    overlay = (override.system_prompt_overlay or "").strip()
    next_prompt = f"{prompt}\n\n{overlay}" if overlay else prompt
    next_allowlist = tuple(key for key in allowlist if key not in disabled)
    layer_info = ChatPolicyLayer(
        layer=layer,
        label=label,
        detail=detail,
        disabled_tool_keys=disabled,
        prompt_overlay=overlay,
    )
    return next_prompt, next_allowlist, layer_info, disabled


def resolve_effective_chat_policy(
    db: Session,
    *,
    environment: str = "prod",
    policy_version: str | None = None,
    user_id: int | None = None,
) -> EffectiveChatPolicy:
    """Resolve Chat policy for the given environment / optional pinned release key."""
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
        base_policy = EffectiveChatPolicy(
            policy_version="code-default",
            release_id=None,
            release_key="code-default",
            environment=environment,
            system_prompt=CHAT_AGENT_BASELINE_PROMPT.strip(),
            chat_tool_allowlist=DEFAULT_CHAT_TOOL_ALLOWLIST,
        )
        global_layer = ChatPolicyLayer(
            layer="global",
            label="代码默认",
            detail="code-default",
        )
    else:
        allowlist = normalize_chat_tool_allowlist(list(release.chat_tool_allowlist or []))
        base_policy = EffectiveChatPolicy(
            policy_version=release.key,
            release_id=release.id,
            release_key=release.key,
            environment=release.environment,
            system_prompt=build_chat_system_prompt(
                baseline=CHAT_AGENT_BASELINE_PROMPT,
                template=release.system_prompt_template,
            ),
            chat_tool_allowlist=allowlist,
        )
        global_layer = ChatPolicyLayer(
            layer="global",
            label="全局发布",
            detail=release.key,
        )

    layers: list[ChatPolicyLayer] = [global_layer]
    prompt = base_policy.system_prompt
    allowlist = base_policy.chat_tool_allowlist
    disabled_all: list[str] = []
    user_group_name: str | None = None

    if user_id is not None:
        user = db.get(User, user_id)
        if user is not None:
            user_group_name = (user.group_name or "").strip() or None
            if user_group_name:
                group_override = _load_scope_override(db, scope="group", scope_key=user_group_name)
                prompt, allowlist, group_layer, group_disabled = _apply_override(
                    prompt=prompt,
                    allowlist=allowlist,
                    override=group_override,
                    layer="group",
                    label="用户组策略",
                    detail=user_group_name,
                )
                if group_layer is not None:
                    layers.append(group_layer)
                    disabled_all.extend(group_disabled)

            user_override = _load_scope_override(db, scope="user", scope_key=str(user_id))
            user_label = user.display_name or user.name
            prompt, allowlist, user_layer, user_disabled = _apply_override(
                prompt=prompt,
                allowlist=allowlist,
                override=user_override,
                layer="user",
                label="个人策略",
                detail=user_label,
            )
            if user_layer is not None:
                layers.append(user_layer)
                disabled_all.extend(user_disabled)

    from app.models import AgentSkillCatalogEntry
    from app.services.agent_skill_install_service import build_enabled_skills_prompt_section

    skills_section = build_enabled_skills_prompt_section(db)
    if skills_section.strip():
        prompt = f"{prompt}\n\n{skills_section.strip()}"

    has_bundled = db.scalar(
        select(AgentSkillCatalogEntry.id).where(
            AgentSkillCatalogEntry.is_active == True,  # noqa: E712
            AgentSkillCatalogEntry.skill_md != "",
        )
    )
    if has_bundled is not None and "read_skill_resource" not in allowlist:
        if "read_skill_resource" not in disabled_all:
            allowlist = (*allowlist, "read_skill_resource")

    for memory_tool in ("memory_recall", "memory_store", "memory_forget"):
        if memory_tool not in allowlist and memory_tool not in disabled_all:
            allowlist = (*allowlist, memory_tool)

    return EffectiveChatPolicy(
        policy_version=base_policy.policy_version,
        release_id=base_policy.release_id,
        release_key=base_policy.release_key,
        environment=base_policy.environment,
        system_prompt=prompt,
        chat_tool_allowlist=allowlist,
        layers=tuple(layers),
        disabled_tool_keys=tuple(dict.fromkeys(disabled_all)),
        user_group_name=user_group_name,
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


def build_personalization_summary(policy: EffectiveChatPolicy) -> str | None:
    parts: list[str] = []
    if policy.user_group_name:
        parts.append(f"用户组「{policy.user_group_name}」")
    for layer in policy.layers:
        if layer.layer == "user":
            parts.append("个人定制")
            break
    if policy.disabled_tool_keys:
        parts.append(f"禁用 {len(policy.disabled_tool_keys)} 项工具")
    if not parts:
        return None
    return " · ".join(parts)


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
        "personalization_summary": build_personalization_summary(policy),
        "user_group_name": policy.user_group_name,
    }
