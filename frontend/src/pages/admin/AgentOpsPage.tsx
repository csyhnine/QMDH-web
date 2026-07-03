import { type FormEvent, useEffect, useMemo, useState } from "react";

import AgentMultiAgentPanel from "./AgentMultiAgentPanel";
import AgentOpsChatObservabilityPanel from "./AgentOpsChatObservabilityPanel";
import AgentPolicyOverridesPanel from "./AgentPolicyOverridesPanel";
import {
  api,
  type AgentChatToolRecord,
  type AgentClientRecord,
  type AgentOfficialSkill,
  type AgentSkillReleaseCreatePayload,
  type AgentSkillReleaseRecord,
  type ChatAgentPolicyDefaultsRecord,
} from "../../api";

type ReleaseDraft = {
  key: string;
  display_name: string;
  environment: "test" | "prod";
  openclaw_version: string;
  notes: string;
  is_active: boolean;
  skill_keys: string[];
  system_prompt_template: string;
  chat_tool_allowlist: string[];
};

const defaultDraft: ReleaseDraft = {
  key: "",
  display_name: "",
  environment: "test",
  openclaw_version: "latest",
  notes: "",
  is_active: true,
  skill_keys: [],
  system_prompt_template: "",
  chat_tool_allowlist: [],
};

function formatDate(value: string | null): string {
  if (!value) return "从未";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function environmentLabel(value: string): string {
  if (value === "prod") return "生产";
  if (value === "test") return "测试";
  return value;
}

function buildKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function toCreatePayload(draft: ReleaseDraft): AgentSkillReleaseCreatePayload {
  return {
    key: draft.key.trim(),
    display_name: draft.display_name.trim(),
    environment: draft.environment,
    openclaw_version: draft.openclaw_version.trim() || "latest",
    notes: draft.notes.trim(),
    is_active: draft.is_active,
    skill_keys: draft.skill_keys,
    system_prompt_template: draft.system_prompt_template.trim(),
    chat_tool_allowlist: draft.chat_tool_allowlist,
  };
}

export type AgentOpsPageProps = {
  clients: AgentClientRecord[];
  skills: AgentOfficialSkill[];
  chatTools: AgentChatToolRecord[];
  releases: AgentSkillReleaseRecord[];
  error: string;
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

export default function AgentOpsPage({
  clients,
  skills,
  chatTools,
  releases,
  error,
  onRefresh,
  onSetError,
}: AgentOpsPageProps) {
  const [draft, setDraft] = useState<ReleaseDraft>(defaultDraft);
  const [editingReleaseId, setEditingReleaseId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [policyDefaults, setPolicyDefaults] = useState<ChatAgentPolicyDefaultsRecord | null>(null);

  const activeProdRelease = useMemo(
    () =>
      releases.find((release) => release.environment === "prod" && release.is_active) ??
      releases.find((release) => release.environment === "prod"),
    [releases],
  );

  const effectivePreview = useMemo(() => {
    const baseline = policyDefaults?.baseline_prompt ?? "";
    const overlay = draft.system_prompt_template.trim();
    const selectedTools = draft.chat_tool_allowlist
      .map((key) => chatTools.find((tool) => tool.key === key)?.label ?? key)
      .filter(Boolean);
    return {
      baseline,
      overlay,
      mergedPrompt: overlay ? `${baseline}\n\n${overlay}` : baseline,
      selectedTools,
    };
  }, [chatTools, draft.chat_tool_allowlist, draft.system_prompt_template, policyDefaults?.baseline_prompt]);

  const activeClients = clients.filter((client) => client.is_active);
  const onlineClients = clients.filter((client) => {
    if (!client.last_seen_at) return false;
    const seenAt = new Date(client.last_seen_at).getTime();
    return Number.isFinite(seenAt) && Date.now() - seenAt <= 10 * 60 * 1000;
  });
  const prodReleases = releases.filter((release) => release.environment === "prod");
  const activeReleases = releases.filter((release) => release.is_active);

  useEffect(() => {
    if (editingReleaseId !== null) {
      const matched = releases.find((release) => release.id === editingReleaseId);
      if (!matched) {
        setEditingReleaseId(null);
        setDraft(defaultDraft);
      }
      return;
    }
    if (chatTools.length === 0) {
      return;
    }
    setDraft((current) => {
      if (current.chat_tool_allowlist.length > 0) {
        return current;
      }
      return {
        ...current,
        chat_tool_allowlist: chatTools.map((tool) => tool.key),
      };
    });
  }, [chatTools, editingReleaseId, releases]);

  useEffect(() => {
    void api
      .agentChatPolicyDefaults()
      .then(setPolicyDefaults)
      .catch(() => setPolicyDefaults(null));
  }, []);

  function selectAllChatTools() {
    setDraft((current) => ({ ...current, chat_tool_allowlist: chatTools.map((tool) => tool.key) }));
  }

  function clearChatTools() {
    setDraft((current) => ({ ...current, chat_tool_allowlist: [] }));
  }

  function startNewProdRelease() {
    setEditingReleaseId(null);
    setDraft({
      ...defaultDraft,
      environment: "prod",
      chat_tool_allowlist: chatTools.map((tool) => tool.key),
    });
    onSetError("");
  }

  const activeChatToolLabels = useMemo(() => {
    if (!activeProdRelease) {
      return [];
    }
    const keys =
      activeProdRelease.chat_tool_allowlist.length > 0
        ? activeProdRelease.chat_tool_allowlist
        : policyDefaults?.default_tool_allowlist ?? [];
    return keys.map((key) => chatTools.find((tool) => tool.key === key)?.label ?? key);
  }, [activeProdRelease, chatTools, policyDefaults?.default_tool_allowlist]);

  function resetDraft() {
    setEditingReleaseId(null);
    setDraft(defaultDraft);
  }

  function handleEditRelease(release: AgentSkillReleaseRecord) {
    setEditingReleaseId(release.id);
    setDraft({
      key: release.key,
      display_name: release.display_name,
      environment: release.environment,
      openclaw_version: release.openclaw_version,
      notes: release.notes,
      is_active: release.is_active,
      skill_keys: release.skill_keys,
      system_prompt_template: release.system_prompt_template,
      chat_tool_allowlist: release.chat_tool_allowlist,
    });
    onSetError("");
  }

  function toggleSkill(skillKey: string) {
    setDraft((current) => {
      const exists = current.skill_keys.includes(skillKey);
      return {
        ...current,
        skill_keys: exists
          ? current.skill_keys.filter((item) => item !== skillKey)
          : [...current.skill_keys, skillKey],
      };
    });
  }

  function toggleChatTool(toolKey: string) {
    setDraft((current) => {
      const exists = current.chat_tool_allowlist.includes(toolKey);
      return {
        ...current,
        chat_tool_allowlist: exists
          ? current.chat_tool_allowlist.filter((item) => item !== toolKey)
          : [...current.chat_tool_allowlist, toolKey],
      };
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = toCreatePayload(draft);
    if (!payload.display_name) {
      onSetError("请填写发布名称");
      return;
    }
    if (!payload.key) {
      onSetError("请填写发布 Key");
      return;
    }
    if (payload.skill_keys.length === 0 && payload.chat_tool_allowlist.length === 0) {
      onSetError("请至少选择一个 OpenClaw 技能或 Chat 工具");
      return;
    }

    setSaving(true);
    try {
      if (editingReleaseId === null) {
        await api.createAgentSkillRelease(payload);
      } else {
        await api.updateAgentSkillRelease(editingReleaseId, payload);
      }
      resetDraft();
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "保存发布失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-page agent-ops-page">
      <header className="admin-page-head">
        <div>
          <h1>Agent 能力管理</h1>
          <p>
            管理员在此统一配置用户侧能力：设计师 Chat 助手可用的 tools、OpenClaw 客户端可用的 skills，以及助手行为说明。
            设计师不能自行改配置，保存生产版本后即对用户生效。
          </p>
        </div>
        <div className="admin-head-actions">
          {activeProdRelease ? (
            <button type="button" className="ghost-button" onClick={() => handleEditRelease(activeProdRelease)}>
              编辑当前用户侧配置
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={startNewProdRelease}>
            新建能力版本
          </button>
          <button type="button" className="admin-primary-button" onClick={onRefresh}>
            刷新
          </button>
        </div>
      </header>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card admin-blue">
          <div>
            <span>已注册客户端</span>
            <strong>{clients.length}</strong>
            <small>全部已知 OpenClaw 设备</small>
          </div>
          <i>AG</i>
        </article>
        <article className="admin-kpi-card admin-green">
          <div>
            <span>当前在线</span>
            <strong>{onlineClients.length}</strong>
            <small>近 10 分钟内有心跳</small>
          </div>
          <i>ON</i>
        </article>
        <article className="admin-kpi-card admin-orange">
          <div>
            <span>用户侧能力版本</span>
            <strong>{prodReleases.length}</strong>
            <small>生产环境已发布配置</small>
          </div>
          <i>PR</i>
        </article>
        <article className="admin-kpi-card admin-purple">
          <div>
            <span>官方技能</span>
            <strong>{skills.length}</strong>
            <small>QMDH 维护的 OpenClaw 技能</small>
          </div>
          <i>SK</i>
        </article>
      </div>

      <section className="admin-table-panel agent-designer-config-live">
        <div className="agent-ops-section-head">
          <div>
            <h2>当前对用户生效的能力</h2>
            <p>下方是设计师在 Chat「我的助手能力」中看到的默认配置（来自 active 生产版本）。</p>
          </div>
          {activeProdRelease ? (
            <span>{activeProdRelease.is_active ? "已启用" : "未启用"} · {activeProdRelease.key}</span>
          ) : (
            <span>尚未配置</span>
          )}
        </div>
        {activeProdRelease ? (
          <div className="agent-designer-config-live-body">
            <div>
              <h3>{activeProdRelease.display_name}</h3>
              <p>
                Chat 工具 {activeChatToolLabels.length} 项 · OpenClaw Skills {activeProdRelease.skill_keys.length} 项
              </p>
            </div>
            <div className="agent-policy-preview-tools">
              {activeChatToolLabels.map((label) => (
                <span key={label} className="chat-agent-tool-chip">
                  {label}
                </span>
              ))}
            </div>
            {activeProdRelease.system_prompt_template.trim() ? (
              <pre className="agent-policy-overlay">{activeProdRelease.system_prompt_template}</pre>
            ) : (
              <p className="agent-policy-note">未追加管理员说明，助手使用系统默认 baseline 行为。</p>
            )}
            <button type="button" className="admin-primary-button" onClick={() => handleEditRelease(activeProdRelease)}>
              编辑此配置
            </button>
          </div>
        ) : (
          <div className="agent-designer-config-live-empty">
            <p>还没有生产环境能力包。请点击「新建能力版本」，勾选 Chat tools / OpenClaw skills 并保存。</p>
            <button type="button" className="admin-primary-button" onClick={startNewProdRelease}>
              创建用户侧能力包
            </button>
          </div>
        )}
      </section>

      <section className="admin-table-panel agent-designer-config-editor">
        <form className="admin-side-form agent-designer-config-form" onSubmit={handleSave}>
          <div className="admin-detail-head">
            <h2>{editingReleaseId === null ? "新建用户侧能力包" : "编辑用户侧能力包"}</h2>
            <p>一次配置同时作用于：① 设计师 Chat 助手 tools + 行为说明；② OpenClaw 客户端 official skills。</p>
            <small>环境选「生产」并勾选启用后，保存即对所有设计师生效（无需用户自行设置）。</small>
          </div>

          <div className="agent-designer-config-grid">
            <label className="composer-menu-field">
              <span>配置名称</span>
              <input
                value={draft.display_name}
                onChange={(event) => {
                  const displayName = event.target.value;
                  setDraft((current) => ({
                    ...current,
                    display_name: displayName,
                    key: editingReleaseId === null ? buildKey(displayName) : current.key,
                  }));
                }}
                placeholder="例如：2026 Q2 设计师助手标准包"
              />
            </label>

            <label className="composer-menu-field">
              <span>配置 Key（版本标识）</span>
              <input
                value={draft.key}
                disabled={editingReleaseId !== null}
                onChange={(event) => setDraft((current) => ({ ...current, key: buildKey(event.target.value) }))}
              />
            </label>

            <label className="composer-menu-field">
              <span>环境</span>
              <select
                value={draft.environment}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, environment: event.target.value as "test" | "prod" }))
                }
              >
                <option value="prod">生产（对用户生效）</option>
                <option value="test">测试（仅内测）</option>
              </select>
            </label>

            <label className="composer-menu-field">
              <span>OpenClaw 版本</span>
              <input
                value={draft.openclaw_version}
                onChange={(event) => setDraft((current) => ({ ...current, openclaw_version: event.target.value }))}
              />
            </label>
          </div>

          <label className="composer-menu-field">
            <span>设计师 Chat 助手行为说明（管理员追加）</span>
            <textarea
              className="agent-release-notes"
              value={draft.system_prompt_template}
              onChange={(event) =>
                setDraft((current) => ({ ...current, system_prompt_template: event.target.value }))
              }
              placeholder="例如：优先推荐共享模板；回答简洁；不要罗列平台全部能力清单。"
            />
          </label>

          <div className="agent-skill-picker">
            <div className="agent-ops-section-head">
              <div>
                <h3>设计师 Chat 助手 Tools</h3>
                <p>勾选后，所有设计师在 Chat 助手模式中可调用这些只读工具（搜灵感、模板、模型等）。</p>
              </div>
              <div className="agent-tool-actions">
                <button type="button" className="ghost-button" onClick={selectAllChatTools}>
                  全选
                </button>
                <button type="button" className="ghost-button" onClick={clearChatTools}>
                  清空
                </button>
                <span>已选 {draft.chat_tool_allowlist.length} 项</span>
              </div>
            </div>
            <div className="agent-skill-list">
              {chatTools.map((tool) => {
                const checked = draft.chat_tool_allowlist.includes(tool.key);
                return (
                  <label key={tool.key} className={checked ? "agent-skill-card selected" : "agent-skill-card"}>
                    <input type="checkbox" checked={checked} onChange={() => toggleChatTool(tool.key)} />
                    <div>
                      <strong>{tool.label}</strong>
                      <small>{tool.key}</small>
                      <p>{tool.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="agent-skill-picker">
            <div className="agent-ops-section-head">
              <div>
                <h3>OpenClaw 客户端 Skills</h3>
                <p>勾选后，下发给院内 OpenClaw 桌面客户端的官方 QMDH 技能包。</p>
              </div>
              <span>已选 {draft.skill_keys.length} 项</span>
            </div>
            <div className="agent-skill-list">
              {skills.map((skill) => {
                const checked = draft.skill_keys.includes(skill.key);
                return (
                  <label key={skill.key} className={checked ? "agent-skill-card selected" : "agent-skill-card"}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSkill(skill.key)} />
                    <div>
                      <strong>{skill.name}</strong>
                      <small>{skill.key} · v{skill.version}</small>
                      <p>{skill.description}</p>
                      <span>
                        {skill.inputs.join(", ") || "无输入"} → {skill.outputs.join(", ") || "无输出"}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <label className="composer-menu-field">
            <span>变更说明（审计用）</span>
            <textarea
              className="agent-release-notes"
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="本次调整了哪些 tools/skills？为何可以上线？"
            />
          </label>

          <label className="model-toggle">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))}
            />
            <span>保存后立即启用（生产环境即对用户生效）</span>
          </label>

          <div className="agent-policy-preview">
            <div className="agent-ops-section-head">
              <div>
                <h3>保存后用户侧预览</h3>
                <p>设计师 Chat 将看到以下 tools；OpenClaw 客户端获得对应 skills。</p>
              </div>
            </div>
            <div className="agent-policy-preview-tools">
              {effectivePreview.selectedTools.length > 0 ? (
                effectivePreview.selectedTools.map((label) => (
                  <span key={label} className="chat-agent-tool-chip">
                    {label}
                  </span>
                ))
              ) : (
                <span className="agent-policy-note">请至少勾选一个 Chat tool 或 OpenClaw skill</span>
              )}
            </div>
          </div>

          {error ? <div className="floating-error">{error}</div> : null}

          <div className="template-editor-actions">
            <button type="submit" className="submit-button" disabled={saving}>
              {saving ? "保存中..." : editingReleaseId === null ? "创建并发布" : "保存用户侧配置"}
            </button>
            {editingReleaseId !== null ? (
              <button type="button" className="ghost-button" onClick={resetDraft}>
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <details className="agent-advanced-panel admin-table-panel">
        <summary>
          <span>高级：按用户组 / 个人差异化（可选）</span>
          <small>大多数场景只需编辑上方「用户侧能力包」。仅当某组或某人需要禁用部分 tool 时使用。</small>
        </summary>
        <AgentPolicyOverridesPanel chatTools={chatTools} onSetError={onSetError} />

        <AgentMultiAgentPanel chatTools={chatTools} onSetError={onSetError} />

        <AgentOpsChatObservabilityPanel onSetError={onSetError} />
      </details>

      <section className="admin-table-panel">
        <div className="agent-ops-section-head">
          <div>
            <h2>能力版本历史</h2>
            <p>每次保存产生一个版本；生产 + 已启用 的版本即当前用户侧默认配置。</p>
          </div>
          <span>{activeReleases.length} 个启用</span>
        </div>
        <div className="admin-data-table agent-release-table">
          <div className="admin-table-row admin-table-head">
            <span>发布</span>
            <span>环境</span>
            <span>OpenClaw</span>
            <span>技能 / Chat 工具</span>
            <span>更新时间</span>
            <span>操作</span>
          </div>
          {releases.map((release) => (
            <div key={release.id} className="admin-table-row">
              <span>
                <strong>{release.display_name}</strong>
                <small>{release.key}</small>
              </span>
              <span>
                <em className="admin-tag">{environmentLabel(release.environment)}</em>
              </span>
              <span>
                <strong>{release.openclaw_version}</strong>
                <small>{release.is_active ? "已启用" : "未启用"}</small>
              </span>
              <span>
                <strong>
                  {release.skill_keys.length} / {release.chat_tool_allowlist.length || "默认"}
                </strong>
                <small>{release.chat_tool_allowlist.slice(0, 2).join(", ") || "默认 Chat 工具集"}</small>
              </span>
              <span>
                <strong>{formatDate(release.updated_at)}</strong>
                <small>{release.created_by_user_name || "未知发布者"}</small>
              </span>
              <span className="admin-row-actions">
                <button type="button" onClick={() => handleEditRelease(release)}>
                  编辑
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-table-panel">
        <div className="agent-ops-section-head">
          <div>
            <h2>OpenClaw 客户端</h2>
            <p>桌面客户端设备列表；skills 仍由上方「用户侧能力包」统一下发。</p>
          </div>
          <span>{activeClients.length} 个启用</span>
        </div>
        <div className="admin-data-table agent-client-table">
          <div className="admin-table-row admin-table-head">
            <span>客户端</span>
            <span>环境</span>
            <span>用户</span>
            <span>能力</span>
            <span>最近活跃</span>
            <span>状态</span>
          </div>
          {clients.map((client) => (
            <div key={client.id} className="admin-table-row">
              <span>
                <strong>{client.display_name}</strong>
                <small>
                  {client.key} · {client.device_id}
                </small>
              </span>
              <span>
                <em className="admin-tag">{environmentLabel(client.environment)}</em>
              </span>
              <span>
                <strong>{client.user_name || "未绑定"}</strong>
                <small>{client.role}</small>
              </span>
              <span>
                <strong>{client.capabilities.length}</strong>
                <small>{client.capabilities.slice(0, 2).join(", ") || "无能力项"}</small>
              </span>
              <span>
                <strong>{formatDate(client.last_seen_at)}</strong>
                <small>{client.last_request_id || "无请求 ID"}</small>
              </span>
              <span>
                <em className={`status-pill ${client.is_active ? "status-completed" : "status-failed"}`}>
                  {client.is_active ? "启用" : "暂停"}
                </em>
              </span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
