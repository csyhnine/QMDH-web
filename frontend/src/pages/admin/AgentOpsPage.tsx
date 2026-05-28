import { type FormEvent, useEffect, useState } from "react";

import {
  api,
  type AgentClientRecord,
  type AgentOfficialSkill,
  type AgentSkillReleaseCreatePayload,
  type AgentSkillReleaseRecord,
} from "../../api";

type ReleaseDraft = {
  key: string;
  display_name: string;
  environment: "test" | "prod";
  openclaw_version: string;
  notes: string;
  is_active: boolean;
  skill_keys: string[];
};

const defaultDraft: ReleaseDraft = {
  key: "",
  display_name: "",
  environment: "test",
  openclaw_version: "latest",
  notes: "",
  is_active: true,
  skill_keys: [],
};

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
  };
}

export type AgentOpsPageProps = {
  clients: AgentClientRecord[];
  skills: AgentOfficialSkill[];
  releases: AgentSkillReleaseRecord[];
  error: string;
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

export default function AgentOpsPage({
  clients,
  skills,
  releases,
  error,
  onRefresh,
  onSetError,
}: AgentOpsPageProps) {
  const [draft, setDraft] = useState<ReleaseDraft>(defaultDraft);
  const [editingReleaseId, setEditingReleaseId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

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
    }
  }, [editingReleaseId, releases]);

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

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = toCreatePayload(draft);
    if (!payload.display_name) {
      onSetError("Release name is required");
      return;
    }
    if (!payload.key) {
      onSetError("Release key is required");
      return;
    }
    if (payload.skill_keys.length === 0) {
      onSetError("Select at least one official skill");
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
      onSetError(err instanceof Error ? err.message : "Failed to save release");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-page agent-ops-page">
      <header className="admin-page-head">
        <div>
          <h1>Agent Operations</h1>
          <p>Manage OpenClaw client visibility, official QMDH skills, and the releases we allow into test or production.</p>
        </div>
        <div className="admin-head-actions">
          <button type="button" className="ghost-button" onClick={resetDraft}>
            New release
          </button>
          <button type="button" className="admin-primary-button" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </header>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card admin-blue">
          <div>
            <span>Registered clients</span>
            <strong>{clients.length}</strong>
            <small>All known OpenClaw devices</small>
          </div>
          <i>AG</i>
        </article>
        <article className="admin-kpi-card admin-green">
          <div>
            <span>Online now</span>
            <strong>{onlineClients.length}</strong>
            <small>Seen within the last 10 minutes</small>
          </div>
          <i>ON</i>
        </article>
        <article className="admin-kpi-card admin-orange">
          <div>
            <span>Prod releases</span>
            <strong>{prodReleases.length}</strong>
            <small>Controlled production skill packs</small>
          </div>
          <i>PR</i>
        </article>
        <article className="admin-kpi-card admin-purple">
          <div>
            <span>Official skills</span>
            <strong>{skills.length}</strong>
            <small>QMDH-maintained OpenClaw skills</small>
          </div>
          <i>SK</i>
        </article>
      </div>

      <div className="admin-split-layout agent-ops-layout">
        <section className="admin-table-panel">
          <div className="agent-ops-section-head">
            <div>
              <h2>Agent clients</h2>
              <p>Each client is bound to a user, environment, and allowed project scope.</p>
            </div>
            <span>{activeClients.length} active</span>
          </div>
          <div className="admin-data-table agent-client-table">
            <div className="admin-table-row admin-table-head">
              <span>Client</span>
              <span>Environment</span>
              <span>User</span>
              <span>Capabilities</span>
              <span>Last seen</span>
              <span>Status</span>
            </div>
            {clients.map((client) => (
              <div key={client.id} className="admin-table-row">
                <span>
                  <strong>{client.display_name}</strong>
                  <small>{client.key} · {client.device_id}</small>
                </span>
                <span>
                  <em className="admin-tag">{client.environment}</em>
                </span>
                <span>
                  <strong>{client.user_name || "Unbound"}</strong>
                  <small>{client.role}</small>
                </span>
                <span>
                  <strong>{client.capabilities.length}</strong>
                  <small>{client.capabilities.slice(0, 2).join(", ") || "No capabilities"}</small>
                </span>
                <span>
                  <strong>{formatDate(client.last_seen_at)}</strong>
                  <small>{client.last_request_id || "No request id"}</small>
                </span>
                <span>
                  <em className={`status-pill ${client.is_active ? "status-completed" : "status-failed"}`}>
                    {client.is_active ? "active" : "paused"}
                  </em>
                </span>
              </div>
            ))}
          </div>
        </section>

        <aside className="admin-detail-panel">
          <form className="admin-side-form" onSubmit={handleSave}>
            <div className="admin-detail-head">
              <h2>{editingReleaseId === null ? "Create release" : "Edit release"}</h2>
              <p>Production writes should only flow through approved QMDH official skill packs.</p>
            </div>

            <label className="composer-menu-field">
              <span>Release name</span>
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
              />
            </label>

            <label className="composer-menu-field">
              <span>Release key</span>
              <input
                value={draft.key}
                disabled={editingReleaseId !== null}
                onChange={(event) => setDraft((current) => ({ ...current, key: buildKey(event.target.value) }))}
              />
            </label>

            <div className="agent-release-grid">
              <label className="composer-menu-field">
                <span>Environment</span>
                <select
                  value={draft.environment}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, environment: event.target.value as "test" | "prod" }))
                  }
                >
                  <option value="test">test</option>
                  <option value="prod">prod</option>
                </select>
              </label>
              <label className="composer-menu-field">
                <span>OpenClaw version</span>
                <input
                  value={draft.openclaw_version}
                  onChange={(event) => setDraft((current) => ({ ...current, openclaw_version: event.target.value }))}
                />
              </label>
            </div>

            <label className="composer-menu-field">
              <span>Notes</span>
              <textarea
                className="agent-release-notes"
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                placeholder="What changed in this release and why is it safe to publish?"
              />
            </label>

            <label className="model-toggle">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))}
              />
              <span>Mark release as active immediately</span>
            </label>

            <div className="agent-skill-picker">
              <div className="agent-ops-section-head">
                <div>
                  <h3>Official skills</h3>
                  <p>Select the QMDH skills that will be shipped to this release.</p>
                </div>
                <span>{draft.skill_keys.length} selected</span>
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
                        <span>{skill.inputs.join(", ") || "No inputs"} → {skill.outputs.join(", ") || "No outputs"}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {error ? <div className="floating-error">{error}</div> : null}

            <div className="template-editor-actions">
              <button type="submit" className="submit-button" disabled={saving}>
                {saving ? "Saving..." : editingReleaseId === null ? "Create release" : "Save changes"}
              </button>
              {editingReleaseId !== null ? (
                <button type="button" className="ghost-button" onClick={resetDraft}>
                  Cancel editing
                </button>
              ) : null}
            </div>
          </form>
        </aside>
      </div>

      <section className="admin-table-panel">
        <div className="agent-ops-section-head">
          <div>
            <h2>Published releases</h2>
            <p>Production and test releases are the only approved bridges between OpenClaw and formal QMDH writes.</p>
          </div>
          <span>{activeReleases.length} active</span>
        </div>
        <div className="admin-data-table agent-release-table">
          <div className="admin-table-row admin-table-head">
            <span>Release</span>
            <span>Environment</span>
            <span>OpenClaw</span>
            <span>Skills</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>
          {releases.map((release) => (
            <div key={release.id} className="admin-table-row">
              <span>
                <strong>{release.display_name}</strong>
                <small>{release.key}</small>
              </span>
              <span>
                <em className="admin-tag">{release.environment}</em>
              </span>
              <span>
                <strong>{release.openclaw_version}</strong>
                <small>{release.is_active ? "active" : "inactive"}</small>
              </span>
              <span>
                <strong>{release.skill_keys.length}</strong>
                <small>{release.skill_keys.slice(0, 2).join(", ") || "No skills"}</small>
              </span>
              <span>
                <strong>{formatDate(release.updated_at)}</strong>
                <small>{release.created_by_user_name || "Unknown publisher"}</small>
              </span>
              <span className="admin-row-actions">
                <button type="button" onClick={() => handleEditRelease(release)}>
                  Edit
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
