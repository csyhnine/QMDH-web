import { type FormEvent, useEffect, useState } from "react";
import {
  api,
  type DiscoveredModel,
  type Provider,
  type ProviderBulkImportItem,
  type ProviderPricingRuleCreatePayload,
  type ProviderPricingRuleRecord,
  type ProviderProfileCreatePayload,
  type ProviderProfileProbeResult,
  type ProviderProfileRecord,
} from "../../api";

/* ─── Types ─── */

type ProviderProfileDraft = {
  providerName: string;
  displayName: string;
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  modelName: string;
  adapterKind: string;
  capabilities: string;
  strategies: string;
  adapterConfig: string;
  quality: string;
  outputFormat: string;
  timeoutSeconds: number;
  pricingCurrency: string;
  pricingUnit: string;
  unitPrice: number;
  enabled: boolean;
  referenceMode: string;
  referenceCaptionModel: string;
};

type ProviderPricingRuleDraft = {
  providerProfileId: string;
  capability: string;
  metric: string;
  unitSize: string;
  unitPrice: string;
  currency: string;
  isActive: boolean;
};

type DiscoveredModelAssignment = {
  generate: boolean;
  edit: boolean;
  chat: boolean;
};

type ModelFilterState = {
  search: string;
  capability: string;
  adapterKind: string;
  status: "all" | "enabled" | "disabled";
};

type SupportLevel = "ready" | "partial" | "planned";

type CapabilityDefinition = {
  key: string;
  label: string;
  description: string;
  support: SupportLevel;
};

type AdapterOption = {
  key: string;
  label: string;
  support: SupportLevel;
  note: string;
};


/* ─── Constants ─── */

const defaultProviderProfileDraft: ProviderProfileDraft = {
  providerName: "",
  displayName: "",
  apiKey: "",
  apiSecret: "",
  baseUrl: "",
  modelName: "",
  adapterKind: "openai_compatible",
  capabilities: "image.generate",
  strategies: "",
  adapterConfig: "",
  quality: "medium",
  outputFormat: "png",
  timeoutSeconds: 300,
  pricingCurrency: "CNY",
  pricingUnit: "per_image",
  unitPrice: 0,
  enabled: true,
  referenceMode: "disabled",
  referenceCaptionModel: "",
};

const defaultPricingRuleDraft: ProviderPricingRuleDraft = {
  providerProfileId: "",
  capability: "chat.completions",
  metric: "input_tokens",
  unitSize: "1000000",
  unitPrice: "0",
  currency: "USD",
  isActive: true,
};

const capabilityDefinitions: CapabilityDefinition[] = [
  { key: "chat.completions", label: "Chat", description: "分配到 Chat 页面", support: "ready" },
  { key: "image.generate", label: "生成页", description: "分配到图像生成页面", support: "ready" },
  { key: "image.edit", label: "图像编辑", description: "保留图像编辑能力", support: "ready" },
  { key: "video.generate", label: "视频生成", description: "用于 Kling / 即梦 / Seedance 等视频链路", support: "partial" },
];

const adapterOptions: AdapterOption[] = [
  { key: "haodeya_grok", label: "Grok 视频", support: "partial", note: "单条 profile 即可；model_name 可用 grok-imagine-video，四档 SKU 在 Studio 视频模式内切换。" },
  { key: "volcengine_ark", label: "Volcengine Ark Video", support: "partial", note: "Supports Seedance / Ark content generation tasks; probe will not create a live video." },
  { key: "openai_compatible", label: "OpenAI Compatible", support: "ready", note: "当前后端已支持这一适配器的 Chat、图像生成和图像编辑。" },
  { key: "dashscope_native", label: "DashScope Video", support: "partial", note: "支持 Wan / HappyHorse 的 DashScope 异步视频任务；探测不会创建真实视频。" },
  { key: "anthropic_native", label: "Anthropic Native", support: "planned", note: "可以先保存配置，但后端还没有 Claude 原生 adapter。" },
  { key: "kling_native", label: "Kling Native", support: "partial", note: "适合快手 Kling 系列；当前仅保留配置结构，视频执行 adapter 待补。" },
  { key: "jimeng_native", label: "Jimeng CV Native", support: "partial", note: "Supports Volcengine CV signed video tasks; probe will not create a live video." },
  { key: "custom_http", label: "Custom HTTP", support: "planned", note: "用于后续接入非标准厂商接口，当前前后端都还没有通用执行器。" },
];


/* ─── Helpers ─── */

