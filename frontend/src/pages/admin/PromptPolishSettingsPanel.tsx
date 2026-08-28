import { useEffect, useMemo, useState } from "react";

import { api, type PlatformSettingsRecord, type ProviderProfileRecord } from "../../api";

type PromptPolishSettingsPanelProps = {
  settings: PlatformSettingsRecord | null;
  providerProfiles: ProviderProfileRecord[];
  onRefresh: () => Promise<void>;
};

export default function PromptPolishSettingsPanel({
  settings,
  providerProfiles,
  onRefresh,
}: PromptPolishSettingsPanelProps) {
  const chatProviders = useMemo(
    () =>
      providerProfiles.filter(
        (profile) => profile.enabled && profile.capabilities.includes("chat.completions")
      ),
    [providerProfiles]
  );

  const [enabled, setEnabled] = useState(settings?.prompt_polish_enabled ?? false);
  const [providerId, setProviderId] = useState<string>(
    settings?.prompt_polish_provider_id ? String(settings.prompt_polish_provider_id) : ""
  );
  const [systemPrompt, setSystemPrompt] = useState(settings?.prompt_polish_system_prompt ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const selectedProvider = chatProviders.find((profile) => String(profile.id) === providerId) ?? null;

  useEffect(() => {
    setEnabled(settings?.prompt_polish_enabled ?? false);
    setProviderId(settings?.prompt_polish_provider_id ? String(settings.prompt_polish_provider_id) : "");
    setSystemPrompt(settings?.prompt_polish_system_prompt ?? "");
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    if (enabled && !providerId) {
      setFeedback({ tone: "error", message: "启用润色前请先选择 chat 模型。" });
      setSaving(false);
      return;
    }
    if (enabled && chatProviders.length === 0) {
      setFeedback({
        tone: "error",
        message: "当前没有可用的 chat.completions 模型，请先在「模型管理」接入并启用后再保存。",
      });
      setSaving(false);
      return;
    }
    try {
      await api.updatePlatformSettings({
        prompt_polish_enabled: enabled,
        prompt_polish_provider_id: providerId ? Number(providerId) : null,
        prompt_polish_system_prompt: systemPrompt.trim(),
      });
      await onRefresh();
      setFeedback({ tone: "success", message: "提示词润色配置已保存。" });
    } catch (err) {
      setFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "保存失败",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="admin-table-panel settings-switch-card">
      <div className="admin-detail-head">
        <h2>提示词润色</h2>
        <p>Studio 生成区「润色」按钮会调用专用 LLM，结合参考图与用户提示词输出优化文案。</p>
      </div>

      <div className="settings-switch-grid">
        <div className="settings-switch-row">
          <span>
            <strong>润色功能</strong>
            <small>关闭后设计师看不到润色按钮。</small>
          </span>
          <label className="settings-inline-toggle">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span>{enabled ? "启用" : "停用"}</span>
          </label>
        </div>
      </div>

      <div className="settings-field-grid">
        <label className="composer-menu-field">
          <span>润色模型</span>
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="">请选择 chat 模型</option>
            {chatProviders.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_name || profile.model_name} ({profile.provider_name})
              </option>
            ))}
          </select>
          <small>需具备 chat.completions；若支持视觉，将同时读取参考图。</small>
        </label>

        <label className="composer-menu-field settings-field-span-2">
          <span>系统提示词</span>
          <textarea
            rows={10}
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder="留空则使用内置默认润色指令。"
          />
        </label>
      </div>

      {selectedProvider ? (
        <p className="settings-feature-toggle-meta">
          当前模型：{selectedProvider.display_name || selectedProvider.model_name} / {selectedProvider.model_name}
        </p>
      ) : (
        <p className="settings-feature-toggle-meta">
          启用前请先选择润色模型。若下拉为空，请先到「模型管理」添加并启用支持 chat.completions 的 Provider。
        </p>
      )}

      <div className="settings-feature-toggle-actions">
        <button type="button" className="admin-primary-button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? "保存中..." : "保存配置"}
        </button>
      </div>

      {feedback ? (
        <div className={feedback.tone === "success" ? "floating-success" : "floating-error"}>{feedback.message}</div>
      ) : null}
    </article>
  );
}
