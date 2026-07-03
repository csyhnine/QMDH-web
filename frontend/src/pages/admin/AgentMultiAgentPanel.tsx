import { useEffect, useMemo, useState } from "react";

import {
  api,
  type AgentChatToolRecord,
  type AgentPersonaRecord,
  type ManagedUser,
  type UserAgentRosterRecord,
} from "../../api";

type AgentMultiAgentPanelProps = {
  chatTools: AgentChatToolRecord[];
  onSetError: (error: string) => void;
};

const ROLE_LABELS: Record<string, string> = {
  coordinator: "协调",
  research: "检索",
  studio: "生图",
  custom: "自定义",
};

export default function AgentMultiAgentPanel({ chatTools, onSetError }: AgentMultiAgentPanelProps) {
  const [personas, setPersonas] = useState<AgentPersonaRecord[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [roster, setRoster] = useState<UserAgentRosterRecord | null>(null);
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<number[]>([]);
  const [primaryPersonaId, setPrimaryPersonaId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const activePersonas = useMemo(() => personas.filter((item) => item.is_active), [personas]);
  const designers = useMemo(() => users.filter((item) => item.role === "designer" && item.is_active), [users]);

  useEffect(() => {
    void Promise.all([api.agentPersonas(), api.users()])
      .then(([nextPersonas, nextUsers]) => {
        setPersonas(nextPersonas);
        setUsers(nextUsers);
        onSetError("");
      })
      .catch((err) => onSetError(err instanceof Error ? err.message : "加载 Agent 角色失败"));
  }, [onSetError]);

  useEffect(() => {
    if (selectedUserId === null) {
      setRoster(null);
      setSelectedPersonaIds([]);
      setPrimaryPersonaId(null);
      return;
    }
    setLoading(true);
    void api
      .getUserAgentRoster(selectedUserId)
      .then((nextRoster) => {
        setRoster(nextRoster);
        setSelectedPersonaIds(nextRoster.agents.map((item) => item.persona_id));
        setPrimaryPersonaId(nextRoster.agents.find((item) => item.is_primary)?.persona_id ?? null);
        onSetError("");
      })
      .catch((err) => onSetError(err instanceof Error ? err.message : "加载账号编制失败"))
      .finally(() => setLoading(false));
  }, [onSetError, selectedUserId]);

  function togglePersona(personaId: number) {
    setSelectedPersonaIds((current) => {
      const exists = current.includes(personaId);
      const next = exists ? current.filter((item) => item !== personaId) : [...current, personaId];
      if (primaryPersonaId !== null && !next.includes(primaryPersonaId)) {
        setPrimaryPersonaId(next[0] ?? null);
      }
      return next;
    });
  }

  async function handleSaveRoster() {
    if (selectedUserId === null || selectedPersonaIds.length === 0) {
      onSetError("请至少选择一个 Agent");
      return;
    }
    setSaving(true);
    try {
      const next = await api.updateUserAgentRoster(selectedUserId, {
        persona_ids: selectedPersonaIds,
        primary_persona_id: primaryPersonaId ?? selectedPersonaIds[0],
      });
      setRoster(next);
      onSetError("");
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "保存账号编制失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetRoster() {
    if (selectedUserId === null) {
      return;
    }
    setSaving(true);
    try {
      const next = await api.resetUserAgentRoster(selectedUserId);
      setRoster(next);
      setSelectedPersonaIds(next.agents.map((item) => item.persona_id));
      setPrimaryPersonaId(next.agents.find((item) => item.is_primary)?.persona_id ?? null);
      onSetError("");
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "恢复默认编制失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="admin-table-panel">
        <div className="agent-ops-section-head">
          <div>
            <h2>Agent 角色目录</h2>
            <p>默认 trio：协调 / 检索 / 生图。LangGraph 按角色路由，各 Agent 独立 tool 子集与记忆 scope。</p>
          </div>
          <span>{activePersonas.length} 个启用</span>
        </div>
        <div className="admin-data-table">
          <div className="admin-table-row admin-table-head">
            <span>角色</span>
            <span>Key</span>
            <span>Tools</span>
            <span>记忆</span>
            <span>状态</span>
          </div>
          {personas.map((persona) => (
            <div key={persona.id} className="admin-table-row">
              <span>
                <strong>{persona.display_name}</strong>
                <small>{ROLE_LABELS[persona.role] || persona.role}</small>
              </span>
              <span>{persona.key}</span>
              <span>
                <strong>{persona.chat_tool_allowlist.length}</strong>
                <small>
                  {persona.chat_tool_allowlist
                    .map((key) => chatTools.find((tool) => tool.key === key)?.label ?? key)
                    .slice(0, 3)
                    .join("、") || "无"}
                </small>
              </span>
              <span>{persona.memory_scope}</span>
              <span>
                <em className={`status-pill ${persona.is_active ? "status-completed" : "status-failed"}`}>
                  {persona.is_active ? "启用" : "停用"}
                </em>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-table-panel">
        <div className="agent-ops-section-head">
          <div>
            <h2>设计师账号编制</h2>
            <p>为账号分配多 Agent 团队；未配置时 Bootstrap 默认 trio。</p>
          </div>
          <div className="admin-head-actions">
            <select
              value={selectedUserId ?? ""}
              onChange={(event) => setSelectedUserId(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">选择设计师</option>
              {designers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name || user.name}
                </option>
              ))}
            </select>
            <button type="button" className="ghost-button" disabled={selectedUserId === null || saving} onClick={() => void handleResetRoster()}>
              恢复默认 trio
            </button>
            <button type="button" className="admin-primary-button" disabled={selectedUserId === null || saving} onClick={() => void handleSaveRoster()}>
              {saving ? "保存中…" : "保存编制"}
            </button>
          </div>
        </div>

        {selectedUserId === null ? (
          <p className="chat-agent-scope-note">请选择设计师以查看或编辑 Agent 编制。</p>
        ) : loading ? (
          <p className="chat-agent-scope-note">加载编制中…</p>
        ) : (
          <div className="agent-skill-list">
            {activePersonas.map((persona) => {
              const checked = selectedPersonaIds.includes(persona.id);
              return (
                <label key={persona.id} className={checked ? "agent-skill-card selected" : "agent-skill-card"}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePersona(persona.id)}
                  />
                  <div>
                    <strong>{persona.display_name}</strong>
                    <small>{persona.key}</small>
                    <p>{ROLE_LABELS[persona.role] || persona.role}</p>
                  </div>
                  <label className="agent-roster-primary">
                    <input
                      type="radio"
                      name="primary-persona"
                      checked={primaryPersonaId === persona.id}
                      disabled={!checked}
                      onChange={() => setPrimaryPersonaId(persona.id)}
                    />
                    主协调
                  </label>
                </label>
              );
            })}
          </div>
        )}

        {roster ? (
          <p className="chat-agent-scope-note">
            当前：{roster.agents.map((item) => `${item.display_name}${item.is_primary ? "（主）" : ""}`).join(" · ")}
          </p>
        ) : null}
      </section>
    </>
  );
}
