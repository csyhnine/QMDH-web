import { useState } from "react";

import { api, type PlatformSettingsRecord } from "../../api";

type ChatAgentUiSettingsPanelProps = {
  settings: PlatformSettingsRecord | null;
  onRefresh: () => Promise<void>;
};

export default function ChatAgentUiSettingsPanel({ settings, onRefresh }: ChatAgentUiSettingsPanelProps) {
  const [toggling, setToggling] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const enabled = settings?.chat_agent_ui_enabled ?? false;

  async function handleToggle() {
    const nextEnabled = !enabled;
    setToggling(true);
    setFeedback(null);
    try {
      await api.updatePlatformSettings({ chat_agent_ui_enabled: nextEnabled });
      await onRefresh();
      setFeedback({
        tone: "success",
        message: nextEnabled ? "设计助手已对设计师开放。" : "设计助手已对设计师隐藏。",
      });
    } catch (err) {
      setFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : nextEnabled ? "启用失败" : "停用失败",
      });
    } finally {
      setToggling(false);
    }
  }

  return (
    <article className="admin-table-panel settings-switch-card">
      <div className="admin-detail-head">
        <h2>Chat 设计助手</h2>
        <p>控制 Studio 对话页「设计助手」开关与能力抽屉是否对设计师可见。无需重建前端。</p>
      </div>

      <div className="settings-switch-grid">
        <div className="settings-switch-row">
          <span>
            <strong>设计助手 UI</strong>
            <small>关闭后设计师看不到助手模式开关；后端 agent 能力仍保留。</small>
          </span>
          <em className={`status-pill ${enabled ? "status-completed" : "status-failed"}`}>
            {enabled ? "启用" : "停用"}
          </em>
        </div>
      </div>

      <div className="settings-feature-toggle-actions">
        <button type="button" className="admin-primary-button" onClick={() => void handleToggle()} disabled={toggling}>
          {toggling ? "处理中..." : enabled ? "停用" : "启用"}
        </button>
        {settings?.updated_at ? (
          <small className="settings-feature-toggle-meta">
            最近更新：{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(settings.updated_at))}
          </small>
        ) : null}
      </div>

      {feedback ? (
        <div className={feedback.tone === "success" ? "floating-success" : "floating-error"}>{feedback.message}</div>
      ) : null}
    </article>
  );
}
