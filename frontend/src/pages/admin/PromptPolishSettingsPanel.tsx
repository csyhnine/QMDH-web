import { useEffect, useMemo, useState } from "react";

import {
  api,
  type PlatformSettingsRecord,
  type PromptPolishModeLimitRecord,
  type PromptPolishModeLimitsRecord,
  type ProviderProfileRecord,
} from "../../api";

type PromptPolishSettingsPanelProps = {
  settings: PlatformSettingsRecord | null;
  providerProfiles: ProviderProfileRecord[];
  onRefresh: () => Promise<void>;
};

type ModePromptState = {
  generate: string;
  edit: string;
  video: string;
};

type ModeKey = keyof ModePromptState;

const MODE_PROMPT_LABELS: Record<ModeKey, string> = {
  generate: "文生图",
  edit: "图生图",
  video: "视频",
};

const EMPTY_LIMITS: PromptPolishModeLimitsRecord = {
  generate: { max_tokens: 500, max_output_chars: 320, length_multiplier: null },
  edit: {
    max_tokens: 420,
    max_output_chars: 500,
    length_multiplier: 1.5,
    compact_original_chars: 80,
    compact_output_chars: 120,
  },
  video: { max_tokens: 420, max_output_chars: 360, length_multiplier: 2 },
};

function readModePromptState(settings: PlatformSettingsRecord | null): ModePromptState {
  return {
    generate: settings?.prompt_polish_system_prompts?.generate ?? "",
    edit: settings?.prompt_polish_system_prompts?.edit ?? "",
    video: settings?.prompt_polish_system_prompts?.video ?? "",
  };
}

function readModeLimitState(settings: PlatformSettingsRecord | null): PromptPolishModeLimitsRecord {
  return settings?.prompt_polish_mode_limits ?? settings?.prompt_polish_default_mode_limits ?? EMPTY_LIMITS;
}

function formatMultiplier(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "" : String(value);
}

