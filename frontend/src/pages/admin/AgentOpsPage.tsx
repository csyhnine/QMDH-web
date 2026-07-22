import { type FormEvent, useEffect, useMemo, useState } from "react";

import AgentOpsChatObservabilityPanel from "./AgentOpsChatObservabilityPanel";
import AgentPolicyOverridesPanel from "./AgentPolicyOverridesPanel";
import {
  api,
  type AgentChatToolRecord,
  type AgentClientRecord,
  type AgentOfficialSkill,
  type AgentSkillInstallCandidate,
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
  chatTools?: AgentChatToolRecord[];
  releases: AgentSkillReleaseRecord[];
  error: string;
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

export default function AgentOpsPage({
  clients,
  skills,
  chatTools = [],
  releases,
  error,
  onRefresh,
  onSetError,
}: AgentOpsPageProps) {
  const [draft, setDraft] = useState<ReleaseDraft>(defaultDraft);
  const [editingReleaseId, setEditingReleaseId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [policyDefaults, setPolicyDefaults] = useState<ChatAgentPolicyDefaultsRecord | null>(null);
  const [skillDraft, setSkillDraft] = useState({
    key: "",
    name: "",
    version: "0.1.0",
    description: "",
    author: "",
    inputs: "",
    outputs: "",
    notes: "",
    is_active: true,
  });
  const [skillSaving, setSkillSaving] = useState(false);
  const [skillStatusFilter, setSkillStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [togglingSkillKey, setTogglingSkillKey] = useState<string | null>(null);
  const [installSource, setInstallSource] = useState("");
  const [installOverwrite, setInstallOverwrite] = useState(false);
  const [installSaving, setInstallSaving] = useState(false);
  const [installCandidates, setInstallCandidates] = useState<AgentSkillInstallCandidate[]>([]);
  const [expandedSkillKey, setExpandedSkillKey] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showManualCreate, setShowManualCreate] = useState(false);

  const enabledSkills = useMemo(() => skills.filter((skill) => skill.is_active !== false), [skills]);
  const filteredSkills = useMemo(() => {
    if (skillStatusFilter === "enabled") {
      return skills.filter((skill) => skill.is_active !== false);
    }
    if (skillStatusFilter === "disabled") {
      return skills.filter((skill) => skill.is_active === false);
    }
    return skills;
  }, [skills, skillStatusFilter]);

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
      onSetError("请填写配置名称");
      return;
    }
    if (!payload.key) {
      onSetError("请填写配置 Key");
      return;
    }
    if (payload.chat_tool_allowlist.length === 0) {
      onSetError("请至少选择一个 Chat 工具");
      return;
    }
    // OpenClaw skills follow Skill 配置启停，保存时带上当前已启用列表
    payload.skill_keys = enabledSkills.map((skill) => skill.key);

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
      onSetError(err instanceof Error ? err.message : "保存配置失败");
    } finally {
      setSaving(false);
    }
  }

  async function runInstallSkill(skillKey?: string) {
    const source = installSource.trim();
    if (!source) {
      onSetError("请粘贴 GitHub 链接或 npx skills add 命令");
      return;
    }
    setInstallSaving(true);
    try {
      const result = await api.installOfficialSkill({
        source,
        skill_key: skillKey,
        overwrite: installOverwrite,
      });
      if (result.status === "needs_selection") {
        setInstallCandidates(result.candidates ?? []);
        onSetError("");
        return;
      }
      setInstallCandidates([]);
      setInstallSource("");
      setExpandedSkillKey(result.skill?.key ?? null);
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "安装 Skill 失败");
    } finally {
      setInstallSaving(false);
    }
  }

  async function handleInstallSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runInstallSkill();
  }

  async function handlePreviewSkillFile(skillKey: string, filePath: string) {
    setPreviewLoading(true);
    setPreviewPath(`${skillKey}:${filePath}`);
    try {
      const file = await api.officialSkillFile(skillKey, filePath);
      setPreviewContent(file.content ?? `（${file.kind}，无法预览文本）`);
    } catch (err) {
      setPreviewContent(err instanceof Error ? err.message : "预览失败");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleCreateSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = skillDraft.name.trim();
    const key = (skillDraft.key.trim() || buildKey(name)).slice(0, 100);
    if (!name || !key) {
      onSetError("请填写 Skill 名称与 Key");
      return;
    }
    setSkillSaving(true);
    try {
      await api.createOfficialSkill({
        key,
        name,
        version: skillDraft.version.trim() || "0.1.0",
        description: skillDraft.description.trim(),
        author: skillDraft.author.trim(),
        inputs: skillDraft.inputs
          .split(/[,，\n]/)
          .map((item) => item.trim())
          .filter(Boolean),
        outputs: skillDraft.outputs
          .split(/[,，\n]/)
          .map((item) => item.trim())
          .filter(Boolean),
        notes: skillDraft.notes.trim(),
        is_active: skillDraft.is_active,
      });
      setSkillDraft({
        key: "",
        name: "",
        version: "0.1.0",
        description: "",
        author: "",
        inputs: "",
        outputs: "",
        notes: "",
        is_active: true,
      });
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "添加 Skill 失败");
    } finally {
      setSkillSaving(false);
    }
  }

  async function handleToggleSkill(skill: AgentOfficialSkill) {
    const nextActive = skill.is_active === false;
    setTogglingSkillKey(skill.key);
    try {
      await api.updateOfficialSkill(skill.key, { is_active: nextActive });
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : nextActive ? "启用 Skill 失败" : "停用 Skill 失败");
    } finally {
      setTogglingSkillKey(null);
    }
  }

  async function handleDeleteSkill(skillKey: string) {
    if (!window.confirm(`确认删除自定义 Skill「${skillKey}」？`)) {
      return;
    }
    try {
      await api.deleteOfficialSkill(skillKey);
      setDraft((current) => ({
        ...current,
        skill_keys: current.skill_keys.filter((item) => item !== skillKey),
      }));
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "删除 Skill 失败");
    }
  }

  return (
    <section className="admin-page agent-ops-page">
      <header className="admin-page-head">
        <div>
          <h1>助手能力管理</h1>
          <p>
            入口：管理后台左侧「助手能力」。本页分两块——上方「Web Chat 策略」控制设计师网页对话能调哪些工具（含生图提案）；
            下方「本机 OpenClaw Skill」只给桌面端客户端用，不会让网页 Chat 直接生图。
          </p>
        </div>
        <div className="admin-head-actions">
          {activeProdRelease ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                handleEditRelease(activeProdRelease);
                window.requestAnimationFrame(() => {
                  document.getElementById("chat-policy-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
            >
              编辑 Web Chat 策略
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={startNewProdRelease}>
            新建 Chat 策略版本
          </button>
          <button type="button" className="admin-primary-button" onClick={onRefresh}>
            刷新
          </button>
        </div>
      </header>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card admin-blue">
          <div>
            <span>本机 OpenClaw 设备</span>
            <strong>{clients.length}</strong>
            <small>已注册桌面端客户端</small>
          </div>
          <i>AG</i>
        </article>
        <article className="admin-kpi-card admin-green">
          <div>
            <span>本机在线</span>
            <strong>{onlineClients.length}</strong>
            <small>近 10 分钟内有心跳</small>
          </div>
          <i>ON</i>
        </article>
        <article className="admin-kpi-card admin-orange">
          <div>
            <span>Web Chat 策略版本</span>
            <strong>{prodReleases.length}</strong>
            <small>生产环境对网页设计师生效</small>
          </div>
          <i>PR</i>
        </article>
        <article className="admin-kpi-card admin-purple">
          <div>
            <span>已启用 Skill</span>
            <strong>{enabledSkills.length}</strong>
            <small>多为本机端；含 SKILL.md 的才注入 Chat</small>
          </div>
          <i>SK</i>
        </article>
      </div>

      <section className="admin-table-panel agent-designer-config-live" id="chat-policy-live">
        <div className="agent-ops-section-head">
          <div>
            <h2>Web Chat 策略（网页设计师）</h2>
            <p>
              这里决定网页 Chat「设计助手」能用哪些工具。要生图/改图/视频，请勾选「创建生图/改图/视频任务」，不是开下面的本机 Skill。
            </p>
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
                Web Chat 工具 {activeChatToolLabels.length} 项 · 本机 Skill 同步 {activeProdRelease.skill_keys.length} 项
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
            <button
              type="button"
              className="admin-primary-button"
              onClick={() => {
                handleEditRelease(activeProdRelease);
                window.requestAnimationFrame(() => {
                  document.getElementById("chat-policy-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
            >
              编辑 Web Chat 策略
            </button>
          </div>
        ) : (
          <div className="agent-designer-config-live-empty">
            <p>还没有生产环境 Web Chat 策略。请新建并勾选 Chat 工具（含创建生图等）。</p>
            <button type="button" className="admin-primary-button" onClick={startNewProdRelease}>
              新建 Web Chat 策略
            </button>
          </div>
        )}
      </section>

      <section className="admin-table-panel agent-skill-catalog-panel">
        <div className="agent-ops-section-head">
          <div>
            <h2>本机 OpenClaw Skill</h2>
            <p>
              给桌面端 OpenClaw 用。内置「生图/改图/保存…」标了「本机端」——启用后<strong>不会</strong>让网页 Chat 能生图。
              从 GitHub 安装且含 SKILL.md 的包才会注入网页 Chat 提示词；网页真正开跑任务仍靠上方「Web Chat 策略」里的创建任务工具。
            </p>
          </div>
          <span>
            启用 {enabledSkills.length} / 共 {skills.length}
          </span>
        </div>

        <div className="agent-skill-catalog-layout">
          <div className="admin-side-form agent-skill-catalog-form">
            <form onSubmit={(event) => void handleInstallSkill(event)}>
              <h3>从 GitHub 安装</h3>
              <label className="composer-menu-field">
                <span>安装源</span>
                <textarea
                  value={installSource}
                  onChange={(event) => setInstallSource(event.target.value)}
                  placeholder={"npx skills add https://github.com/owner/repo --skill my-skill\n或 https://github.com/owner/repo"}
                  rows={4}
                  required
                />
              </label>
              <label className="model-toggle">
                <input
                  type="checkbox"
                  checked={installOverwrite}
                  onChange={(event) => setInstallOverwrite(event.target.checked)}
                />
                <span>同名 Key 时覆盖更新</span>
              </label>
              <button type="submit" className="admin-primary-button" disabled={installSaving}>
                {installSaving ? "安装中…" : "安装 Skill"}
              </button>
            </form>

            {installCandidates.length > 0 ? (
              <div className="agent-skill-install-candidates">
                <h4>仓库含多个 Skill，请选择一项</h4>
                <ul>
                  {installCandidates.map((candidate) => (
                    <li key={`${candidate.path}-${candidate.key}`}>
                      <div>
                        <strong>{candidate.name}</strong>
                        <small>
                          {candidate.key} · {candidate.path} · {candidate.file_count} 文件
                          {candidate.has_scripts ? " · 含 scripts" : ""}
                        </small>
                        {candidate.description ? <p>{candidate.description}</p> : null}
                      </div>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={installSaving}
                        onClick={() => void runInstallSkill(candidate.key)}
                      >
                        安装此项
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <details
              className="agent-skill-manual-create"
              open={showManualCreate}
              onToggle={(event) => setShowManualCreate((event.target as HTMLDetailsElement).open)}
            >
              <summary>手动新建（元数据）</summary>
              <form onSubmit={(event) => void handleCreateSkill(event)}>
                <label className="composer-menu-field">
                  <span>名称</span>
                  <input
                    value={skillDraft.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      setSkillDraft((current) => ({
                        ...current,
                        name,
                        key: current.key || buildKey(name),
                      }));
                    }}
                    placeholder="例如：院内生图封装"
                    required
                  />
                </label>
                <label className="composer-menu-field">
                  <span>Key</span>
                  <input
                    value={skillDraft.key}
                    onChange={(event) => setSkillDraft((current) => ({ ...current, key: buildKey(event.target.value) }))}
                    placeholder="qmdh-custom-skill"
                    required
                  />
                </label>
                <label className="composer-menu-field">
                  <span>说明</span>
                  <textarea
                    value={skillDraft.description}
                    onChange={(event) => setSkillDraft((current) => ({ ...current, description: event.target.value }))}
                    placeholder="能力说明"
                  />
                </label>
                <label className="model-toggle">
                  <input
                    type="checkbox"
                    checked={skillDraft.is_active}
                    onChange={(event) => setSkillDraft((current) => ({ ...current, is_active: event.target.checked }))}
                  />
                  <span>创建后立即启用</span>
                </label>
                <button type="submit" className="ghost-button" disabled={skillSaving}>
                  {skillSaving ? "保存中…" : "保存元数据 Skill"}
                </button>
              </form>
            </details>
          </div>

          <div>
            <div className="admin-toolbar model-toolbar">
              <div className="model-toolbar-grid">
                <select
                  aria-label="Skill 状态"
                  value={skillStatusFilter}
                  onChange={(event) => setSkillStatusFilter(event.target.value as "all" | "enabled" | "disabled")}
                >
                  <option value="all">全部状态</option>
                  <option value="enabled">启用</option>
                  <option value="disabled">停用</option>
                </select>
                <button type="button" onClick={onRefresh}>
                  刷新
                </button>
              </div>
            </div>
            <div className="admin-data-table agent-skill-table">
              <div className="admin-table-row admin-table-head">
                <span>Skill</span>
                <span>适用端</span>
                <span>来源</span>
                <span>状态</span>
                <span>操作</span>
              </div>
              {filteredSkills.length > 0 ? (
                filteredSkills.map((skill) => {
                  const active = skill.is_active !== false;
                  const expanded = expandedSkillKey === skill.key;
                  const runtime = skill.runtime || (skill.has_skill_md ? "chat" : "openclaw");
                  const runtimeLabel =
                    runtime === "chat" ? "Web Chat 注入" : runtime === "both" ? "本机 + Chat" : "本机 OpenClaw";
                  return (
                    <div key={skill.key} className="admin-table-row agent-skill-table-row">
                      <span>
                        <strong>{skill.name}</strong>
                        <small>
                          {skill.key} · v{skill.version}
                          {skill.file_count ? ` · ${skill.file_count} 文件` : ""}
                          {skill.has_scripts ? " · scripts(不执行)" : ""}
                        </small>
                        {skill.description ? <small>{skill.description}</small> : null}
                        {expanded && (skill.file_manifest?.length ?? 0) > 0 ? (
                          <div className="agent-skill-file-manifest">
                            {(skill.file_manifest ?? []).map((file) => (
                              <button
                                key={file.path}
                                type="button"
                                className="ghost-button"
                                onClick={() => void handlePreviewSkillFile(skill.key, file.path)}
                              >
                                {file.path}
                              </button>
                            ))}
                            {previewPath?.startsWith(`${skill.key}:`) ? (
                              <pre className="agent-skill-file-preview">
                                {previewLoading ? "加载中…" : previewContent}
                              </pre>
                            ) : null}
                          </div>
                        ) : null}
                      </span>
                      <span>
                        <em className={`status-pill ${runtime === "openclaw" ? "status-failed" : "status-completed"}`}>
                          {runtimeLabel}
                        </em>
                      </span>
                      <span>
                        {skill.source_repo ? skill.source_repo : skill.source === "custom" ? "自定义" : "内置"}
                      </span>
                      <span>
                        <em className={`status-pill ${active ? "status-completed" : "status-failed"}`}>
                          {active ? "启用" : "停用"}
                        </em>
                      </span>
                      <span className="admin-row-actions">
                        {(skill.file_manifest?.length ?? 0) > 0 || skill.has_skill_md ? (
                          <button
                            type="button"
                            onClick={() => setExpandedSkillKey(expanded ? null : skill.key)}
                          >
                            {expanded ? "收起" : "文件"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={togglingSkillKey === skill.key}
                          onClick={() => void handleToggleSkill(skill)}
                        >
                          {togglingSkillKey === skill.key ? "处理中…" : active ? "停用" : "启用"}
                        </button>
                        {skill.deletable ? (
                          <button type="button" onClick={() => void handleDeleteSkill(skill.key)}>
                            删除
                          </button>
                        ) : null}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="template-empty">当前筛选下没有 Skill。</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="admin-table-panel agent-designer-config-editor" id="chat-policy-editor">
        <form className="admin-side-form agent-designer-config-form" onSubmit={handleSave}>
          <div className="admin-detail-head">
            <h2>{editingReleaseId === null ? "新建 Web Chat 策略" : "编辑 Web Chat 策略"}</h2>
            <p>
              只改网页设计师 Chat 助手的工具白名单与行为说明。本机 OpenClaw Skill 请在上方列表启停，与这里的「创建生图任务」不是同一套开关。
            </p>
            <small>环境选「生产」并勾选启用后，对网页 Chat 设计师生效。</small>
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
                <h3>Web Chat 工具白名单</h3>
                <p>
                  勾选后网页 Chat 助手模式可调用。生图/改图/视频请勾「创建…任务」（创建后立即入队），不是开本机 Skill。
                </p>
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
                const isWriteTool = tool.key.startsWith("create_") || tool.key.startsWith("propose_");
                return (
                  <label key={tool.key} className={checked ? "agent-skill-card selected" : "agent-skill-card"}>
                    <input type="checkbox" checked={checked} onChange={() => toggleChatTool(tool.key)} />
                    <div>
                      <strong>
                        {tool.label}
                        {isWriteTool ? " · Web Chat" : ""}
                      </strong>
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
                <h3>本机 OpenClaw Skills（只读同步）</h3>
                <p>由上方「本机 OpenClaw Skill」启停决定，保存策略时自动写入当前启用列表；不单独控制网页生图。</p>
              </div>
              <span>当前启用 {enabledSkills.length} 项</span>
            </div>
            <div className="agent-policy-preview-tools">
              {enabledSkills.length > 0 ? (
                enabledSkills.map((skill) => (
                  <span key={skill.key} className="chat-agent-tool-chip">
                    {skill.name}
                  </span>
                ))
              ) : (
                <span className="agent-policy-note">尚无启用的 Skill，请到「Skill 配置」启用。</span>
              )}
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
                <h3>保存后预览</h3>
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
              {saving ? "保存中..." : editingReleaseId === null ? "保存配置" : "更新配置"}
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
          <small>大多数场景只需编辑上方 Chat 配置。仅当某组或某人需要禁用部分 tool 时使用。</small>
        </summary>
        <AgentPolicyOverridesPanel chatTools={chatTools} onSetError={onSetError} />


        <AgentOpsChatObservabilityPanel onSetError={onSetError} />
      </details>

      <section className="admin-table-panel">
        <div className="agent-ops-section-head">
          <div>
            <h2>能力版本历史</h2>
            <p>每次保存产生一个版本；生产环境且已启用的版本即当前默认 Chat 配置。</p>
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
            <p>桌面客户端设备列表；Skills 由上方「Skill 配置」的启用状态统一下发。</p>
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
