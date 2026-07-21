import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  api,
  type AgentChatToolRecord,
  type AgentPolicyOverrideRecord,
  type ManagedUser,
} from "../../api";

type OverrideDraft = {
  scope: "group" | "user";
  scope_key: string;
  disabled_tool_keys: string[];
  system_prompt_overlay: string;
  notes: string;
  is_active: boolean;
};

const emptyDraft: OverrideDraft = {
  scope: "group",
  scope_key: "",
  disabled_tool_keys: [],
  system_prompt_overlay: "",
  notes: "",
  is_active: true,
};

type AgentPolicyOverridesPanelProps = {
  chatTools: AgentChatToolRecord[];
  onSetError: (error: string) => void;
};

export default function AgentPolicyOverridesPanel({ chatTools, onSetError }: AgentPolicyOverridesPanelProps) {
  const [overrides, setOverrides] = useState<AgentPolicyOverrideRecord[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<OverrideDraft>(emptyDraft);

  const groupOptions = useMemo(() => {
    const names = new Set<string>();
    for (const user of users) {
      const group = (user.group_name || "").trim();
      if (group) {
        names.add(group);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [users]);

  async function refresh() {
    setLoading(true);
    try {
      const [nextOverrides, nextUsers] = await Promise.all([api.agentPolicyOverrides(), api.users()]);
      setOverrides(nextOverrides);
      setUsers(nextUsers);
    } catch (error) {
      onSetError(error instanceof Error ? error.message : "加载策略 Override 失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function resetDraft() {
    setEditingId(null);
    setDraft(emptyDraft);
    onSetError("");
  }

  function handleEdit(record: AgentPolicyOverrideRecord) {
    setEditingId(record.id);
    setDraft({
      scope: record.scope,
      scope_key: record.scope_key,
      disabled_tool_keys: record.disabled_tool_keys,
      system_prompt_overlay: record.system_prompt_overlay,
      notes: record.notes,
      is_active: record.is_active,
    });
    onSetError("");
  }

  function toggleDisabledTool(toolKey: string) {
    setDraft((current) => {
      const exists = current.disabled_tool_keys.includes(toolKey);
      return {
        ...current,
        disabled_tool_keys: exists
          ? current.disabled_tool_keys.filter((item) => item !== toolKey)
          : [...current.disabled_tool_keys, toolKey],
      };
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.scope_key.trim()) {
      onSetError("请选择或填写作用范围");
      return;
    }

    setSaving(true);
    try {
      if (editingId === null) {
        await api.createAgentPolicyOverride({
          scope: draft.scope,
          scope_key: draft.scope_key.trim(),
          disabled_tool_keys: draft.disabled_tool_keys,
          system_prompt_overlay: draft.system_prompt_overlay,
          notes: draft.notes,
          is_active: draft.is_active,
        });
      } else {
        await api.updateAgentPolicyOverride(editingId, {
          disabled_tool_keys: draft.disabled_tool_keys,
          system_prompt_overlay: draft.system_prompt_overlay,
          notes: draft.notes,
          is_active: draft.is_active,
        });
      }
      resetDraft();
      await refresh();
    } catch (error) {
      onSetError(error instanceof Error ? error.message : "保存 Override 失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(overrideId: number) {
    if (!window.confirm("确定删除这条策略 Override？")) {
      return;
    }
    try {
      await api.deleteAgentPolicyOverride(overrideId);
      if (editingId === overrideId) {
        resetDraft();
      }
      await refresh();
    } catch (error) {
      onSetError(error instanceof Error ? error.message : "删除 Override 失败");
    }
  }

  return (
    <section className="agent-policy-overrides-panel">
      <div className="agent-ops-section-head">
        <div>
          <h2>差异化规则</h2>
          <p>在默认能力包之上，为特定用户组或个人禁用部分 Chat tool 或追加说明。不是主配置入口。</p>
        </div>
        <button type="button" className="ghost-button" onClick={() => void refresh()}>
          刷新
        </button>
      </div>

      <div className="agent-policy-overrides-layout">
        <div className="admin-data-table agent-policy-overrides-table">
          <div className="admin-table-row admin-table-head">
            <span>作用范围</span>
            <span>禁用工具</span>
            <span>Prompt 追加</span>
            <span>状态</span>
            <span>操作</span>
          </div>
          {loading ? (
            <div className="admin-table-row">
              <span>加载中…</span>
            </div>
          ) : overrides.length === 0 ? (
            <div className="admin-table-row">
              <span>暂无 Override，可在右侧创建。</span>
            </div>
          ) : (
            overrides.map((item) => (
              <div key={item.id} className="admin-table-row">
                <span>
                  <strong>{item.scope === "group" ? "用户组" : "个人"}</strong>
                  <small>{item.scope_display_name || item.scope_key}</small>
                </span>
                <span>{item.disabled_tool_keys.length} 项</span>
                <span>{item.system_prompt_overlay.trim() ? "有追加" : "无"}</span>
                <span>
                  <em className={`status-pill ${item.is_active ? "status-completed" : "status-failed"}`}>
                    {item.is_active ? "启用" : "暂停"}
                  </em>
                </span>
                <span className="admin-row-actions">
                  <button type="button" onClick={() => handleEdit(item)}>
                    编辑
                  </button>
                  <button type="button" onClick={() => void handleDelete(item.id)}>
                    删除
                  </button>
                </span>
              </div>
            ))
          )}
        </div>

        <form className="admin-side-form agent-policy-override-form" onSubmit={handleSave}>
          <div className="admin-detail-head">
            <h3>{editingId === null ? "新建 Override" : "编辑 Override"}</h3>
            <p>个人 Override 优先于用户组；均叠加在 active prod release 之上。</p>
          </div>

          <label className="composer-menu-field">
            <span>作用类型</span>
            <select
              value={draft.scope}
              disabled={editingId !== null}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  scope: event.target.value as "group" | "user",
                  scope_key: "",
                }))
              }
            >
              <option value="group">用户组</option>
              <option value="user">个人（user id）</option>
            </select>
          </label>

          <label className="composer-menu-field">
            <span>{draft.scope === "group" ? "用户组名称" : "用户"}</span>
            {draft.scope === "group" ? (
              <input
                list="agent-group-options"
                value={draft.scope_key}
                disabled={editingId !== null}
                onChange={(event) => setDraft((current) => ({ ...current, scope_key: event.target.value }))}
                placeholder="例如：建筑一所"
              />
            ) : (
              <select
                value={draft.scope_key}
                disabled={editingId !== null}
                onChange={(event) => setDraft((current) => ({ ...current, scope_key: event.target.value }))}
              >
                <option value="">选择用户</option>
                {users.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.display_name || user.name} (#{user.id})
                  </option>
                ))}
              </select>
            )}
            <datalist id="agent-group-options">
              {groupOptions.map((group) => (
                <option key={group} value={group} />
              ))}
            </datalist>
          </label>

          <label className="composer-menu-field">
            <span>追加 system 片段</span>
            <textarea
              className="agent-release-notes"
              value={draft.system_prompt_overlay}
              onChange={(event) => setDraft((current) => ({ ...current, system_prompt_overlay: event.target.value }))}
              placeholder="例如：优先推荐共享模板，回答保持三条以内。"
            />
          </label>

          <label className="composer-menu-field">
            <span>备注</span>
            <input
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="为何对该组/用户做限制？"
            />
          </label>

          <label className="model-toggle">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))}
            />
            <span>启用此 Override</span>
          </label>

          <div className="agent-skill-picker">
            <div className="agent-ops-section-head">
              <div>
                <h4>禁用 Chat 工具</h4>
                <p>从该组/用户 effective allowlist 中移除（不可新增全局未发布的工具）。</p>
              </div>
              <span>{draft.disabled_tool_keys.length} 项</span>
            </div>
            <div className="agent-skill-list">
              {chatTools.map((tool) => {
                const checked = draft.disabled_tool_keys.includes(tool.key);
                return (
                  <label key={tool.key} className={checked ? "agent-skill-card selected" : "agent-skill-card"}>
                    <input type="checkbox" checked={checked} onChange={() => toggleDisabledTool(tool.key)} />
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

          <div className="template-editor-actions">
            <button type="submit" className="submit-button" disabled={saving}>
              {saving ? "保存中..." : editingId === null ? "创建 Override" : "保存修改"}
            </button>
            {editingId !== null ? (
              <button type="button" className="ghost-button" onClick={resetDraft}>
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