function parseMultiplier(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

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
  const [modePrompts, setModePrompts] = useState<ModePromptState>(() => readModePromptState(settings));
  const [modeLimits, setModeLimits] = useState<PromptPolishModeLimitsRecord>(() => readModeLimitState(settings));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const selectedProvider = chatProviders.find((profile) => String(profile.id) === providerId) ?? null;
  const builtinPrompts = settings?.prompt_polish_builtin_prompts ?? null;
  const defaultLimits = settings?.prompt_polish_default_mode_limits ?? EMPTY_LIMITS;

  useEffect(() => {
    setEnabled(settings?.prompt_polish_enabled ?? false);
    setProviderId(settings?.prompt_polish_provider_id ? String(settings.prompt_polish_provider_id) : "");
    setModePrompts(readModePromptState(settings));
    setModeLimits(readModeLimitState(settings));
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
        prompt_polish_system_prompts: {
          generate: modePrompts.generate.trim(),
          edit: modePrompts.edit.trim(),
          video: modePrompts.video.trim(),
        },
        prompt_polish_mode_limits: modeLimits,
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

  async function handleResetLimits() {
    setSaving(true);
    setFeedback(null);
    try {
      await api.updatePlatformSettings({ reset_prompt_polish_mode_limits: true });
      await onRefresh();
      setFeedback({ tone: "success", message: "润色长度限制已恢复默认。" });
    } catch (err) {
      setFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "恢复默认失败",
      });
    } finally {
      setSaving(false);
    }
  }

  function updateModePrompt(mode: ModeKey, value: string) {
    setModePrompts((current) => ({ ...current, [mode]: value }));
  }

  function updateModeLimit(mode: ModeKey, patch: Partial<PromptPolishModeLimitRecord>) {
    setModeLimits((current) => ({
      ...current,
      [mode]: { ...current[mode], ...patch },
    }));
  }

  function restoreModeLimits(mode: ModeKey) {
    setModeLimits((current) => ({
      ...current,
      [mode]: { ...defaultLimits[mode] },
    }));
  }

  return (
    <article className="admin-table-panel settings-switch-card">
      <div className="admin-detail-head">
        <h2>提示词润色</h2>
        <p>
          Studio / 画布「润色」会按当前创作模式调用对应提示词：文生图补全场景，图生图只写修改点并读取参考图，视频强调动作与镜头。
        </p>
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
          <small>需具备 chat.completions；图生图 / 视频润色建议选用支持视觉的模型。</small>
        </label>
      </div>

      <div className="prompt-polish-section-head">
        <div>
          <strong>润色长度与 Token 限制</strong>
          <small>保存后立即生效，无需重新部署。留空倍数表示不按原文长度缩放。</small>
        </div>
        <button type="button" className="ghost-button" onClick={() => void handleResetLimits()} disabled={saving}>
          恢复全部默认
        </button>
      </div>

      <div className="prompt-polish-mode-prompt-grid">
        {(Object.keys(MODE_PROMPT_LABELS) as ModeKey[]).map((mode) => (
          <section key={mode} className="prompt-polish-mode-prompt-card prompt-polish-limit-card">
            <div className="prompt-polish-mode-prompt-head">
              <strong>{MODE_PROMPT_LABELS[mode]} 限制</strong>
              <button type="button" className="ghost-button" onClick={() => restoreModeLimits(mode)}>
                恢复默认
              </button>
            </div>
            <label className="composer-menu-field">
              <span>max_tokens</span>
              <input
                type="number"
                min={16}
                max={4096}
                value={modeLimits[mode].max_tokens}
                onChange={(event) =>
                  updateModeLimit(mode, { max_tokens: parsePositiveInt(event.target.value, modeLimits[mode].max_tokens) })
                }
              />
              <small>模型输出 token 上限，过小会导致句子被截断。</small>
            </label>
            <label className="composer-menu-field">
              <span>结果字数上限</span>
              <input
                type="number"
                min={40}
                max={4000}
                value={modeLimits[mode].max_output_chars}
                onChange={(event) =>
                  updateModeLimit(mode, {
                    max_output_chars: parsePositiveInt(event.target.value, modeLimits[mode].max_output_chars),
                  })
                }
              />
              <small>润色结果的后处理硬上限（字符数）。</small>
            </label>
            <label className="composer-menu-field">
              <span>相对原文倍数</span>
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={formatMultiplier(modeLimits[mode].length_multiplier)}
                onChange={(event) => updateModeLimit(mode, { length_multiplier: parseMultiplier(event.target.value) })}
              />
              <small>例如 1.5 表示不超过原文 × 1.5；填 0 或留空表示关闭。</small>
            </label>
            {mode === "edit" ? (
              <>
                <label className="composer-menu-field">
                  <span>短文判定阈值</span>
                  <input
                    type="number"
                    min={0}
                    max={2000}
                    value={modeLimits.edit.compact_original_chars ?? 80}
                    onChange={(event) =>
                      updateModeLimit("edit", {
                        compact_original_chars: parsePositiveInt(event.target.value, 80),
                      })
                    }
                  />
                  <small>原文不超过该字数时，按「短文输出上限」控制。</small>
                </label>
                <label className="composer-menu-field">
                  <span>短文输出上限</span>
                  <input
                    type="number"
                    min={40}
                    max={4000}
                    value={modeLimits.edit.compact_output_chars ?? 120}
                    onChange={(event) =>
                      updateModeLimit("edit", {
                        compact_output_chars: parsePositiveInt(event.target.value, 120),
                      })
                    }
                  />
                </label>
              </>
            ) : null}
          </section>
        ))}
      </div>

      <div className="prompt-polish-mode-prompt-grid">
        {(Object.keys(MODE_PROMPT_LABELS) as ModeKey[]).map((mode) => (
          <section key={mode} className="prompt-polish-mode-prompt-card">
            <div className="prompt-polish-mode-prompt-head">
              <strong>{MODE_PROMPT_LABELS[mode]} 润色提示词</strong>
              <small>{modePrompts[mode].trim() ? "已自定义" : "使用内置默认"}</small>
            </div>
            <textarea
              rows={8}
              value={modePrompts[mode]}
              onChange={(event) => updateModePrompt(mode, event.target.value)}
              placeholder={`留空则使用「${MODE_PROMPT_LABELS[mode]}」内置默认润色指令。`}
            />
            {builtinPrompts ? (
              <details className="prompt-polish-builtin-details">
                <summary>查看内置默认</summary>
                <pre>{builtinPrompts[mode]}</pre>
              </details>
            ) : null}
          </section>
        ))}
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