function percentOf(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function parseCapabilities(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function formatCapabilities(value: string[]): string {
  return value.join(", ");
}

function hasCapability(value: string, capability: string): boolean {
  return parseCapabilities(value).includes(capability);
}

function toggleCapability(value: string, capability: string, enabled: boolean): string {
  const caps = parseCapabilities(value);
  if (enabled && !caps.includes(capability)) caps.push(capability);
  if (!enabled) return formatCapabilities(caps.filter((c) => c !== capability));
  return formatCapabilities(caps);
}

function supportLevelLabel(level: SupportLevel): string {
  if (level === "ready") return "可用";
  if (level === "partial") return "部分";
  return "规划中";
}

function getAdapterOption(adapterKind: string): AdapterOption {
  return adapterOptions.find((o) => o.key === adapterKind) ?? adapterOptions[0];
}

function getCapabilityDefinition(capability: string): CapabilityDefinition {
  return capabilityDefinitions.find((d) => d.key === capability) ?? { key: capability, label: capability, description: "", support: "planned" as SupportLevel };
}

function summarizeProfileSupport(adapterKind: string, capabilities: string[]): SupportLevel {
  const adapter = getAdapterOption(adapterKind);
  if (adapter.support === "planned") return "planned";
  const hasUnsupported = capabilities.some((c) => {
    const def = getCapabilityDefinition(c);
    return def.support !== "ready";
  });
  if (hasUnsupported || adapter.support === "partial") return "partial";
  return "ready";
}

function toProviderProfileDraft(profile: ProviderProfileRecord): ProviderProfileDraft {
  return {
    providerName: profile.provider_name,
    displayName: profile.display_name || profile.model_name,
    apiKey: "",
    apiSecret: "",
    baseUrl: profile.base_url,
    modelName: profile.model_name,
    adapterKind: profile.adapter_kind,
    capabilities: profile.capabilities.join(", "),
    strategies: JSON.stringify(profile.strategies ?? {}, null, 2),
    adapterConfig: JSON.stringify(profile.adapter_config ?? {}, null, 2),
    quality: profile.quality ?? "medium",
    outputFormat: profile.output_format ?? "png",
    timeoutSeconds: profile.timeout_seconds ?? 300,
    pricingCurrency: profile.pricing_currency ?? "CNY",
    pricingUnit: profile.pricing_unit ?? "per_image",
    unitPrice: profile.unit_price ?? 0,
    enabled: profile.enabled,
    referenceMode: profile.reference_mode ?? "disabled",
    referenceCaptionModel: profile.reference_caption_model ?? "",
  };
}

function toProviderProfilePayload(draft: ProviderProfileDraft): ProviderProfileCreatePayload {
  let strategies: Record<string, string> = {};
  let adapterConfig: Record<string, unknown> = {};
  const rawStrategies = draft.strategies.trim();
  if (rawStrategies) strategies = JSON.parse(rawStrategies) as Record<string, string>;
  const rawAdapterConfig = draft.adapterConfig.trim();
  if (rawAdapterConfig) adapterConfig = JSON.parse(rawAdapterConfig) as Record<string, unknown>;
  return {
    provider_name: draft.providerName.trim(),
    display_name: draft.displayName.trim(),
    api_key: draft.apiKey,
    api_secret: draft.apiSecret,
    base_url: draft.baseUrl.trim(),
    model_name: draft.modelName.trim(),
    adapter_kind: draft.adapterKind,
    capabilities: parseCapabilities(draft.capabilities),
    strategies,
    adapter_config: adapterConfig,
    quality: draft.quality || "medium",
    output_format: draft.outputFormat || "png",
    timeout_seconds: draft.timeoutSeconds || 300,
    pricing_currency: draft.pricingCurrency || "CNY",
    pricing_unit: draft.pricingUnit || "per_image",
    unit_price: draft.unitPrice || 0,
    enabled: draft.enabled,
    reference_mode: draft.referenceMode || "disabled",
    reference_caption_model: draft.referenceCaptionModel || "",
  };
}

function modelLooksLikeImageGeneration(modelId: string, ownedBy: string, baseUrl: string): boolean {
  const lower = modelId.toLowerCase();
  const ownerLower = ownedBy.toLowerCase();
  if (lower.includes("flux") || lower.includes("image") || lower.includes("dall")) return true;
  if (ownerLower.includes("black-forest") || ownerLower.includes("stabilityai")) return true;
  if (baseUrl.includes("modelscope.cn") && (lower.includes("wanx") || lower.includes("cogview"))) return true;
  return false;
}

function modelLooksLikeImageEdit(modelId: string, ownedBy: string): boolean {
  const lower = modelId.toLowerCase();
  const ownerLower = ownedBy.toLowerCase();
  return (
    lower.includes("image-edit") ||
    lower.includes("img-edit") ||
    lower.includes("inpaint") ||
    lower.includes("outpaint") ||
    lower.includes("img2img") ||
    (lower.includes("edit") && lower.includes("image")) ||
    ownerLower.includes("edit")
  );
}

function guessDiscoveredModelAssignment(modelId: string, ownedBy: string, baseUrl: string): DiscoveredModelAssignment {
  if (modelLooksLikeImageEdit(modelId, ownedBy)) return { generate: false, edit: true, chat: false };
  if (modelLooksLikeImageGeneration(modelId, ownedBy, baseUrl)) return { generate: true, edit: false, chat: false };
  return { generate: false, edit: false, chat: true };
}

function assignmentToCapabilities(modelId: string, ownedBy: string, assignment: DiscoveredModelAssignment): string[] {
  const caps: string[] = [];
  if (assignment.generate) caps.push("image.generate");
  if (assignment.edit) caps.push("image.edit");
  if (assignment.chat) caps.push("chat.completions");
  if (caps.length === 0) {
    const guess = guessDiscoveredModelAssignment(modelId, ownedBy, "");
    if (guess.generate) caps.push("image.generate");
    if (guess.edit) caps.push("image.edit");
    if (guess.chat) caps.push("chat.completions");
  }
  return caps;
}

function assignmentLabel(assignment: DiscoveredModelAssignment): string {
  const parts: string[] = [];
  if (assignment.generate) parts.push("生成页");
  if (assignment.edit) parts.push("图像编辑");
  if (assignment.chat) parts.push("Chat");
  return parts.length > 0 ? parts.join(" + ") : "未分配";
}

function formatPricingUnitLabel(unit: string): string {
  if (unit === "per_image") return "按张图片";
  if (unit === "per_video") return "按条视频";
  if (unit === "per_request") return "按次请求";
  return unit || "未设置";
}

function formatPricingMetricLabel(metric: string): string {
  if (metric === "input_tokens") return "输入 tokens";
  if (metric === "output_tokens") return "输出 tokens";
  if (metric === "cached_input_tokens") return "缓存命中 tokens";
  if (metric === "per_image") return "按张图片";
  if (metric === "per_video") return "按条视频";
  if (metric === "per_request") return "按次请求";
  return metric;
}

/* ─── Props ─── */

export type ModelsPageProps = {
  providerProfiles: ProviderProfileRecord[];
  pricingRules: ProviderPricingRuleRecord[];
  providers: Provider[];
  error: string;
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

/* ─── Component ─── */

function toPricingRuleDraft(rule: ProviderPricingRuleRecord): ProviderPricingRuleDraft {
  return {
    providerProfileId: String(rule.provider_profile_id),
    capability: rule.capability,
    metric: rule.metric,
    unitSize: String(rule.unit_size),
    unitPrice: String(rule.unit_price),
    currency: rule.currency,
    isActive: rule.is_active,
  };
}

function toPricingRulePayload(draft: ProviderPricingRuleDraft): ProviderPricingRuleCreatePayload {
  return {
    provider_profile_id: Number(draft.providerProfileId),
    capability: draft.capability.trim(),
    metric: draft.metric.trim(),
    unit_size: Number(draft.unitSize) || 1,
    unit_price: Number(draft.unitPrice) || 0,
    currency: draft.currency.trim() || "USD",
    is_active: draft.isActive,
  };
}

export default function ModelsPage({ providerProfiles, pricingRules, providers, error, onRefresh, onSetError }: ModelsPageProps) {
  const [providerDraft, setProviderDraft] = useState<ProviderProfileDraft>(defaultProviderProfileDraft);
  const [editingProviderProfileId, setEditingProviderProfileId] = useState<number | null>(null);
  const [savingProviderProfile, setSavingProviderProfile] = useState(false);
  const [pricingRuleDraft, setPricingRuleDraft] = useState<ProviderPricingRuleDraft>(defaultPricingRuleDraft);
  const [editingPricingRuleId, setEditingPricingRuleId] = useState<number | null>(null);
  const [savingPricingRule, setSavingPricingRule] = useState(false);
  const [probingProfileId, setProbingProfileId] = useState<number | null>(null);
  const [togglingProfileId, setTogglingProfileId] = useState<number | null>(null);
  const [probeResults, setProbeResults] = useState<Record<number, ProviderProfileProbeResult>>({});
  const [modelFilters, setModelFilters] = useState<ModelFilterState>({ search: "", capability: "all", adapterKind: "all", status: "all" });
  const [discoverPanelOpen, setDiscoverPanelOpen] = useState(false);
  const [discoverBaseUrl, setDiscoverBaseUrl] = useState("");
  const [discoverApiKey, setDiscoverApiKey] = useState("");
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState("");
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [discoveredAssignments, setDiscoveredAssignments] = useState<Record<string, DiscoveredModelAssignment>>({});
  const [discoverBaseUrlForImport, setDiscoverBaseUrlForImport] = useState("");
  const [discoverApiKeyForImport, setDiscoverApiKeyForImport] = useState("");
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [importingModels, setImportingModels] = useState(false);
  const [importResult, setImportResult] = useState<{ created: string[]; skipped: string[] } | null>(null);

  const enabledProviderProfiles = providerProfiles.filter((p) => p.enabled);
  const disabledProviderProfiles = providerProfiles.filter((p) => !p.enabled);
  const chatProviderProfileCount = providerProfiles.filter((p) => p.capabilities.includes("chat.completions")).length;
  const imageProviderProfileCount = providerProfiles.filter((p) => p.capabilities.some((c) => c === "image.generate" || c === "image.edit")).length;
  const experimentalProviderProfileCount = providerProfiles.filter((p) => {
    const support = summarizeProfileSupport(p.adapter_kind, p.capabilities);
    return support !== "ready" || p.capabilities.includes("video.generate");
  }).length;

  useEffect(() => {
    if (pricingRuleDraft.providerProfileId || providerProfiles.length === 0) return;
    setPricingRuleDraft((current) => ({
      ...current,
      providerProfileId: String(providerProfiles[0].id),
    }));
  }, [pricingRuleDraft.providerProfileId, providerProfiles]);

  const filteredProviderProfiles = providerProfiles.filter((profile) => {
    const searchText = `${profile.display_name} ${profile.provider_name} ${profile.model_name}`.toLowerCase();
    const searchMatches = !modelFilters.search.trim() || searchText.includes(modelFilters.search.trim().toLowerCase());
    const capabilityMatches = modelFilters.capability === "all" || profile.capabilities.includes(modelFilters.capability);
    const adapterMatches = modelFilters.adapterKind === "all" || profile.adapter_kind === modelFilters.adapterKind;
    const statusMatches = modelFilters.status === "all" || (modelFilters.status === "enabled" ? profile.enabled : !profile.enabled);
    return searchMatches && capabilityMatches && adapterMatches && statusMatches;
  });
  const selectedPricingProfileId =
    pricingRuleDraft.providerProfileId ||
    (editingProviderProfileId !== null ? String(editingProviderProfileId) : providerProfiles[0] ? String(providerProfiles[0].id) : "");
  const filteredPricingRules = pricingRules
    .filter((rule) => String(rule.provider_profile_id) === selectedPricingProfileId)
    .sort((left, right) => left.capability.localeCompare(right.capability) || left.metric.localeCompare(right.metric));

  function renderBillingSummary(profile: ProviderProfileRecord) {
    const hasImageCapability = profile.capabilities.some((capability) => capability === "image.generate" || capability === "image.edit");
    const hasVideoCapability = profile.capabilities.includes("video.generate");
    const chatRuleCount = pricingRules.filter(
      (rule) => rule.provider_profile_id === profile.id && rule.capability === "chat.completions" && rule.is_active
    ).length;
    return (
      <>
        {hasImageCapability || hasVideoCapability ? (
          <>
            <strong>{`${profile.unit_price} ${profile.pricing_currency}`}</strong>
            <small>{`${hasVideoCapability && !hasImageCapability ? "视频" : "图片"} ${formatPricingUnitLabel(profile.pricing_unit)}`}</small>
          </>
        ) : (
          <>
            <strong>按下方规则</strong>
            <small>图片未启用</small>
          </>
        )}
        {profile.capabilities.includes("chat.completions") ? <small>{`Chat 规则 ${chatRuleCount} 条`}</small> : null}
      </>
    );
  }

  const activeProviderSupport = summarizeProfileSupport(providerDraft.adapterKind, parseCapabilities(providerDraft.capabilities));
  const activeAdapterOption = getAdapterOption(providerDraft.adapterKind);

  function resetProviderProfileDraft() {
    setEditingProviderProfileId(null);
    setProviderDraft(defaultProviderProfileDraft);
  }

  function resetPricingRuleDraft(profileId?: number | null) {
    setEditingPricingRuleId(null);
    setPricingRuleDraft({
      ...defaultPricingRuleDraft,
      providerProfileId: profileId ? String(profileId) : providerProfiles[0] ? String(providerProfiles[0].id) : "",
    });
  }


  function handleEditProviderProfile(profile: ProviderProfileRecord) {
    setEditingProviderProfileId(profile.id);
    setProviderDraft(toProviderProfileDraft(profile));
    setPricingRuleDraft((current) => ({ ...current, providerProfileId: String(profile.id) }));
  }

  function handleEditPricingRule(rule: ProviderPricingRuleRecord) {
    setEditingPricingRuleId(rule.id);
    setPricingRuleDraft(toPricingRuleDraft(rule));
  }

  async function handleSaveProviderProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let payload: ProviderProfileCreatePayload;
    try {
      payload = toProviderProfilePayload(providerDraft);
    } catch {
      onSetError("Strategies 必须是合法 JSON，例如 {\"image.generate\":\"openai_images\"}");
      return;
    }
    if (!payload.provider_name || !payload.base_url || !payload.model_name) { onSetError("请填写 provider 名称、base URL 和模型名称"); return; }
    if (payload.capabilities.length === 0) { onSetError("请至少填写一个模型能力"); return; }
    if (editingProviderProfileId === null && !payload.api_key) { onSetError("新增模型配置需要填写 API Key"); return; }
    setSavingProviderProfile(true);
    try {
      if (editingProviderProfileId === null) {
        await api.createProviderProfile(payload);
      } else {
        await api.updateProviderProfile(editingProviderProfileId, { display_name: payload.display_name, base_url: payload.base_url, model_name: payload.model_name, adapter_kind: payload.adapter_kind, capabilities: payload.capabilities, strategies: payload.strategies, adapter_config: payload.adapter_config, quality: payload.quality, output_format: payload.output_format, timeout_seconds: payload.timeout_seconds, pricing_currency: payload.pricing_currency, pricing_unit: payload.pricing_unit, unit_price: payload.unit_price, enabled: payload.enabled, reference_mode: payload.reference_mode, reference_caption_model: payload.reference_caption_model, ...(payload.api_key ? { api_key: payload.api_key } : {}), ...(payload.api_secret ? { api_secret: payload.api_secret } : {}) });
      }
      resetProviderProfileDraft();
      onRefresh();
      onSetError("");
    } catch (err) { onSetError(err instanceof Error ? err.message : "保存模型配置失败"); }
    finally { setSavingProviderProfile(false); }
  }

  async function handleDeleteProviderProfile(profileId: number) {
    try {
      await api.deleteProviderProfile(profileId);
      if (editingProviderProfileId === profileId) resetProviderProfileDraft();
      setProbeResults((current) => {
        if (!(profileId in current)) return current;
        const next = { ...current };
        delete next[profileId];
        return next;
      });
      onRefresh();
      onSetError("");
    } catch (err) { onSetError(err instanceof Error ? err.message : "删除模型配置失败"); }
  }

  async function handleToggleProviderProfile(profile: ProviderProfileRecord) {
    const nextEnabled = !profile.enabled;
    setTogglingProfileId(profile.id);
    try {
      await api.updateProviderProfile(profile.id, { enabled: nextEnabled });
      if (editingProviderProfileId === profile.id) {
        setProviderDraft((current) => ({ ...current, enabled: nextEnabled }));
      }
      onRefresh();
      onSetError("");
    } catch (err) {
      onSetError(err instanceof Error ? err.message : nextEnabled ? "启用模型失败" : "停用模型失败");
    } finally {
      setTogglingProfileId(null);
    }
  }

  async function handleSavePricingRule(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const payload = toPricingRulePayload(pricingRuleDraft);
    if (!payload.provider_profile_id || !payload.capability || !payload.metric) {
      onSetError("请先选择模型并填写计费能力、指标和单价");
      return;
    }
    setSavingPricingRule(true);
    try {
      if (editingPricingRuleId === null) {
        await api.createProviderPricingRule(payload);
      } else {
        await api.updateProviderPricingRule(editingPricingRuleId, payload);
      }
      resetPricingRuleDraft(payload.provider_profile_id);
      onRefresh();
      onSetError("");
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "保存计费规则失败");
    } finally {
      setSavingPricingRule(false);
    }
  }

  async function handleDeletePricingRule(ruleId: number, providerProfileId: number) {
    try {
      await api.deleteProviderPricingRule(ruleId);
      if (editingPricingRuleId === ruleId) {
        resetPricingRuleDraft(providerProfileId);
      }
      onRefresh();
      onSetError("");
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "删除计费规则失败");
    }
  }

  async function handleProbeProviderProfile(profileId: number) {
    setProbingProfileId(profileId);
    try {
      const result = await api.probeProviderProfile(profileId);
      setProbeResults((current) => ({ ...current, [profileId]: result }));
      onSetError("");
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "校验模型连通性失败");
    } finally {
      setProbingProfileId(null);
    }
  }

  function probeTone(status: string): SupportLevel {
    if (status === "ok" || status === "configured") return "ready";
    if (status === "auth_error" || status === "invalid_key" || status === "missing_key") return "partial";
    return "planned";
  }

  async function handleDiscoverModels(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDiscoverError(""); setDiscoveredModels([]); setDiscoveredAssignments({}); setSelectedModelIds(new Set()); setImportResult(null); setDiscoverLoading(true);
    try {
      const result = await api.discoverProviderModels(discoverBaseUrl.trim(), discoverApiKey.trim());
      setDiscoveredModels(result.models);
      setDiscoveredAssignments(Object.fromEntries(result.models.map((m) => [m.model_id, guessDiscoveredModelAssignment(m.model_id, m.owned_by, result.base_url)])));
      setDiscoverBaseUrlForImport(result.base_url);
      setDiscoverApiKeyForImport(discoverApiKey.trim());
      setSelectedModelIds(new Set(result.models.filter((m) => !m.already_exists).map((m) => m.model_id)));
    } catch (err) { setDiscoverError(err instanceof Error ? err.message : "探测失败"); }
    finally { setDiscoverLoading(false); }
  }

  function toggleModelSelection(modelId: string) {
    setSelectedModelIds((current) => { const next = new Set(current); if (next.has(modelId)) next.delete(modelId); else next.add(modelId); return next; });
  }

  function updateDiscoveredAssignment(modelId: string, patch: Partial<DiscoveredModelAssignment>) {
    setDiscoveredAssignments((current) => ({
      ...current,
      [modelId]: { ...(current[modelId] ?? { generate: false, edit: false, chat: false }), ...patch },
    }));
  }

  function buildProviderName(baseUrl: string, modelId: string): string {
    const slug = modelId.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").toLowerCase();
    return baseUrl.includes("modelscope.cn") ? `ms_${slug}` : slug;
  }

  async function handleBulkImport() {
    if (selectedModelIds.size === 0) return;
    setImportingModels(true); setImportResult(null);
    try {
      const items: ProviderBulkImportItem[] = discoveredModels.filter((m) => selectedModelIds.has(m.model_id)).map((m) => {
        const assignment = discoveredAssignments[m.model_id] ?? { generate: false, edit: false, chat: false };
        return { model_id: m.model_id, provider_name: buildProviderName(discoverBaseUrlForImport, m.model_id), display_name: m.model_id, capabilities: assignmentToCapabilities(m.model_id, m.owned_by, assignment), adapter_kind: "openai_compatible", reference_mode: assignment.generate && discoverBaseUrlForImport.includes("modelscope.cn") ? "caption_prompt" : "disabled" };
      });
      const unassigned = items.filter((item) => item.capabilities.length === 0).map((item) => item.model_id);
      if (unassigned.length > 0) { setDiscoverError(`以下模型尚未分配：${unassigned.join(", ")}`); setImportingModels(false); return; }
      const result = await api.bulkImportProviderProfiles({ base_url: discoverBaseUrlForImport, api_key: discoverApiKeyForImport, models: items });
      setImportResult(result); setSelectedModelIds(new Set()); onRefresh();
    } catch (err) { setDiscoverError(err instanceof Error ? err.message : "批量导入失败"); }
    finally { setImportingModels(false); }
  }

  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div><h1>模型管理</h1><p>管理可用模型，查看使用情况、成本与配置</p></div>
        <div className="admin-head-actions">
          <button type="button" className="ghost-button" onClick={() => { setDiscoverPanelOpen((v) => !v); setDiscoverError(""); setImportResult(null); }}>{discoverPanelOpen ? "关闭探测" : "🔍 探测模型"}</button>
          <button type="button" className="admin-primary-button" onClick={resetProviderProfileDraft}>+ 添加模型</button>
        </div>
      </header>

      {error ? <div className="floating-error">{error}</div> : null}

      <div className="admin-kpi-grid admin-kpi-grid-4 admin-model-kpi-modern">
        <article className="admin-kpi-card admin-blue"><span>模型总数</span><strong>{providerProfiles.length}</strong><small>后台已保存配置</small><i>M</i></article>
        <article className="admin-kpi-card admin-green"><span>Chat 模型</span><strong>{chatProviderProfileCount}</strong><small>分配到 Chat 页面</small><i>C</i></article>
        <article className="admin-kpi-card admin-orange"><span>图像模型</span><strong>{imageProviderProfileCount}</strong><small>生成 / 编辑能力</small><i>I</i></article>
        <article className="admin-kpi-card admin-red"><span>实验 / 待适配</span><strong>{experimentalProviderProfileCount}</strong><small>视频或原生 adapter</small><i>!</i></article>
      </div>

      {discoverPanelOpen ? (
        <section className="discover-panel">
          <form className="discover-form" autoComplete="off" onSubmit={(e) => void handleDiscoverModels(e)}>
            <h3>探测模型列表</h3>
            <p className="discover-hint">填入 Base URL 和 API Key，自动拉取该服务支持的模型列表。</p>
            <div className="discover-form-row">
              <label className="composer-menu-field discover-url-field"><span>Base URL</span><input value={discoverBaseUrl} onChange={(e) => setDiscoverBaseUrl(e.target.value)} placeholder="https://api-inference.modelscope.cn/v1" autoComplete="off" required /></label>
              <label className="composer-menu-field discover-key-field"><span>API Key</span><input type="password" value={discoverApiKey} onChange={(e) => setDiscoverApiKey(e.target.value)} placeholder="sk-..." autoComplete="new-password" required /></label>
              <button type="submit" className="submit-button discover-submit-btn" disabled={discoverLoading}>{discoverLoading ? "探测中..." : "探测"}</button>
            </div>
            {discoverError ? <p className="discover-error">{discoverError}</p> : null}
          </form>
          {discoveredModels.length > 0 ? (
            <div className="discover-results">
              <div className="discover-results-head">
                <span>共发现 {discoveredModels.length} 个模型，已选 {selectedModelIds.size} 个</span>
                <div className="discover-results-actions">
                  <button type="button" className="ghost-button" onClick={() => setSelectedModelIds(new Set(discoveredModels.filter((m) => !m.already_exists).map((m) => m.model_id)))}>全选未导入</button>
                  <button type="button" className="ghost-button" onClick={() => setSelectedModelIds(new Set())}>取消全选</button>
                  <button type="button" className="submit-button" disabled={selectedModelIds.size === 0 || importingModels} onClick={() => void handleBulkImport()}>{importingModels ? "导入中..." : `导入选中 (${selectedModelIds.size})`}</button>
                </div>
              </div>
              {importResult ? <p className="discover-import-result">✓ 已导入 {importResult.created.length} 个：{importResult.created.join(", ") || "无"}{importResult.skipped.length > 0 ? `；跳过已存在 ${importResult.skipped.length} 个` : ""}</p> : null}
              <div className="discover-model-list">
                {discoveredModels.map((model) => (
                  <div key={model.model_id} className={`discover-model-item${model.already_exists ? " discover-model-exists" : ""}`}>
                    <input type="checkbox" checked={selectedModelIds.has(model.model_id)} disabled={model.already_exists} onChange={() => toggleModelSelection(model.model_id)} />
                    <div className="discover-model-main">
                      <span className="discover-model-id">{model.model_id}</span>
                      <div className="discover-model-meta">
                        {model.owned_by ? <span className="discover-model-owner">{model.owned_by}</span> : null}
                        <span className="discover-model-tag discover-model-tag-assignment">分配：{assignmentLabel(discoveredAssignments[model.model_id] ?? { generate: false, edit: false, chat: false })}</span>
                        {model.already_exists ? <em className="discover-model-tag">已导入</em> : null}
                      </div>
                    </div>
                    <div className="discover-assignment" onClick={(e) => e.stopPropagation()}>
                      <label className="discover-assignment-option"><input type="checkbox" checked={Boolean(discoveredAssignments[model.model_id]?.generate)} disabled={model.already_exists} onChange={(e) => updateDiscoveredAssignment(model.model_id, { generate: e.target.checked })} /><span>生成页</span></label>
                      <label className="discover-assignment-option"><input type="checkbox" checked={Boolean(discoveredAssignments[model.model_id]?.edit)} disabled={model.already_exists} onChange={(e) => updateDiscoveredAssignment(model.model_id, { edit: e.target.checked })} /><span>图像编辑</span></label>
                      <label className="discover-assignment-option"><input type="checkbox" checked={Boolean(discoveredAssignments[model.model_id]?.chat)} disabled={model.already_exists} onChange={(e) => updateDiscoveredAssignment(model.model_id, { chat: e.target.checked })} /><span>Chat</span></label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="admin-split-layout admin-model-layout">
        <section className="admin-table-panel">
          <div className="admin-toolbar model-toolbar">
            <div className="model-toolbar-grid">
              <input aria-label="搜索模型" placeholder="搜索 provider / model" value={modelFilters.search} onChange={(e) => setModelFilters((c) => ({ ...c, search: e.target.value }))} />
              <select aria-label="页面分配" value={modelFilters.capability} onChange={(e) => setModelFilters((c) => ({ ...c, capability: e.target.value }))}><option value="all">全部能力</option>{capabilityDefinitions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
              <select aria-label="适配器" value={modelFilters.adapterKind} onChange={(e) => setModelFilters((c) => ({ ...c, adapterKind: e.target.value }))}><option value="all">全部适配器</option>{adapterOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select>
              <select aria-label="状态" value={modelFilters.status} onChange={(e) => setModelFilters((c) => ({ ...c, status: e.target.value as ModelFilterState["status"] }))}><option value="all">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select>
              <button type="button" onClick={onRefresh}>刷新</button>
            </div>
          </div>
          <div className="model-table-summary"><span>筛选后 {filteredProviderProfiles.length} 个配置</span></div>
          <div className="admin-data-table admin-model-table model-table-modern">
            <div className="admin-table-row admin-table-head"><span>模型名称</span><span>页面分配</span><span>适配器</span><span>计费逻辑</span><span>Key</span><span>状态</span><span>操作</span></div>
            {filteredProviderProfiles.length > 0 ? filteredProviderProfiles.map((profile) => {
              const support = summarizeProfileSupport(profile.adapter_kind, profile.capabilities);
              const adapter = getAdapterOption(profile.adapter_kind);
              const probe = probeResults[profile.id];
              return (
                <div key={profile.id} className="admin-table-row">
                          <span><strong>{profile.display_name || profile.model_name}</strong><small>{profile.provider_name}</small></span>
                  <span className="model-capability-list">{profile.capabilities.map((c) => { const def = getCapabilityDefinition(c); return <em key={c} className={`model-capability-chip support-${def.support}`}>{def.label}</em>; })}</span>
                  <span><strong>{adapter.label}</strong><small className={`model-support-badge support-${support}`}>{supportLevelLabel(support)}</small></span>
                  <span>{renderBillingSummary(profile)}</span>
                  <span>
                    <strong>{profile.masked_api_key || (profile.has_api_key ? "已保存" : "no key")}</strong>
                    {probe ? <small>{probe.detail}</small> : null}
                  </span>
                  <span>
                    <em className={`status-pill ${profile.enabled ? "status-completed" : "status-failed"}`}>{profile.enabled ? "启用" : "停用"}</em>
                    {probe ? <small className={`model-support-badge support-${probeTone(probe.status)}`}>{probe.ok ? "已校验" : probe.status}</small> : null}
                  </span>
                  <span className="admin-row-actions">
                    <button type="button" onClick={() => void handleProbeProviderProfile(profile.id)} disabled={probingProfileId === profile.id}>{probingProfileId === profile.id ? "校验中..." : "校验"}</button>
                    <button type="button" onClick={() => void handleToggleProviderProfile(profile)} disabled={togglingProfileId === profile.id}>
                      {togglingProfileId === profile.id ? "处理中..." : profile.enabled ? "停用" : "启用"}
                    </button>
                    <button type="button" onClick={() => handleEditProviderProfile(profile)}>编辑</button>
                    <button type="button" onClick={() => handleDeleteProviderProfile(profile.id)}>删除</button>
                  </span>
                </div>
              );
            }) : <div className="template-empty">{providerProfiles.length > 0 ? "当前筛选条件下没有匹配的模型配置。" : "还没有后台模型配置。"}</div>}
          </div>
        </section>

        <aside className="admin-detail-panel">
          <form className="admin-side-form" autoComplete="off" onSubmit={handleSaveProviderProfile}>
            <div className="admin-detail-head"><h2>{editingProviderProfileId === null ? "新增模型配置" : "编辑模型配置"}</h2><p>保存后会按 capabilities 出现在对应页面中。</p></div>
            <div className="model-form-grid model-form-grid-tight">
              <label className="composer-menu-field"><span>Provider</span><input value={providerDraft.providerName} disabled={editingProviderProfileId !== null} onChange={(e) => setProviderDraft((c) => ({ ...c, providerName: e.target.value }))} placeholder="modelscope_arch" autoComplete="off" /></label>
              <label className="composer-menu-field"><span>显示名</span><input value={providerDraft.displayName} onChange={(e) => setProviderDraft((c) => ({ ...c, displayName: e.target.value }))} placeholder="例如：Gemini 快速生图" autoComplete="off" /></label>
              <label className="composer-menu-field"><span>Model</span><input value={providerDraft.modelName} onChange={(e) => setProviderDraft((c) => ({ ...c, modelName: e.target.value }))} placeholder="Qwen/Qwen-Image" autoComplete="off" /></label>
              <label className="composer-menu-field composer-menu-field-full"><span>Adapter</span><select value={providerDraft.adapterKind} onChange={(e) => setProviderDraft((c) => ({ ...c, adapterKind: e.target.value }))}>{adapterOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
              <label className="composer-menu-field composer-menu-field-full"><span>Base URL</span><input name="provider-base-url" value={providerDraft.baseUrl} onChange={(e) => setProviderDraft((c) => ({ ...c, baseUrl: e.target.value }))} placeholder="https://api-inference.modelscope.cn/v1" autoComplete="off" /></label>
              <label className="composer-menu-field composer-menu-field-full"><span>API Key</span><input name="provider-api-key" type="password" value={providerDraft.apiKey} autoComplete="new-password" onChange={(e) => setProviderDraft((c) => ({ ...c, apiKey: e.target.value }))} placeholder={editingProviderProfileId === null ? "新增时必填" : "留空则保留已保存 key"} /></label>
              <label className="composer-menu-field composer-menu-field-full"><span>API Secret</span><input name="provider-api-secret" type="password" value={providerDraft.apiSecret} autoComplete="new-password" onChange={(e) => setProviderDraft((c) => ({ ...c, apiSecret: e.target.value }))} placeholder="Jimeng native only; leave blank to keep saved secret" /></label>
              <label className="composer-menu-field"><span>Capabilities</span>
                <div className="capability-toggle-list">
                  {capabilityDefinitions.map((def) => (
                    <label key={def.key} className="capability-toggle"><input type="checkbox" checked={hasCapability(providerDraft.capabilities, def.key)} onChange={(e) => setProviderDraft((c) => ({ ...c, capabilities: toggleCapability(c.capabilities, def.key, e.target.checked) }))} /><span>{def.label}</span></label>
                  ))}
                </div>
                <input value={providerDraft.capabilities} onChange={(e) => setProviderDraft((c) => ({ ...c, capabilities: e.target.value }))} placeholder="image.generate, chat.completions" />
              </label>
              <label className="composer-menu-field composer-menu-field-full"><span>Strategies</span><textarea rows={5} value={providerDraft.strategies} onChange={(e) => setProviderDraft((c) => ({ ...c, strategies: e.target.value }))} placeholder={'{\n  "chat": "openai_chat",\n  "image.generate": "chat_modalities_image",\n  "image.edit": "chat_modalities_image_edit",\n  "video.generate": "haodeya_grok_video"\n}'} /></label>
              <label className="composer-menu-field composer-menu-field-full"><span>Adapter Config</span><textarea rows={5} value={providerDraft.adapterConfig} onChange={(e) => setProviderDraft((c) => ({ ...c, adapterConfig: e.target.value }))} placeholder={'{\n  "service": "cv",\n  "region": "cn-north-1",\n  "version": "2022-08-31",\n  "submit_action": "CVSync2AsyncSubmitTask",\n  "result_action": "CVSync2AsyncGetResult",\n  "req_key": "jimeng_t2v_v30"\n}'} /></label>
              <label className="composer-menu-field"><span>Quality</span><input value={providerDraft.quality} onChange={(e) => setProviderDraft((c) => ({ ...c, quality: e.target.value }))} placeholder="medium" /></label>
              <label className="composer-menu-field"><span>Format</span><select value={providerDraft.outputFormat} onChange={(e) => setProviderDraft((c) => ({ ...c, outputFormat: e.target.value }))}><option value="png">png</option><option value="jpeg">jpeg</option><option value="webp">webp</option><option value="mp4">mp4</option></select></label>
              <label className="composer-menu-field"><span>Timeout</span><input type="number" min="30" value={providerDraft.timeoutSeconds} onChange={(e) => setProviderDraft((c) => ({ ...c, timeoutSeconds: Number(e.target.value) || 300 }))} /></label>
              <p className="admin-form-help">建议图片任务从 300 秒起步；视频任务可按上游建议调整到 600-900 秒。</p>
              <label className="composer-menu-field"><span>计费币种</span><input value={providerDraft.pricingCurrency} onChange={(e) => setProviderDraft((c) => ({ ...c, pricingCurrency: e.target.value }))} placeholder="CNY" /></label>
              <label className="composer-menu-field"><span>计费单位</span><select value={providerDraft.pricingUnit} onChange={(e) => setProviderDraft((c) => ({ ...c, pricingUnit: e.target.value }))}><option value="per_image">按张图片</option><option value="per_video">按条视频</option><option value="per_request">按次请求</option></select></label>
              <label className="composer-menu-field"><span>单价</span><input type="number" min="0" step="0.0001" value={providerDraft.unitPrice} onChange={(e) => setProviderDraft((c) => ({ ...c, unitPrice: Number(e.target.value) || 0 }))} placeholder="0" /></label>
              <label className="composer-menu-field"><span>Reference</span><select value={providerDraft.referenceMode} onChange={(e) => setProviderDraft((c) => ({ ...c, referenceMode: e.target.value }))}><option value="disabled">disabled</option><option value="caption_prompt">caption_prompt</option></select></label>
              <label className="composer-menu-field"><span>Caption Model</span><input value={providerDraft.referenceCaptionModel} onChange={(e) => setProviderDraft((c) => ({ ...c, referenceCaptionModel: e.target.value }))} placeholder="Qwen/Qwen3-VL-8B-Instruct" /></label>
            </div>
            <div className={`model-runtime-note support-${activeProviderSupport}`}><strong>{activeAdapterOption.label} · {supportLevelLabel(activeProviderSupport)}</strong><p>{activeAdapterOption.note}</p></div>
            <label className="model-toggle"><input type="checkbox" checked={providerDraft.enabled} onChange={(e) => setProviderDraft((c) => ({ ...c, enabled: e.target.checked }))} /><span>启用这个模型配置</span></label>
            <div className="template-editor-actions">
              <button type="submit" className="submit-button" disabled={savingProviderProfile}>{savingProviderProfile ? "保存中..." : editingProviderProfileId === null ? "保存配置" : "更新配置"}</button>
              {editingProviderProfileId !== null ? <button type="button" className="ghost-button" onClick={resetProviderProfileDraft}>取消编辑</button> : null}
            </div>
            <div className="template-editor" style={{ marginTop: 24 }}>
              <div className="template-section-head">
                <strong>计费规则</strong>
                <span>图片仍沿用上方兼容单价，Chat 与细分 usage 在这里单独配置。</span>
              </div>
              <div className="template-empty">
                图片任务当前按上方模型配置计费，只支持“按张图片”或“按次请求”两种口径。Chat 当前按这里的独立规则计费，
                支持输入 tokens、输出 tokens、缓存命中 tokens。若某个 Chat 模型还没配置规则，调用仍可继续，但成本会记为 0，且不会回补历史账单。
              </div>
              <div className="template-list admin-template-list">
                {filteredPricingRules.length > 0 ? filteredPricingRules.map((rule) => (
                  <div key={rule.id} className="template-list-item">
                    <button type="button" className="template-card template-card-main" onClick={() => handleEditPricingRule(rule)}>
                      <strong>{rule.capability}</strong>
                      <span>{formatPricingMetricLabel(rule.metric)}</span>
                      <small>{`${rule.unit_price} ${rule.currency} / ${rule.unit_size}`}</small>
                    </button>
                    <div className="template-card-actions">
                      <button type="button" className="template-action-button" onClick={() => handleEditPricingRule(rule)}>
                        编辑
                      </button>
                      <button
                        type="button"
                        className="template-action-button"
                        onClick={() => void handleDeletePricingRule(rule.id, rule.provider_profile_id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )) : <div className="template-empty">当前模型还没有独立计费规则。</div>}
              </div>
              <div className="admin-side-form">
                <div className="template-editor-row template-editor-row-3">
                  <label className="composer-menu-field">
                    <span>模型</span>
                    <select
                      value={selectedPricingProfileId}
                      onChange={(e) =>
                        setPricingRuleDraft((current) => ({ ...current, providerProfileId: e.target.value }))
                      }
                    >
                      {providerProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.provider_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="composer-menu-field">
                    <span>能力</span>
                    <select
                      value={pricingRuleDraft.capability}
                      onChange={(e) => setPricingRuleDraft((current) => ({ ...current, capability: e.target.value }))}
                    >
                      <option value="chat.completions">chat.completions</option>
                      <option value="image.generate">image.generate</option>
                      <option value="image.edit">image.edit</option>
                      <option value="video.generate">video.generate</option>
                    </select>
                  </label>
                  <label className="composer-menu-field">
                    <span>指标</span>
                    <select
                      value={pricingRuleDraft.metric}
                      onChange={(e) => setPricingRuleDraft((current) => ({ ...current, metric: e.target.value }))}
                    >
                      <option value="input_tokens">input_tokens</option>
                      <option value="output_tokens">output_tokens</option>
                      <option value="cached_input_tokens">cached_input_tokens</option>
                      <option value="per_image">per_image</option>
                      <option value="per_video">per_video</option>
                      <option value="per_request">per_request</option>
                    </select>
                  </label>
                </div>
                <div className="template-editor-row template-editor-row-3">
                  <label className="composer-menu-field">
                    <span>单位大小</span>
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={pricingRuleDraft.unitSize}
                      onChange={(e) => setPricingRuleDraft((current) => ({ ...current, unitSize: e.target.value }))}
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>单价</span>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={pricingRuleDraft.unitPrice}
                      onChange={(e) => setPricingRuleDraft((current) => ({ ...current, unitPrice: e.target.value }))}
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>币种</span>
                    <input
                      value={pricingRuleDraft.currency}
                      onChange={(e) => setPricingRuleDraft((current) => ({ ...current, currency: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="model-toggle">
                  <input
                    type="checkbox"
                    checked={pricingRuleDraft.isActive}
                    onChange={(e) => setPricingRuleDraft((current) => ({ ...current, isActive: e.target.checked }))}
                  />
                  <span>启用这条计费规则</span>
                </label>
                <div className="template-editor-actions">
                  <button
                    type="button"
                    className="submit-button"
                    disabled={savingPricingRule || providerProfiles.length === 0}
                    onClick={() => void handleSavePricingRule()}
                  >
                    {savingPricingRule ? "保存中..." : editingPricingRuleId === null ? "新增规则" : "更新规则"}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      resetPricingRuleDraft(
                        selectedPricingProfileId ? Number(selectedPricingProfileId) : providerProfiles[0]?.id ?? null
                      )
                    }
                  >
                    {editingPricingRuleId === null ? "重置表单" : "取消编辑"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </aside>
      </div>
    </section>
  );
}
