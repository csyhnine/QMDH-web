import { type FormEvent, useEffect, useState } from "react";

import {
  api,
  type ProviderProfileCreatePayload,
  type ProviderProfileRecord,
} from "../../api";
import { BIGJPG_DEFAULT_BASE_URL, BIGJPG_DOCS_URL, BIGJPG_PROVIDER_NAME } from "./settingsIntegrationConstants";

type BigjpgIntegrationPanelProps = {
  profile: ProviderProfileRecord | undefined;
  onRefresh: () => Promise<void>;
};

type BigjpgDraft = {
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
};

function toDraft(profile: ProviderProfileRecord | undefined): BigjpgDraft {
  return {
    baseUrl: profile?.base_url || BIGJPG_DEFAULT_BASE_URL,
    apiKey: "",
    enabled: profile?.enabled ?? true,
  };
}

function buildPayload(draft: BigjpgDraft): ProviderProfileCreatePayload {
  return {
    provider_name: BIGJPG_PROVIDER_NAME,
    display_name: "Bigjpg 高清放大",
    api_key: draft.apiKey,
    base_url: draft.baseUrl.trim(),
    model_name: "bigjpg",
    adapter_kind: "bigjpg",
    capabilities: ["image.upscale"],
    strategies: { "image.upscale": "bigjpg_upscale" },
    adapter_config: {},
    quality: "medium",
    output_format: "png",
    timeout_seconds: 600,
    pricing_currency: "CNY",
    pricing_unit: "per_request",
    unit_price: 0,
    enabled: draft.enabled,
    reference_mode: "disabled",
    reference_caption_model: null,
  };
}

export default function BigjpgIntegrationPanel({ profile, onRefresh }: BigjpgIntegrationPanelProps) {
  const [draft, setDraft] = useState<BigjpgDraft>(() => toDraft(profile));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    setDraft(toDraft(profile));
  }, [profile]);


  const hasProfile = Boolean(profile);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const baseUrl = draft.baseUrl.trim();
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      setFeedback({ tone: "error", message: "API 地址必须是有效的 http(s) URL。" });
      return;
    }

    if (!hasProfile && !draft.apiKey.trim()) {
      setFeedback({ tone: "error", message: "首次接入请填写 Bigjpg API Key。" });
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload(draft);
      if (hasProfile && profile) {
        await api.updateProviderProfile(profile.id, {
          display_name: payload.display_name,
          base_url: payload.base_url,
          model_name: payload.model_name,
          adapter_kind: payload.adapter_kind,
          capabilities: payload.capabilities,
          strategies: payload.strategies,
          adapter_config: payload.adapter_config,
          quality: payload.quality,
          output_format: payload.output_format,
          timeout_seconds: payload.timeout_seconds,
          pricing_currency: payload.pricing_currency,
          pricing_unit: payload.pricing_unit,
          unit_price: payload.unit_price,
          enabled: payload.enabled,
          reference_mode: payload.reference_mode,
          reference_caption_model: payload.reference_caption_model,
          ...(draft.apiKey.trim() ? { api_key: draft.apiKey.trim() } : {}),
        });
      } else {
        await api.createProviderProfile({ ...payload, api_key: draft.apiKey.trim() });
      }
      setDraft((current) => ({ ...current, apiKey: "" }));
      await onRefresh();
      setFeedback({ tone: "success", message: "Bigjpg 集成配置已保存，历史卡片「放大」将使用此连接。" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败，请稍后重试。";
      setFeedback({ tone: "error", message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-integration-panel">
      <article className="admin-table-panel settings-info-card">
        <div className="admin-detail-head">
          <h2>Bigjpg 高清放大</h2>
          <p>
            配置外部超分 API，供历史卡片「放大」按钮使用。密钥会加密保存在后台，不会明文展示。
          </p>
        </div>

        <form className="settings-field-grid" autoComplete="off" onSubmit={(event) => void handleSubmit(event)}>
          <label className="composer-menu-field composer-menu-field-full">
            <span>API 地址</span>
            <input
              value={draft.baseUrl}
              onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))}
              placeholder={BIGJPG_DEFAULT_BASE_URL}
              autoComplete="off"
            />
          </label>

          <label className="composer-menu-field composer-menu-field-full">
            <span>API Key</span>
            <input
              name="bigjpg-api-key"
              type="password"
              value={draft.apiKey}
              onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
              placeholder={hasProfile ? `已保存：${profile?.masked_api_key || "****"}，留空则不修改` : "粘贴 32 位密钥（仅密钥本身，不要带 X-API-KEY: 前缀）"}
              autoComplete="new-password"
            />
          </label>

          <label className="settings-integration-toggle composer-menu-field composer-menu-field-full">
            <span>
              <strong>启用集成</strong>
              <small>关闭后历史卡片将无法提交 Bigjpg 放大任务。</small>
            </span>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
            />
          </label>

          <div className="settings-integration-actions composer-menu-field-full">
            <button type="submit" className="admin-primary-button" disabled={saving}>
              {saving ? "保存中..." : hasProfile ? "更新配置" : "保存并接入"}
            </button>
            <a className="ghost-button settings-integration-link" href={BIGJPG_DOCS_URL} target="_blank" rel="noreferrer">
              打开 Bigjpg API 文档
            </a>
          </div>
        </form>

        {feedback ? (
          <div className={feedback.tone === "success" ? "floating-success" : "floating-error"}>{feedback.message}</div>
        ) : null}
      </article>

      <article className="admin-table-panel settings-switch-card">
        <div className="admin-detail-head">
          <h2>接入说明</h2>
          <p>保存后无需重启服务，任务执行时会自动读取最新配置。</p>
        </div>
        <ul className="settings-integration-notes">
          <li>免费版在 Bigjpg 网站可放大至 4x，但<strong> API 接口通常需付费套餐</strong>（基础版 ¥35 起）；若任务报 requires_vip，即属此类限制。</li>
          <li>免费账号 API 一般仅支持 2x / 4x 倍率；8x / 16x 需更高级套餐。</li>
          <li>放大任务需要原图具备公网可访问 URL，请确保生产环境已配置媒体外网地址（如 cityusbdisk.cn）。</li>
          <li>也可在「模型管理」中查看完整 Provider 记录；此处为集成快捷入口。</li>
        </ul>
      </article>
    </div>
  );
}

export function bigjpgIntegrationStatus(profile: ProviderProfileRecord | undefined): {
  label: string;
  tone: "ready" | "warning" | "idle";
  detail: string;
} {
  if (!profile) {
    return {
      label: "未接入",
      tone: "idle",
      detail: "尚未保存 Bigjpg API 配置。",
    };
  }
  if (!profile.has_api_key) {
    return {
      label: "待补全",
      tone: "warning",
      detail: "已创建配置但缺少有效 API Key。",
    };
  }
  if (!profile.enabled) {
    return {
      label: "已停用",
      tone: "warning",
      detail: "配置已保存，但当前处于禁用状态。",
    };
  }
  return {
    label: "已接入",
    tone: "ready",
    detail: `使用 ${profile.base_url}，历史卡片放大可用。`,
  };
}

export function isBigjpgProfile(profile: ProviderProfileRecord): boolean {
  return profile.provider_name === BIGJPG_PROVIDER_NAME || profile.adapter_kind === "bigjpg";
}
