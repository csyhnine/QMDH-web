import { type FormEvent, useEffect, useState } from "react";
import ComfyOperations from "./ComfyOperations";
import {
  api,
  type DiscoveredModel,
  type Provider,
  type ProviderBulkImportItem,
  type ProviderPricingRuleCreatePayload,
  type ProviderPricingRuleRecord,
  type ProviderProfileCreatePayload,
  type ProviderProfileProbeResult,
  type ProviderProfilePreviewRequestResult,
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
  unitPrice1k: string;
  unitPrice2k: string;
  unitPrice4k: string;
  supportedResolution1k: boolean;
  supportedResolution2k: boolean;
  supportedResolution4k: boolean;
  upstreamModel1k: string;
  upstreamModel2k: string;
  upstreamModel4k: string;
  upstreamSkuI2v5s: string;
  upstreamSkuI2v10s: string;
  upstreamSkuRef5s: string;
  upstreamSkuRef10s: string;
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
  video: boolean;
};

const EMPTY_DISCOVERED_ASSIGNMENT: DiscoveredModelAssignment = {
  generate: false,
  edit: false,
  chat: false,
  video: false,
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

type ModelPreset = {
  id: string;
  label: string;
  category: string;
  description: string;
  draft: Partial<ProviderProfileDraft>;
};

type DetailPanelTab = "model" | "chat-billing";


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
  unitPrice1k: "",
  unitPrice2k: "",
  unitPrice4k: "",
  supportedResolution1k: true,
  supportedResolution2k: true,
  supportedResolution4k: false,
  upstreamModel1k: "",
  upstreamModel2k: "",
  upstreamModel4k: "",
  upstreamSkuI2v5s: "",
  upstreamSkuI2v10s: "",
  upstreamSkuRef5s: "",
  upstreamSkuRef10s: "",
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
  currency: "CNY",
  isActive: true,
};

const PRICING_TIER_ADAPTER_KEYS = [
  "unit_price_1k",
  "unit_price_2k",
  "unit_price_4k",
  "unit_price_5s",
  "unit_price_10s",
] as const;
const UPSTREAM_MODEL_ADAPTER_KEYS = ["upstream_model_1k", "upstream_model_2k", "upstream_model_4k"] as const;
const UPSTREAM_VIDEO_SKU_ADAPTER_KEYS = [
  "upstream_sku_i2v_5s",
  "upstream_sku_i2v_10s",
  "upstream_sku_ref_5s",
  "upstream_sku_ref_10s",
] as const;
const MANAGED_ADAPTER_CONFIG_KEYS = [
  ...PRICING_TIER_ADAPTER_KEYS,
  ...UPSTREAM_MODEL_ADAPTER_KEYS,
  ...UPSTREAM_VIDEO_SKU_ADAPTER_KEYS,
  "supported_resolutions",
] as const;

const HAODEYA_BASE_URL = "https://newapi.haodeya.xyz/v1";

const capabilityDefinitions: CapabilityDefinition[] = [
  { key: "chat.completions", label: "Chat", description: "出现在对话页", support: "ready" },
  { key: "image.generate", label: "生成页", description: "出现在文生图", support: "ready" },
  { key: "image.edit", label: "图像编辑", description: "出现在图像编辑", support: "ready" },
  { key: "video.generate", label: "视频生成", description: "出现在视频模式", support: "partial" },
];

type StrategyPresetOption = {
  id: string;
  label: string;
  /** null = remove key (auto); string = strategy value; "__custom__" = free JSON */
  strategy: string | null | "__custom__";
  hint: string;
};

const IMAGE_STRATEGY_PRESETS: StrategyPresetOption[] = [
  { id: "auto", label: "自动", strategy: null, hint: "按模型名/网关推断" },
  {
    id: "sync_short",
    label: "同步短 body",
    strategy: "haodeya_sync_image",
    hint: "GPT 2.0/2.5 同步：size 用 1024x1024 等像素，勿用 1:1",
  },
  {
    id: "async",
    label: "异步短 body",
    strategy: "haodeya_async_image",
    hint: "VIP：size 用 1:1 / 16:9 比例，轮询",
  },
  {
    id: "modalities",
    label: "聊天多模态",
    strategy: "chat_modalities_image",
    hint: "messages / modalities / image_config",
  },
  {
    id: "completions",
    label: "Chat Completions",
    strategy: "chat_completions_image",
    hint: "CPA Gemini 等",
  },
  {
    id: "openai",
    label: "同步 /images",
    strategy: "openai_images",
    hint: "Wan literal size 等",
  },
  { id: "custom", label: "自定义", strategy: "__custom__", hint: "下方 JSON 手写" },
];

const VIDEO_STRATEGY_PRESETS: StrategyPresetOption[] = [
  { id: "auto", label: "自动", strategy: null, hint: "按适配器/模型推断" },
  { id: "grok", label: "Haodeya 视频", strategy: "haodeya_grok_video", hint: "Grok / HappyHorse / Seedance 2" },
  { id: "ark", label: "Ark 视频", strategy: "volcengine_ark_video_tasks", hint: "Seedance" },
  { id: "dashscope", label: "DashScope 视频", strategy: "dashscope_async_video", hint: "Wan 视频" },
  { id: "jimeng", label: "即梦视频", strategy: "volcengine_cv_jimeng_video", hint: "CV Native" },
  { id: "custom", label: "自定义", strategy: "__custom__", hint: "下方 JSON 手写" },
];

const CHAT_STRATEGY_PRESETS: StrategyPresetOption[] = [
  { id: "auto", label: "自动", strategy: null, hint: "默认 openai_chat" },
  { id: "openai_chat", label: "OpenAI Chat", strategy: "openai_chat", hint: "/chat/completions" },
  { id: "custom", label: "自定义", strategy: "__custom__", hint: "下方 JSON 手写" },
];

const IMAGE_EDIT_STRATEGY_FOR_GENERATE: Record<string, string> = {
  haodeya_async_image: "haodeya_async_image",
  haodeya_sync_image: "haodeya_sync_image",
  chat_modalities_image: "chat_modalities_image_edit",
  chat_completions_image: "chat_completions_image_edit",
  openai_images: "openai_image_edits",
};

const adapterOptions: AdapterOption[] = [
  { key: "comfyui", label: "ComfyUI 本机图片", support: "ready", note: "通过私有隧道调用批准工作流；支持文生图、Qwen双图编辑、1K/2K/4K及自定义尺寸，1～3张逐张生成。" },
  { key: "haodeya_grok", label: "Haodeya 视频（Grok / HappyHorse / Seedance 2）", support: "partial", note: "一条统一 profile + Studio 档位菜单；Seedance 探测出的裸/分 SKU 可停用，Studio 有统一 profile 时会自动隐藏。探测不会创建真实视频。" },
  { key: "volcengine_ark", label: "Volcengine Ark 视频", support: "partial", note: "火山 Ark 异步任务（非 Haodeya Seedance 2 ToAPI）；探测不会创建真实视频。" },
  { key: "openai_compatible", label: "OpenAI 兼容", support: "ready", note: "Chat、生图、图像编辑的默认适配器；具体走哪条 strategy 看下方 Strategies。" },
  { key: "dashscope_native", label: "DashScope 原生视频", support: "partial", note: "阿里云 Wan 等异步视频；探测不会创建真实视频。" },
  { key: "anthropic_native", label: "Anthropic Native", support: "planned", note: "可先保存，后端尚无 Claude 原生执行器。" },
  { key: "kling_native", label: "Kling Native", support: "partial", note: "仅保留配置结构，视频执行 adapter 待补。" },
  { key: "jimeng_native", label: "即梦 CV Native", support: "partial", note: "火山 CV 签名视频任务；需填 API Secret；探测不会创建真实视频。" },
  { key: "custom_http", label: "Custom HTTP", support: "planned", note: "预留非标准厂商接口，当前无通用执行器。" },
];

const modelPresets: ModelPreset[] = [
  {
    id: "haodeya-gemini-image",
    label: "Gemini 生图（CPA）",
    category: "生图",
    description: "Haodeya chat/completions 出图；按 1K/2K 分档计费。",
    draft: {
      providerName: "haodeya_gemini_flash",
      displayName: "Nano Banana PRO",
      baseUrl: HAODEYA_BASE_URL,
      modelName: "gemini-3.1-flash-image",
      adapterKind: "openai_compatible",
      capabilities: "image.generate, image.edit",
      strategies: JSON.stringify(
        {
          "image.generate": "chat_completions_image",
          "image.edit": "chat_completions_image_edit",
        },
        null,
        2
      ),
      adapterConfig: "",
      pricingCurrency: "CNY",
      pricingUnit: "per_image",
      outputFormat: "png",
      timeoutSeconds: 300,
      referenceMode: "disabled",
    },
  },
  {
    id: "haodeya-wan-image",
    label: "Wan 2.7 生图",
    category: "生图",
    description: "无参考图 generations；有参考图 edits multipart。",
    draft: {
      providerName: "haodeya_wan27",
      displayName: "Wan 2.7 Image",
      baseUrl: HAODEYA_BASE_URL,
      modelName: "wan2.7-image",
      adapterKind: "openai_compatible",
      capabilities: "image.generate, image.edit",
      strategies: JSON.stringify(
        {
          "image.generate": "openai_images",
          "image.edit": "openai_image_edits",
        },
        null,
        2
      ),
      adapterConfig: JSON.stringify({ provider_flavor: "haodeya_wan_image", image_size_mode: "literal_tier" }, null, 2),
      pricingCurrency: "CNY",
      pricingUnit: "per_image",
      outputFormat: "png",
      timeoutSeconds: 300,
      referenceMode: "disabled",
    },
  },
  {
    id: "haodeya-gpt-image-20-sync",
    label: "GPT Image 2.0 同步",
    category: "生图",
    description: "同步短 body；1K/2K/4K 靠 model 后缀（gpt-image-2-1k 等）；图生图走 image_urls。",
    draft: {
      providerName: "gpt-image-2-1k",
      displayName: "GPT Image 2.0 Sync",
      baseUrl: HAODEYA_BASE_URL,
      modelName: "gpt-image-2-1k",
      adapterKind: "openai_compatible",
      capabilities: "image.generate, image.edit",
      strategies: JSON.stringify(
        {
          "image.generate": "haodeya_sync_image",
          "image.edit": "haodeya_sync_image",
        },
        null,
        2
      ),
      adapterConfig: JSON.stringify(
        {
          provider_flavor: "gpt_image_20_sync",
          unit_price_1k: 1.62,
          unit_price_2k: 2.67,
          supported_resolutions: ["1k", "2k", "4k"],
          upstream_model_1k: "gpt-image-2-1k",
          upstream_model_2k: "gpt-image-2-2k",
          upstream_model_4k: "gpt-image-2-4k",
        },
        null,
        2
      ),
      pricingCurrency: "CNY",
      pricingUnit: "per_image",
      outputFormat: "png",
      timeoutSeconds: 300,
      referenceMode: "disabled",
    },
  },
  {
    id: "haodeya-gpt-image-25-sunburst",
    label: "GPT Image 2.5 Sunburst",
    category: "生图",
    description: "单 model gpt-image-2.5-sunburst；1K/2K/4K 靠 body size 像素；可选 quality。",
    draft: {
      providerName: "gpt-image-2.5-sunburst",
      displayName: "GPT Image 2.5 Sunburst",
      baseUrl: HAODEYA_BASE_URL,
      modelName: "gpt-image-2.5-sunburst",
      adapterKind: "openai_compatible",
      capabilities: "image.generate, image.edit",
      strategies: JSON.stringify(
        {
          "image.generate": "haodeya_sync_image",
          "image.edit": "haodeya_sync_image",
        },
        null,
        2
      ),
      adapterConfig: JSON.stringify(
        {
          provider_flavor: "gpt_image_25_sunburst",
          unit_price_1k: 1.62,
          unit_price_2k: 2.67,
          supported_resolutions: ["1k", "2k", "4k"],
          upstream_model: "gpt-image-2.5-sunburst",
          default_quality: "medium",
        },
        null,
        2
      ),
      pricingCurrency: "CNY",
      pricingUnit: "per_image",
      outputFormat: "png",
      timeoutSeconds: 300,
      referenceMode: "disabled",
    },
  },
  {
    id: "haodeya-gpt-image-count",
    label: "GPT Image Count（已废弃）",
    category: "生图",
    description: "上游已废弃 count 系列；仅保留兼容。新接入请用 2.0 同步或 2.5 Sunburst。",
    draft: {
      providerName: "gpt-image-2-count",
      displayName: "GPT Image 2 Count (legacy)",
      baseUrl: HAODEYA_BASE_URL,
      modelName: "gpt-image-2-count",
      adapterKind: "openai_compatible",
      capabilities: "image.generate, image.edit",
      strategies: JSON.stringify(
        {
          "image.generate": "haodeya_sync_image",
          "image.edit": "haodeya_sync_image",
        },
        null,
        2
      ),
      adapterConfig: JSON.stringify(
        {
          provider_flavor: "haodeya_sync_image",
          unit_price_1k: 1.62,
          unit_price_2k: 2.67,
          supported_resolutions: ["1k", "2k"],
          upstream_model_1k: "gpt-image-2-count",
          upstream_model_2k: "gpt-image-2-count-2k",
          upstream_model_4k: "gpt-image-2-count-4k",
        },
        null,
        2
      ),
      pricingCurrency: "CNY",
      pricingUnit: "per_image",
      outputFormat: "png",
      timeoutSeconds: 300,
      referenceMode: "disabled",
    },
  },
  {
    id: "haodeya-happyhorse-video",
    label: "HappyHorse 视频",
    category: "视频",
    description: "单模型 + Studio 档位；后端按 metadata.input.media 组装。",
    draft: {
      providerName: "haodeya_happyhorse",
      displayName: "HappyHorse 1.1 Video",
      baseUrl: HAODEYA_BASE_URL,
      modelName: "happyhorse-1.1",
      adapterKind: "haodeya_grok",
      capabilities: "video.generate",
      strategies: JSON.stringify({ "video.generate": "haodeya_grok_video" }, null, 2),
      adapterConfig: "",
      pricingCurrency: "CNY",
      pricingUnit: "per_video",
      outputFormat: "mp4",
      timeoutSeconds: 900,
      referenceMode: "disabled",
    },
  },
  {
    id: "haodeya-seedance2-video",
    label: "Seedance 2（Haodeya）",
    category: "视频",
    description:
      "统一 profile + Studio「画质×时长」6 档；探测到的裸/分 SKU 在 Studio 会隐藏。勿用 Ark。",
    draft: {
      providerName: "haodeya_seedance",
      displayName: "Seedance 2 Video",
      baseUrl: HAODEYA_BASE_URL,
      modelName: "seedance-2",
      adapterKind: "haodeya_grok",
      capabilities: "video.generate",
      strategies: JSON.stringify({ "video.generate": "haodeya_grok_video" }, null, 2),
      adapterConfig: JSON.stringify(
        {
          unit_price_1k: 7,
          unit_price_2k: 14,
        },
        null,
        2
      ),
      pricingCurrency: "CNY",
      pricingUnit: "per_video",
      outputFormat: "mp4",
      timeoutSeconds: 900,
      referenceMode: "disabled",
    },
  },
  {
    id: "haodeya-grok-video",
    label: "Grok 视频",
    category: "视频",
    description: "单模型 + Studio 四档 SKU；按 5s/10s 计费。",
    draft: {
      providerName: "haodeya_grok",
      displayName: "Grok Imagine Video",
      baseUrl: HAODEYA_BASE_URL,
      modelName: "grok-imagine-video",
      adapterKind: "haodeya_grok",
      capabilities: "video.generate",
      strategies: JSON.stringify({ "video.generate": "haodeya_grok_video" }, null, 2),
      adapterConfig: "",
      pricingCurrency: "CNY",
      pricingUnit: "per_video",
      outputFormat: "mp4",
      timeoutSeconds: 900,
      referenceMode: "disabled",
    },
  },
  {
    id: "haodeya-chat",
    label: "Chat 对话",
    category: "Chat",
    description: "OpenAI 兼容 chat/completions；单价在「Chat 计费」页配置。",
    draft: {
      providerName: "haodeya_chat",
      displayName: "Qwen Chat",
      baseUrl: HAODEYA_BASE_URL,
      modelName: "qwen3.8-max-preview",
      adapterKind: "openai_compatible",
      capabilities: "chat.completions",
      strategies: JSON.stringify({ chat: "openai_chat" }, null, 2),
      adapterConfig: "",
      pricingCurrency: "CNY",
      pricingUnit: "per_request",
      outputFormat: "png",
      timeoutSeconds: 120,
      referenceMode: "disabled",
    },
  },
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

function parseStrategiesObject(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) out[key] = value.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function stringifyStrategiesObject(strategies: Record<string, string>): string {
  if (Object.keys(strategies).length === 0) return "";
  return JSON.stringify(strategies, null, 2);
}

function readStrategyValue(raw: string, capabilityKey: string): string | null {
  const strategies = parseStrategiesObject(raw);
  const value = strategies[capabilityKey];
  return value && value.trim() ? value.trim() : null;
}

function matchStrategyPreset(
  raw: string,
  capabilityKey: string,
  presets: StrategyPresetOption[]
): string {
  const current = readStrategyValue(raw, capabilityKey);
  if (current === null) return "auto";
  const matched = presets.find((item) => item.strategy === current);
  return matched?.id ?? "custom";
}

function applyStrategyPreset(
  raw: string,
  capabilityKey: string,
  preset: StrategyPresetOption,
  options?: { syncImageEdit?: boolean }
): string {
  if (preset.strategy === "__custom__") return raw;
  const next = { ...parseStrategiesObject(raw) };
  if (preset.strategy === null) {
    delete next[capabilityKey];
    if (options?.syncImageEdit && capabilityKey === "image.generate") {
      delete next["image.edit"];
    }
  } else {
    next[capabilityKey] = preset.strategy;
    if (options?.syncImageEdit && capabilityKey === "image.generate") {
      const editStrategy = IMAGE_EDIT_STRATEGY_FOR_GENERATE[preset.strategy];
      if (editStrategy) next["image.edit"] = editStrategy;
    }
  }
  return stringifyStrategiesObject(next);
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
  return adapterOptions.find((o) => o.key === adapterKind) ?? {
    key: adapterKind,
    label: adapterKind || "未知适配器",
    support: "planned",
    note: "尚未登记此适配器，请核对服务端支持情况。",
  };
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

function readSupportedResolutionFlags(adapterConfig: Record<string, unknown>): {
  supportedResolution1k: boolean;
  supportedResolution2k: boolean;
  supportedResolution4k: boolean;
} {
  const raw = adapterConfig.supported_resolutions;
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      supportedResolution1k: true,
      supportedResolution2k: true,
      supportedResolution4k: false,
    };
  }
  const normalized = new Set(
    raw.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
  );
  return {
    supportedResolution1k: normalized.has("1k"),
    supportedResolution2k: normalized.has("2k"),
    supportedResolution4k: normalized.has("4k"),
  };
}

function toProviderProfileDraft(profile: ProviderProfileRecord): ProviderProfileDraft {
  const adapterConfig = profile.adapter_config ?? {};
  const unitPrice1k =
    readAdapterConfigPrice(adapterConfig, "unit_price_1k") ||
    readAdapterConfigPrice(adapterConfig, "unit_price_5s") ||
    String(profile.unit_price ?? "");
  const supportedFlags = readSupportedResolutionFlags(adapterConfig);
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
    adapterConfig: JSON.stringify(stripManagedAdapterConfigKeys(adapterConfig), null, 2),
    quality: profile.quality ?? "medium",
    outputFormat: profile.output_format ?? "png",
    timeoutSeconds: profile.timeout_seconds ?? 300,
    pricingCurrency: profile.pricing_currency ?? "CNY",
    pricingUnit: profile.pricing_unit ?? "per_image",
    unitPrice1k,
    unitPrice2k:
      readAdapterConfigPrice(adapterConfig, "unit_price_2k") ||
      readAdapterConfigPrice(adapterConfig, "unit_price_10s"),
    unitPrice4k: readAdapterConfigPrice(adapterConfig, "unit_price_4k"),
    ...supportedFlags,
    upstreamModel1k: readAdapterConfigText(adapterConfig, "upstream_model_1k"),
    upstreamModel2k: readAdapterConfigText(adapterConfig, "upstream_model_2k"),
    upstreamModel4k: readAdapterConfigText(adapterConfig, "upstream_model_4k"),
    upstreamSkuI2v5s: readAdapterConfigText(adapterConfig, "upstream_sku_i2v_5s"),
    upstreamSkuI2v10s: readAdapterConfigText(adapterConfig, "upstream_sku_i2v_10s"),
    upstreamSkuRef5s: readAdapterConfigText(adapterConfig, "upstream_sku_ref_5s"),
    upstreamSkuRef10s: readAdapterConfigText(adapterConfig, "upstream_sku_ref_10s"),
    enabled: profile.enabled,
    referenceMode: profile.reference_mode ?? "disabled",
    referenceCaptionModel: profile.reference_caption_model ?? "",
  };
}

function toProviderProfilePayload(draft: ProviderProfileDraft): ProviderProfileCreatePayload {
  let strategies: Record<string, string> = {};
  const rawStrategies = draft.strategies.trim();
  if (rawStrategies) strategies = JSON.parse(rawStrategies) as Record<string, string>;
  const adapterConfig = buildAdapterConfigFromDraft(draft);
  const unitPrice1k = draft.unitPrice1k.trim() ? Number(draft.unitPrice1k) : 0;
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
    unit_price: unitPrice1k,
    enabled: draft.enabled,
    reference_mode: draft.referenceMode || "disabled",
    reference_caption_model: draft.referenceCaptionModel || "",
  };
}

function modelLooksLikeVideo(modelId: string, ownedBy: string): boolean {
  const lower = `${modelId} ${ownedBy}`.toLowerCase();
  return (
    lower.includes("video") ||
    lower.includes("i2v") ||
    lower.includes("t2v") ||
    lower.includes("r2v") ||
    lower.includes("happyhorse") ||
    lower.includes("seedance") ||
    lower.includes("kling") ||
    lower.includes("jimeng") ||
    lower.includes("grok-imagine-video") ||
    lower.includes("wan2.1") ||
    lower.includes("wanx2") ||
    /\bwan[-_]?v?\d/.test(lower)
  );
}

function modelLooksLikeImageGeneration(modelId: string, ownedBy: string, baseUrl: string): boolean {
  const lower = modelId.toLowerCase();
  const ownerLower = ownedBy.toLowerCase();
  if (modelLooksLikeVideo(modelId, ownedBy)) return false;
  if (lower.includes("flux") || lower.includes("image") || lower.includes("dall")) return true;
  if (ownerLower.includes("black-forest") || ownerLower.includes("stabilityai")) return true;
  if (baseUrl.includes("modelscope.cn") && (lower.includes("wanx") || lower.includes("cogview"))) return true;
  return false;
}

function modelLooksLikeImageEdit(modelId: string, ownedBy: string): boolean {
  const lower = modelId.toLowerCase();
  const ownerLower = ownedBy.toLowerCase();
  if (modelLooksLikeVideo(modelId, ownedBy)) return false;
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
  if (modelLooksLikeVideo(modelId, ownedBy)) {
    return { ...EMPTY_DISCOVERED_ASSIGNMENT, video: true };
  }
  if (modelLooksLikeImageEdit(modelId, ownedBy)) {
    return { ...EMPTY_DISCOVERED_ASSIGNMENT, edit: true };
  }
  if (modelLooksLikeImageGeneration(modelId, ownedBy, baseUrl)) {
    return { ...EMPTY_DISCOVERED_ASSIGNMENT, generate: true };
  }
  return { ...EMPTY_DISCOVERED_ASSIGNMENT, chat: true };
}

function assignmentToCapabilities(modelId: string, ownedBy: string, assignment: DiscoveredModelAssignment): string[] {
  const caps: string[] = [];
  if (assignment.generate) caps.push("image.generate");
  if (assignment.edit) caps.push("image.edit");
  if (assignment.chat) caps.push("chat.completions");
  if (assignment.video) caps.push("video.generate");
  if (caps.length === 0) {
    const guess = guessDiscoveredModelAssignment(modelId, ownedBy, "");
    if (guess.generate) caps.push("image.generate");
    if (guess.edit) caps.push("image.edit");
    if (guess.chat) caps.push("chat.completions");
    if (guess.video) caps.push("video.generate");
  }
  return caps;
}

function assignmentLabel(assignment: DiscoveredModelAssignment): string {
  const parts: string[] = [];
  if (assignment.generate) parts.push("生成页");
  if (assignment.edit) parts.push("图像编辑");
  if (assignment.chat) parts.push("Chat");
  if (assignment.video) parts.push("视频");
  return parts.length > 0 ? parts.join(" + ") : "未分配";
}

function resolveDiscoverImportTransport(
  modelId: string,
  baseUrl: string,
  capabilities: string[]
): { adapter_kind: string; strategies: Record<string, string>; reference_mode: string } {
  if (!capabilities.includes("video.generate")) {
    return {
      adapter_kind: "openai_compatible",
      strategies: {},
      reference_mode: capabilities.includes("image.generate") && baseUrl.includes("modelscope.cn") ? "caption_prompt" : "disabled",
    };
  }

  const identity = `${modelId} ${baseUrl}`.toLowerCase();
  if (identity.includes("jimeng") || (identity.includes("cv") && identity.includes("volc"))) {
    return {
      adapter_kind: "jimeng_native",
      strategies: { "video.generate": "volcengine_cv_jimeng_video" },
      reference_mode: "disabled",
    };
  }
  // Seedance 2 ToAPI on Haodeya → /v1/videos (not Ark tasks). Prefer before generic "seedance"→Ark.
  // Exclude Volc Plan names like doubao-seedance-2.0-* (substring "seedance-2" would false-match).
  const isVolcSeedancePlan =
    identity.includes("doubao-seedance") || identity.includes("seedance-2.0");
  if (
    !isVolcSeedancePlan &&
    (identity.includes("seedance-2") ||
      (identity.includes("seedance") && identity.includes("haodeya")))
  ) {
    return {
      adapter_kind: "haodeya_grok",
      strategies: { "video.generate": "haodeya_grok_video" },
      reference_mode: "disabled",
    };
  }
  if (identity.includes("ark") || identity.includes("seedance") || identity.includes("volces.com")) {
    return {
      adapter_kind: "volcengine_ark",
      strategies: { "video.generate": "volcengine_ark_video_tasks" },
      reference_mode: "disabled",
    };
  }
  if (
    (identity.includes("dashscope") || identity.includes("aliyuncs.com")) &&
    !identity.includes("haodeya")
  ) {
    return {
      adapter_kind: "dashscope_native",
      strategies: { "video.generate": "dashscope_async_video" },
      reference_mode: "disabled",
    };
  }
  return {
    adapter_kind: "haodeya_grok",
    strategies: { "video.generate": "haodeya_grok_video" },
    reference_mode: "disabled",
  };
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
  return metric;
}

function parseAdapterConfigObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed) as Record<string, unknown>;
}

function readAdapterConfigPrice(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function stripManagedAdapterConfigKeys(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config };
  for (const key of MANAGED_ADAPTER_CONFIG_KEYS) {
    delete next[key];
  }
  return next;
}

function stripPricingTierKeys(config: Record<string, unknown>): Record<string, unknown> {
  return stripManagedAdapterConfigKeys(config);
}

function readAdapterConfigText(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function assignAdapterConfigText(config: Record<string, unknown>, key: string, raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed) {
    delete config[key];
    return;
  }
  config[key] = trimmed;
}

function assignAdapterConfigPrice(config: Record<string, unknown>, key: string, raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed) {
    delete config[key];
    return;
  }
  config[key] = Number(trimmed);
}

function assignSupportedResolutionsFromDraft(
  config: Record<string, unknown>,
  draft: ProviderProfileDraft
): void {
  const selected: string[] = [];
  if (draft.supportedResolution1k) selected.push("1k");
  if (draft.supportedResolution2k) selected.push("2k");
  if (draft.supportedResolution4k) selected.push("4k");
  if (selected.length > 0) {
    config.supported_resolutions = selected;
  } else {
    delete config.supported_resolutions;
  }
}

function buildAdapterConfigFromDraft(draft: ProviderProfileDraft): Record<string, unknown> {
  const config = stripManagedAdapterConfigKeys(parseAdapterConfigObject(draft.adapterConfig));
  assignAdapterConfigPrice(config, "unit_price_1k", draft.unitPrice1k);
  assignAdapterConfigPrice(config, "unit_price_2k", draft.unitPrice2k);
  assignAdapterConfigPrice(config, "unit_price_4k", draft.unitPrice4k);
  if (profileHasImageBilling(parseCapabilities(draft.capabilities))) {
    assignSupportedResolutionsFromDraft(config, draft);
  } else {
    delete config.supported_resolutions;
  }
  assignAdapterConfigText(config, "upstream_model_1k", draft.upstreamModel1k);
  assignAdapterConfigText(config, "upstream_model_2k", draft.upstreamModel2k);
  assignAdapterConfigText(config, "upstream_model_4k", draft.upstreamModel4k);
  assignAdapterConfigText(config, "upstream_sku_i2v_5s", draft.upstreamSkuI2v5s);
  assignAdapterConfigText(config, "upstream_sku_i2v_10s", draft.upstreamSkuI2v10s);
  assignAdapterConfigText(config, "upstream_sku_ref_5s", draft.upstreamSkuRef5s);
  assignAdapterConfigText(config, "upstream_sku_ref_10s", draft.upstreamSkuRef10s);
  return config;
}

function adapterConfigHelpText(hasImageBilling: boolean, hasVideoBilling: boolean): string {
  if (hasImageBilling && hasVideoBilling) {
    return "分档单价、生图 1K/2K/4K 上游模型、视频四档 SKU 映射请在下方填写；此处仅保留 flavor / 轮询路径等其它字段。";
  }
  if (hasImageBilling) {
    return "分档单价、生图 1K/2K/4K 上游模型映射请在下方填写；此处仅保留 flavor / 轮询路径等其它字段。";
  }
  if (hasVideoBilling) {
    return "分档单价（5s/10s）、视频四档 SKU 映射请在下方填写；此处仅保留 flavor / 轮询路径等其它字段。";
  }
  return "此处填写 adapter 扩展 JSON（如 flavor、轮询路径）。Chat 渠道通常无需上游模型映射。";
}

function profileUsesVideoTierPricing(capabilities: string[], adapterKind: string): boolean {
  return profileHasVideoBilling(capabilities) || adapterKind === "haodeya_grok";
}

function profileHasImageBilling(capabilities: string[]): boolean {
  return capabilities.some((capability) => capability === "image.generate" || capability === "image.edit");
}

function profileHasVideoBilling(capabilities: string[]): boolean {
  return capabilities.includes("video.generate");
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
    currency: draft.currency.trim() || "CNY",
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
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<ProviderProfilePreviewRequestResult | null>(null);
  const [previewResolution, setPreviewResolution] = useState("2k");
  const [previewAspectRatio, setPreviewAspectRatio] = useState("1:1");
  const [previewHasReference, setPreviewHasReference] = useState(false);
  const [modelFilters, setModelFilters] = useState<ModelFilterState>({ search: "", capability: "all", adapterKind: "all", status: "all" });
  const [discoverPanelOpen, setDiscoverPanelOpen] = useState(false);
  const [discoverBaseUrl, setDiscoverBaseUrl] = useState(() => {
    try {
      return localStorage.getItem("qmdh.discover.baseUrl") ?? "";
    } catch {
      return "";
    }
  });
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
  const [discoverListFilter, setDiscoverListFilter] = useState<"new" | "all" | "exists">("new");
  const [discoverSearch, setDiscoverSearch] = useState("");
  const [detailPanelTab, setDetailPanelTab] = useState<DetailPanelTab>("model");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

  const enabledProviderProfiles = providerProfiles.filter((p) => p.enabled);
  const disabledProviderProfiles = providerProfiles.filter((p) => !p.enabled);
  const chatProviderProfiles = providerProfiles.filter((p) => p.capabilities.includes("chat.completions"));
  const chatProviderProfileCount = chatProviderProfiles.length;
  const imageProviderProfileCount = providerProfiles.filter((p) => p.capabilities.some((c) => c === "image.generate" || c === "image.edit")).length;
  const experimentalProviderProfileCount = providerProfiles.filter((p) => {
    const support = summarizeProfileSupport(p.adapter_kind, p.capabilities);
    return support !== "ready" || p.capabilities.includes("video.generate");
  }).length;
  const knownDiscoverBaseUrls = Array.from(
    new Set(providerProfiles.map((profile) => profile.base_url.trim()).filter(Boolean))
  ).slice(0, 8);
  const discoveredNewCount = discoveredModels.filter((model) => !model.already_exists).length;
  const discoveredExistsCount = discoveredModels.length - discoveredNewCount;
  const filteredDiscoveredModels = discoveredModels.filter((model) => {
    if (discoverListFilter === "new" && model.already_exists) return false;
    if (discoverListFilter === "exists" && !model.already_exists) return false;
    const query = discoverSearch.trim().toLowerCase();
    if (!query) return true;
    return `${model.model_id} ${model.owned_by}`.toLowerCase().includes(query);
  });

  useEffect(() => {
    if (pricingRuleDraft.providerProfileId || chatProviderProfiles.length === 0) return;
    setPricingRuleDraft((current) => ({
      ...current,
      providerProfileId: String(chatProviderProfiles[0].id),
    }));
  }, [pricingRuleDraft.providerProfileId, chatProviderProfiles]);

  const draftCapabilities = parseCapabilities(providerDraft.capabilities);
  const draftHasImageBilling = profileHasImageBilling(draftCapabilities);
  const draftHasVideoBilling = profileUsesVideoTierPricing(draftCapabilities, providerDraft.adapterKind);
  const draftHasTierBilling = draftHasImageBilling || draftHasVideoBilling;
  const draftHasImageCapability =
    draftCapabilities.includes("image.generate") || draftCapabilities.includes("image.edit");
  const draftHasVideoCapability = draftCapabilities.includes("video.generate");
  const draftHasChatCapability = draftCapabilities.includes("chat.completions");
  const draftNeedsApiSecret = providerDraft.adapterKind === "jimeng_native";
  const showPresets = editingProviderProfileId === null;
  const imageStrategyPresetId = matchStrategyPreset(
    providerDraft.strategies,
    "image.generate",
    IMAGE_STRATEGY_PRESETS
  );
  const videoStrategyPresetId = matchStrategyPreset(
    providerDraft.strategies,
    "video.generate",
    VIDEO_STRATEGY_PRESETS
  );
  const chatStrategyPresetId = matchStrategyPreset(providerDraft.strategies, "chat", CHAT_STRATEGY_PRESETS);
  const showStrategiesEditor =
    draftHasImageCapability || draftHasVideoCapability || draftHasChatCapability;

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
    (editingProviderProfileId !== null && draftCapabilities.includes("chat.completions")
      ? String(editingProviderProfileId)
      : chatProviderProfiles[0]
        ? String(chatProviderProfiles[0].id)
        : "");
  const filteredPricingRules = pricingRules
    .filter(
      (rule) =>
        String(rule.provider_profile_id) === selectedPricingProfileId &&
        rule.capability === "chat.completions"
    )
    .sort((left, right) => left.metric.localeCompare(right.metric));

  function renderBillingSummary(profile: ProviderProfileRecord) {
    const hasImageCapability = profileHasImageBilling(profile.capabilities);
    const hasVideoCapability = profileHasVideoBilling(profile.capabilities);
    const adapterConfig = profile.adapter_config ?? {};
    const unitPrice1k = readAdapterConfigPrice(adapterConfig, "unit_price_1k") || String(profile.unit_price ?? 0);
    const unitPrice2k = readAdapterConfigPrice(adapterConfig, "unit_price_2k");
    const chatRuleCount = pricingRules.filter(
      (rule) => rule.provider_profile_id === profile.id && rule.capability === "chat.completions" && rule.is_active
    ).length;
    const currency = profile.pricing_currency || "CNY";
    return (
      <>
        {hasImageCapability ? (
          <>
            <strong>{unitPrice2k ? `1K ${unitPrice1k} / 2K ${unitPrice2k}` : `${unitPrice1k} ${currency}`}</strong>
            <small>{`图片 ${formatPricingUnitLabel(profile.pricing_unit)}`}</small>
          </>
        ) : null}
        {hasVideoCapability ? (
          <>
            <strong>
              {unitPrice2k
                ? `5s ${unitPrice1k} / 10s ${unitPrice2k} ${currency}`
                : `${unitPrice1k} ${currency}`}
            </strong>
            <small>{`视频 ${formatPricingUnitLabel(profile.pricing_unit)}`}</small>
          </>
        ) : null}
        {!hasImageCapability && !hasVideoCapability ? (
          <>
            <strong>按下方规则</strong>
            <small>任务单价未配置</small>
          </>
        ) : null}
        {profile.capabilities.includes("chat.completions") ? <small>{`Chat 规则 ${chatRuleCount} 条`}</small> : null}
      </>
    );
  }

  const activeProviderSupport = summarizeProfileSupport(providerDraft.adapterKind, parseCapabilities(providerDraft.capabilities));
  const activeAdapterOption = getAdapterOption(providerDraft.adapterKind);

  function resetProviderProfileDraft() {
    setEditingProviderProfileId(null);
    setProviderDraft(defaultProviderProfileDraft);
    setSelectedPresetId(null);
    setMoreOptionsOpen(false);
    setDetailPanelTab("model");
  }

  function applyModelPreset(presetId: string) {
    const preset = modelPresets.find((item) => item.id === presetId);
    if (!preset) {
      setSelectedPresetId(null);
      return;
    }
    setProviderDraft((current) => ({
      ...defaultProviderProfileDraft,
      ...preset.draft,
      apiKey: current.apiKey,
      apiSecret: current.apiSecret,
      enabled: current.enabled,
      unitPrice1k: current.unitPrice1k,
      unitPrice2k: current.unitPrice2k,
      unitPrice4k: current.unitPrice4k,
    }));
    setSelectedPresetId(preset.id);
    setMoreOptionsOpen(false);
    setDetailPanelTab("model");
  }

  function resetPricingRuleDraft(profileId?: number | null) {
    setEditingPricingRuleId(null);
    const defaultProfileId =
      profileId ??
      (editingProviderProfileId !== null && draftCapabilities.includes("chat.completions")
        ? editingProviderProfileId
        : chatProviderProfiles[0]?.id ?? null);
    setPricingRuleDraft({
      ...defaultPricingRuleDraft,
      providerProfileId: defaultProfileId ? String(defaultProfileId) : "",
    });
  }


  function handleEditProviderProfile(profile: ProviderProfileRecord) {
    setEditingProviderProfileId(profile.id);
    setProviderDraft(toProviderProfileDraft(profile));
    setSelectedPresetId(null);
    setMoreOptionsOpen(false);
    setPreviewResult(null);
    setPricingRuleDraft((current) => ({ ...current, providerProfileId: String(profile.id) }));
    setDetailPanelTab("model");
  }

  function handleEditPricingRule(rule: ProviderPricingRuleRecord) {
    setEditingPricingRuleId(rule.id);
    setPricingRuleDraft(toPricingRuleDraft(rule));
    setDetailPanelTab("chat-billing");
  }

  async function handleSaveProviderProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let payload: ProviderProfileCreatePayload;
    try {
      payload = toProviderProfilePayload(providerDraft);
    } catch {
      onSetError("Strategies / Adapter Config 必须是合法 JSON");
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
    const payload = toPricingRulePayload({
      ...pricingRuleDraft,
      capability: "chat.completions",
    });
    if (!payload.provider_profile_id || !payload.metric) {
      onSetError("请先选择 Chat 模型并填写 token 指标和单价");
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

  async function handlePreviewProviderRequest() {
    if (editingProviderProfileId === null) return;
    setPreviewLoading(true);
    try {
      const result = await api.previewProviderProfileRequest(editingProviderProfileId, {
        capability: draftHasImageBilling
          ? draftCapabilities.includes("image.edit") && !draftCapabilities.includes("image.generate")
            ? "image.edit"
            : "image.generate"
          : "image.generate",
        resolution: previewResolution,
        aspect_ratio: previewAspectRatio,
        has_reference: previewHasReference,
      });
      setPreviewResult(result);
      onSetError("");
    } catch (err) {
      setPreviewResult(null);
      onSetError(err instanceof Error ? err.message : "预览请求体失败");
    } finally {
      setPreviewLoading(false);
    }
  }

  function probeTone(status: string): SupportLevel {
    if (status === "ok" || status === "configured") return "ready";
    if (status === "auth_error" || status === "invalid_key" || status === "missing_key") return "partial";
    return "planned";
  }

  async function handleDiscoverModels(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDiscoverError("");
    setDiscoveredModels([]);
    setDiscoveredAssignments({});
    setSelectedModelIds(new Set());
    setImportResult(null);
    setDiscoverSearch("");
    setDiscoverListFilter("new");
    setDiscoverLoading(true);
    try {
      const trimmedUrl = discoverBaseUrl.trim();
      const result = await api.discoverProviderModels(trimmedUrl, discoverApiKey.trim());
      setDiscoveredModels(result.models);
      setDiscoveredAssignments(
        Object.fromEntries(
          result.models.map((m) => [m.model_id, guessDiscoveredModelAssignment(m.model_id, m.owned_by, result.base_url)])
        )
      );
      setDiscoverBaseUrlForImport(result.base_url);
      setDiscoverApiKeyForImport(discoverApiKey.trim());
      setDiscoverBaseUrl(result.base_url);
      try {
        localStorage.setItem("qmdh.discover.baseUrl", result.base_url);
      } catch {
        /* ignore */
      }
      setSelectedModelIds(new Set(result.models.filter((m) => !m.already_exists).map((m) => m.model_id)));
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : "探测失败");
    } finally {
      setDiscoverLoading(false);
    }
  }

  function toggleModelSelection(modelId: string) {
    setSelectedModelIds((current) => {
      const next = new Set(current);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }

  function selectVisibleNewModels() {
    setSelectedModelIds(
      new Set(filteredDiscoveredModels.filter((model) => !model.already_exists).map((model) => model.model_id))
    );
  }

  function updateDiscoveredAssignment(modelId: string, patch: Partial<DiscoveredModelAssignment>) {
    setDiscoveredAssignments((current) => ({
      ...current,
      [modelId]: { ...(current[modelId] ?? EMPTY_DISCOVERED_ASSIGNMENT), ...patch },
    }));
  }

  function applyAssignmentToSelected(assignment: DiscoveredModelAssignment) {
    if (selectedModelIds.size === 0) return;
    setDiscoveredAssignments((current) => {
      const next = { ...current };
      for (const modelId of selectedModelIds) {
        next[modelId] = { ...assignment };
      }
      return next;
    });
  }

  function buildProviderName(baseUrl: string, modelId: string): string {
    const slug = modelId.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").toLowerCase();
    return baseUrl.includes("modelscope.cn") ? `ms_${slug}` : slug;
  }

  async function handleBulkImport() {
    if (selectedModelIds.size === 0) return;
    setImportingModels(true);
    setImportResult(null);
    try {
      const items: ProviderBulkImportItem[] = discoveredModels
        .filter((m) => selectedModelIds.has(m.model_id) && !m.already_exists)
        .map((m) => {
          const assignment = discoveredAssignments[m.model_id] ?? EMPTY_DISCOVERED_ASSIGNMENT;
          const capabilities = assignmentToCapabilities(m.model_id, m.owned_by, assignment);
          const transport = resolveDiscoverImportTransport(m.model_id, discoverBaseUrlForImport, capabilities);
          return {
            model_id: m.model_id,
            provider_name: buildProviderName(discoverBaseUrlForImport, m.model_id),
            display_name: m.model_id,
            capabilities,
            adapter_kind: transport.adapter_kind,
            reference_mode: transport.reference_mode,
            strategies: transport.strategies,
          };
        });
      const unassigned = items.filter((item) => item.capabilities.length === 0).map((item) => item.model_id);
      if (unassigned.length > 0) {
        setDiscoverError(`以下模型尚未分配：${unassigned.join(", ")}`);
        setImportingModels(false);
        return;
      }
      const result = await api.bulkImportProviderProfiles({
        base_url: discoverBaseUrlForImport,
        api_key: discoverApiKeyForImport,
        models: items,
      });
      setImportResult(result);
      const createdSet = new Set(result.created);
      setDiscoveredModels((current) =>
        current.map((model) =>
          createdSet.has(model.model_id) || result.skipped.includes(model.model_id)
            ? { ...model, already_exists: true }
            : model
        )
      );
      setSelectedModelIds(new Set());
      onRefresh();
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : "批量导入失败");
    } finally {
      setImportingModels(false);
    }
  }

  return (
    <section className="admin-page">
      {providerProfiles.some((profile) => profile.adapter_kind === "comfyui") ? <ComfyOperations /> : null}
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
            <p className="discover-hint">
              重复探测同一上游时，默认只看「未导入」；勾选后可批量设分类再导入。Seedance 2
              请用预设「Seedance 2（Haodeya）」统一 profile；探测到的
              seedance-2-*-5s/10s 等杂 SKU 可不导入或停用，Studio 有统一 profile 时会隐藏它们。
            </p>
            {knownDiscoverBaseUrls.length > 0 ? (
              <div className="discover-known-urls">
                <span>已用过的地址：</span>
                {knownDiscoverBaseUrls.map((url) => (
                  <button
                    key={url}
                    type="button"
                    className={`discover-url-chip${discoverBaseUrl === url ? " is-on" : ""}`}
                    onClick={() => setDiscoverBaseUrl(url)}
                    title={url}
                  >
                    {url.replace(/^https?:\/\//, "").slice(0, 42)}
                    {url.replace(/^https?:\/\//, "").length > 42 ? "…" : ""}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="discover-form-row">
              <label className="composer-menu-field discover-url-field">
                <span>Base URL</span>
                <input
                  value={discoverBaseUrl}
                  onChange={(e) => setDiscoverBaseUrl(e.target.value)}
                  placeholder="https://newapi.haodeya.xyz/v1"
                  autoComplete="off"
                  required
                />
              </label>
              <label className="composer-menu-field discover-key-field">
                <span>API Key</span>
                <input
                  type="password"
                  value={discoverApiKey}
                  onChange={(e) => setDiscoverApiKey(e.target.value)}
                  placeholder="sk-..."
                  autoComplete="new-password"
                  required
                />
              </label>
              <button type="submit" className="submit-button discover-submit-btn" disabled={discoverLoading}>
                {discoverLoading ? "探测中..." : "探测"}
              </button>
            </div>
            {discoverError ? <p className="discover-error">{discoverError}</p> : null}
          </form>
          {discoveredModels.length > 0 ? (
            <div className="discover-results">
              <div className="discover-results-head">
                <span>
                  共 {discoveredModels.length} · 未导入 {discoveredNewCount} · 已导入 {discoveredExistsCount} · 已选{" "}
                  {selectedModelIds.size}
                </span>
                <div className="discover-results-actions">
                  <button type="button" className="ghost-button" onClick={selectVisibleNewModels}>
                    全选当前未导入
                  </button>
                  <button type="button" className="ghost-button" onClick={() => setSelectedModelIds(new Set())}>
                    取消全选
                  </button>
                  <button
                    type="button"
                    className="submit-button"
                    disabled={selectedModelIds.size === 0 || importingModels}
                    onClick={() => void handleBulkImport()}
                  >
                    {importingModels ? "导入中..." : `导入选中 (${selectedModelIds.size})`}
                  </button>
                </div>
              </div>
              <div className="discover-toolbar">
                <div className="discover-filter-tabs" role="tablist" aria-label="探测结果筛选">
                  <button
                    type="button"
                    className={discoverListFilter === "new" ? "is-active" : ""}
                    onClick={() => setDiscoverListFilter("new")}
                  >
                    未导入 ({discoveredNewCount})
                  </button>
                  <button
                    type="button"
                    className={discoverListFilter === "all" ? "is-active" : ""}
                    onClick={() => setDiscoverListFilter("all")}
                  >
                    全部 ({discoveredModels.length})
                  </button>
                  <button
                    type="button"
                    className={discoverListFilter === "exists" ? "is-active" : ""}
                    onClick={() => setDiscoverListFilter("exists")}
                  >
                    已导入 ({discoveredExistsCount})
                  </button>
                </div>
                <input
                  className="discover-search"
                  aria-label="搜索探测结果"
                  placeholder="搜索 model id…"
                  value={discoverSearch}
                  onChange={(e) => setDiscoverSearch(e.target.value)}
                />
              </div>
              <div className="discover-bulk-assign">
                <span>对已选批量设分类：</span>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={selectedModelIds.size === 0}
                  onClick={() => applyAssignmentToSelected({ ...EMPTY_DISCOVERED_ASSIGNMENT, chat: true })}
                >
                  Chat
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={selectedModelIds.size === 0}
                  onClick={() => applyAssignmentToSelected({ ...EMPTY_DISCOVERED_ASSIGNMENT, generate: true })}
                >
                  生成页
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={selectedModelIds.size === 0}
                  onClick={() => applyAssignmentToSelected({ ...EMPTY_DISCOVERED_ASSIGNMENT, edit: true })}
                >
                  图像编辑
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={selectedModelIds.size === 0}
                  onClick={() =>
                    applyAssignmentToSelected({ ...EMPTY_DISCOVERED_ASSIGNMENT, generate: true, edit: true })
                  }
                >
                  生成+编辑
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={selectedModelIds.size === 0}
                  onClick={() => applyAssignmentToSelected({ ...EMPTY_DISCOVERED_ASSIGNMENT, video: true })}
                >
                  视频
                </button>
              </div>
              {importResult ? (
                <p className="discover-import-result">
                  ✓ 已导入 {importResult.created.length} 个
                  {importResult.created.length > 0 ? `：${importResult.created.slice(0, 8).join(", ")}${importResult.created.length > 8 ? "…" : ""}` : ""}
                  {importResult.skipped.length > 0 ? `；跳过已存在 ${importResult.skipped.length} 个` : ""}
                </p>
              ) : null}
              <div className="discover-model-list">
                {filteredDiscoveredModels.length > 0 ? (
                  filteredDiscoveredModels.map((model) => (
                    <div
                      key={model.model_id}
                      className={`discover-model-item${model.already_exists ? " discover-model-exists" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedModelIds.has(model.model_id)}
                        disabled={model.already_exists}
                        onChange={() => toggleModelSelection(model.model_id)}
                      />
                      <div className="discover-model-main">
                        <span className="discover-model-id">{model.model_id}</span>
                        <div className="discover-model-meta">
                          {model.owned_by ? <span className="discover-model-owner">{model.owned_by}</span> : null}
                          <span className="discover-model-tag discover-model-tag-assignment">
                            {assignmentLabel(discoveredAssignments[model.model_id] ?? EMPTY_DISCOVERED_ASSIGNMENT)}
                          </span>
                          {model.already_exists ? <em className="discover-model-tag">已导入</em> : null}
                        </div>
                      </div>
                      {!model.already_exists ? (
                        <div className="discover-assignment" onClick={(e) => e.stopPropagation()}>
                          <label className="discover-assignment-option">
                            <input
                              type="checkbox"
                              checked={Boolean(discoveredAssignments[model.model_id]?.generate)}
                              onChange={(e) => updateDiscoveredAssignment(model.model_id, { generate: e.target.checked })}
                            />
                            <span>生成</span>
                          </label>
                          <label className="discover-assignment-option">
                            <input
                              type="checkbox"
                              checked={Boolean(discoveredAssignments[model.model_id]?.edit)}
                              onChange={(e) => updateDiscoveredAssignment(model.model_id, { edit: e.target.checked })}
                            />
                            <span>编辑</span>
                          </label>
                          <label className="discover-assignment-option">
                            <input
                              type="checkbox"
                              checked={Boolean(discoveredAssignments[model.model_id]?.chat)}
                              onChange={(e) => updateDiscoveredAssignment(model.model_id, { chat: e.target.checked })}
                            />
                            <span>Chat</span>
                          </label>
                          <label className="discover-assignment-option">
                            <input
                              type="checkbox"
                              checked={Boolean(discoveredAssignments[model.model_id]?.video)}
                              onChange={(e) => updateDiscoveredAssignment(model.model_id, { video: e.target.checked })}
                            />
                            <span>视频</span>
                          </label>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="template-empty">
                    {discoverListFilter === "new"
                      ? "没有未导入模型（或被搜索过滤掉了）。可切到「全部」查看。"
                      : "当前筛选下没有匹配模型。"}
                  </div>
                )}
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

        <aside className="admin-detail-panel admin-model-detail-panel">
          <div className="admin-detail-tabs" role="tablist" aria-label="模型配置面板">
            <button
              type="button"
              role="tab"
              aria-selected={detailPanelTab === "model"}
              className={detailPanelTab === "model" ? "is-active" : ""}
              onClick={() => setDetailPanelTab("model")}
            >
              模型配置
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={detailPanelTab === "chat-billing"}
              className={detailPanelTab === "chat-billing" ? "is-active" : ""}
              onClick={() => setDetailPanelTab("chat-billing")}
            >
              Chat 计费
            </button>
          </div>

          {detailPanelTab === "model" ? (
            <form className="admin-side-form model-compact-form" autoComplete="off" onSubmit={handleSaveProviderProfile}>
              <div className="admin-detail-head admin-detail-head-compact">
                <h2>{editingProviderProfileId === null ? "新增模型" : "编辑模型"}</h2>
              </div>

              <div className="model-form-grid model-form-grid-compact">
                {showPresets ? (
                  <label className="composer-menu-field composer-menu-field-full">
                    <span>预设</span>
                    <select
                      value={selectedPresetId ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) {
                          setSelectedPresetId(null);
                          return;
                        }
                        applyModelPreset(value);
                      }}
                    >
                      <option value="">自选 / 空白</option>
                      {modelPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.category} · {preset.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="composer-menu-field">
                  <span>显示名</span>
                  <input
                    value={providerDraft.displayName}
                    onChange={(e) => setProviderDraft((c) => ({ ...c, displayName: e.target.value }))}
                    placeholder="HappyHorse 1.1"
                    autoComplete="off"
                  />
                </label>
                <label className="composer-menu-field">
                  <span>Provider 标识</span>
                  <input
                    value={providerDraft.providerName}
                    disabled={editingProviderProfileId !== null}
                    onChange={(e) => setProviderDraft((c) => ({ ...c, providerName: e.target.value }))}
                    placeholder="haodeya_happyhorse"
                    autoComplete="off"
                  />
                </label>
                <label className="composer-menu-field">
                  <span>上游 Model</span>
                  <input
                    value={providerDraft.modelName}
                    onChange={(e) => setProviderDraft((c) => ({ ...c, modelName: e.target.value }))}
                    placeholder="happyhorse-1.1"
                    autoComplete="off"
                  />
                </label>
                <label className="composer-menu-field">
                  <span>Adapter</span>
                  <select
                    value={providerDraft.adapterKind}
                    onChange={(e) => setProviderDraft((c) => ({ ...c, adapterKind: e.target.value }))}
                  >
                    {adapterOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="composer-menu-field composer-menu-field-full">
                  <span>Base URL</span>
                  <input
                    name="provider-base-url"
                    value={providerDraft.baseUrl}
                    onChange={(e) => setProviderDraft((c) => ({ ...c, baseUrl: e.target.value }))}
                    placeholder="https://newapi.haodeya.xyz/v1"
                    autoComplete="off"
                  />
                </label>
                <label className="composer-menu-field composer-menu-field-full">
                  <span>API Key</span>
                  <input
                    name="provider-api-key"
                    type="password"
                    value={providerDraft.apiKey}
                    autoComplete="new-password"
                    onChange={(e) => setProviderDraft((c) => ({ ...c, apiKey: e.target.value }))}
                    placeholder={editingProviderProfileId === null ? "必填" : "留空保留原 Key"}
                  />
                </label>

                <div className="composer-menu-field composer-menu-field-full">
                  <span>出现在</span>
                  <div className="capability-chip-row">
                    {capabilityDefinitions.map((def) => {
                      const checked = hasCapability(providerDraft.capabilities, def.key);
                      return (
                        <button
                          key={def.key}
                          type="button"
                          className={`capability-chip${checked ? " is-on" : ""}`}
                          onClick={() =>
                            setProviderDraft((c) => ({
                              ...c,
                              capabilities: toggleCapability(c.capabilities, def.key, !checked),
                            }))
                          }
                        >
                          {def.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {draftHasTierBilling ? (
                  <>
                    <label className="composer-menu-field">
                      <span>{draftHasImageBilling && !draftHasVideoBilling ? "1K 单价" : draftHasVideoBilling && !draftHasImageBilling ? "5s 单价" : "1K/5s 单价"}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={providerDraft.unitPrice1k}
                        onChange={(e) => setProviderDraft((c) => ({ ...c, unitPrice1k: e.target.value }))}
                        placeholder="0"
                      />
                    </label>
                    <label className="composer-menu-field">
                      <span>{draftHasImageBilling && !draftHasVideoBilling ? "2K 单价" : draftHasVideoBilling && !draftHasImageBilling ? "10s 单价" : "2K/10s 单价"}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={providerDraft.unitPrice2k}
                        onChange={(e) => setProviderDraft((c) => ({ ...c, unitPrice2k: e.target.value }))}
                        placeholder="0"
                      />
                    </label>
                    {draftHasImageBilling ? (
                      <label className="composer-menu-field">
                        <span>4K 单价</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={providerDraft.unitPrice4k}
                          onChange={(e) => setProviderDraft((c) => ({ ...c, unitPrice4k: e.target.value }))}
                          placeholder="可空"
                        />
                      </label>
                    ) : null}
                    {draftHasImageBilling ? (
                      <div className="composer-menu-field composer-menu-field-full">
                        <span>支持档位</span>
                        <div className="capability-chip-row">
                          {(
                            [
                              ["supportedResolution1k", "1K"],
                              ["supportedResolution2k", "2K"],
                              ["supportedResolution4k", "4K"],
                            ] as const
                          ).map(([key, label]) => {
                            const checked = providerDraft[key];
                            return (
                              <button
                                key={key}
                                type="button"
                                className={`capability-chip${checked ? " is-on" : ""}`}
                                onClick={() =>
                                  setProviderDraft((current) => ({ ...current, [key]: !current[key] }))
                                }
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="admin-form-help">
                          未勾选的档位不会出现在 Studio/Canvas；若全部取消则回退默认（通常 1K+2K）。
                        </p>
                      </div>
                    ) : null}
                    <label className="composer-menu-field">
                      <span>币种</span>
                      <input
                        value={providerDraft.pricingCurrency}
                        onChange={(e) => setProviderDraft((c) => ({ ...c, pricingCurrency: e.target.value }))}
                        placeholder="CNY"
                      />
                    </label>
                  </>
                ) : draftHasChatCapability ? (
                  <p className="admin-form-help composer-menu-field-full">Chat 单价请切到「Chat 计费」页。</p>
                ) : null}
              </div>

              {showStrategiesEditor ? (
                <div className="model-form-grid model-form-grid-compact" style={{ marginTop: 12 }}>
                  {draftHasImageCapability ? (
                    <div className="composer-menu-field composer-menu-field-full">
                      <span>生图策略</span>
                      <div className="capability-chip-row">
                        {IMAGE_STRATEGY_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={`capability-chip${imageStrategyPresetId === preset.id ? " is-on" : ""}`}
                            title={preset.hint}
                            onClick={() => {
                              if (preset.strategy === "__custom__") {
                                setMoreOptionsOpen(true);
                                return;
                              }
                              setProviderDraft((current) => ({
                                ...current,
                                strategies: applyStrategyPreset(current.strategies, "image.generate", preset, {
                                  syncImageEdit: true,
                                }),
                              }));
                            }}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <p className="admin-form-help">
                        {IMAGE_STRATEGY_PRESETS.find((item) => item.id === imageStrategyPresetId)?.hint ??
                          "自定义 JSON"}
                        。VIP 用比例 size；DeepKey count 必须像素 size（如 1024x1024）。选「自动」按模型名推断。
                      </p>
                    </div>
                  ) : null}
                  {draftHasVideoCapability ? (
                    <div className="composer-menu-field composer-menu-field-full">
                      <span>视频策略</span>
                      <div className="capability-chip-row">
                        {VIDEO_STRATEGY_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={`capability-chip${videoStrategyPresetId === preset.id ? " is-on" : ""}`}
                            title={preset.hint}
                            onClick={() => {
                              if (preset.strategy === "__custom__") {
                                setMoreOptionsOpen(true);
                                return;
                              }
                              setProviderDraft((current) => ({
                                ...current,
                                strategies: applyStrategyPreset(current.strategies, "video.generate", preset),
                              }));
                            }}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <p className="admin-form-help">
                        {VIDEO_STRATEGY_PRESETS.find((item) => item.id === videoStrategyPresetId)?.hint ??
                          "自定义 JSON"}
                      </p>
                    </div>
                  ) : null}
                  {draftHasChatCapability ? (
                    <div className="composer-menu-field composer-menu-field-full">
                      <span>Chat 策略</span>
                      <div className="capability-chip-row">
                        {CHAT_STRATEGY_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={`capability-chip${chatStrategyPresetId === preset.id ? " is-on" : ""}`}
                            title={preset.hint}
                            onClick={() => {
                              if (preset.strategy === "__custom__") {
                                setMoreOptionsOpen(true);
                                return;
                              }
                              setProviderDraft((current) => ({
                                ...current,
                                strategies: applyStrategyPreset(current.strategies, "chat", preset),
                              }));
                            }}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <label className="composer-menu-field composer-menu-field-full">
                    <span>Strategies（可自定义）</span>
                    <textarea
                      rows={3}
                      value={providerDraft.strategies}
                      onChange={(e) => setProviderDraft((c) => ({ ...c, strategies: e.target.value }))}
                      placeholder={'{"image.generate":"haodeya_sync_image","image.edit":"haodeya_sync_image"}'}
                    />
                    <small>
                      点上方芯片会写入这里；也可直接改 JSON。短 body 策略会同步 image.edit。
                      不确定用下方「预览请求体」核对。
                    </small>
                  </label>
                </div>
              ) : null}

              <button
                type="button"
                className="model-more-toggle"
                aria-expanded={moreOptionsOpen}
                onClick={() => setMoreOptionsOpen((v) => !v)}
              >
                {moreOptionsOpen ? "收起更多选项" : "更多选项（Adapter / 超时…）"}
              </button>

              {moreOptionsOpen ? (
                <div className="model-form-grid model-form-grid-compact model-more-panel">
                  {draftNeedsApiSecret ? (
                    <label className="composer-menu-field composer-menu-field-full">
                      <span>API Secret</span>
                      <input
                        name="provider-api-secret"
                        type="password"
                        value={providerDraft.apiSecret}
                        autoComplete="new-password"
                        onChange={(e) => setProviderDraft((c) => ({ ...c, apiSecret: e.target.value }))}
                        placeholder="留空保留原 secret"
                      />
                    </label>
                  ) : null}
                  <label className="composer-menu-field">
                    <span>计费单位</span>
                    <select
                      value={providerDraft.pricingUnit}
                      onChange={(e) => setProviderDraft((c) => ({ ...c, pricingUnit: e.target.value }))}
                    >
                      <option value="per_image">按张图片</option>
                      <option value="per_video">按条视频</option>
                      <option value="per_request">按次请求</option>
                    </select>
                  </label>
                  <label className="composer-menu-field">
                    <span>超时（秒）</span>
                    <input
                      type="number"
                      min="30"
                      value={providerDraft.timeoutSeconds}
                      onChange={(e) =>
                        setProviderDraft((c) => ({ ...c, timeoutSeconds: Number(e.target.value) || 300 }))
                      }
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>Quality</span>
                    <input
                      value={providerDraft.quality}
                      onChange={(e) => setProviderDraft((c) => ({ ...c, quality: e.target.value }))}
                      placeholder="medium"
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>输出格式</span>
                    <select
                      value={providerDraft.outputFormat}
                      onChange={(e) => setProviderDraft((c) => ({ ...c, outputFormat: e.target.value }))}
                    >
                      <option value="png">png</option>
                      <option value="jpeg">jpeg</option>
                      <option value="webp">webp</option>
                      <option value="mp4">mp4</option>
                    </select>
                  </label>
                  <label className="composer-menu-field">
                    <span>参考图模式</span>
                    <select
                      value={providerDraft.referenceMode}
                      onChange={(e) => setProviderDraft((c) => ({ ...c, referenceMode: e.target.value }))}
                    >
                      <option value="disabled">disabled</option>
                      <option value="caption_prompt">caption_prompt</option>
                    </select>
                  </label>
                  <label className="composer-menu-field">
                    <span>Caption 模型</span>
                    <input
                      value={providerDraft.referenceCaptionModel}
                      onChange={(e) => setProviderDraft((c) => ({ ...c, referenceCaptionModel: e.target.value }))}
                      placeholder="可选"
                    />
                  </label>
                  <label className="composer-menu-field composer-menu-field-full">
                    <span>Adapter Config</span>
                    <textarea
                      rows={3}
                      value={providerDraft.adapterConfig}
                      onChange={(e) => setProviderDraft((c) => ({ ...c, adapterConfig: e.target.value }))}
                      placeholder="{}"
                    />
                    <small>{adapterConfigHelpText(draftHasImageBilling, draftHasVideoBilling)}</small>
                  </label>
                  {draftHasImageBilling ? (
                    <>
                      <label className="composer-menu-field">
                        <span>1K 上游模型</span>
                        <input
                          value={providerDraft.upstreamModel1k}
                          onChange={(e) => setProviderDraft((c) => ({ ...c, upstreamModel1k: e.target.value }))}
                          placeholder="留空=Model"
                          autoComplete="off"
                        />
                      </label>
                      <label className="composer-menu-field">
                        <span>2K 上游模型</span>
                        <input
                          value={providerDraft.upstreamModel2k}
                          onChange={(e) => setProviderDraft((c) => ({ ...c, upstreamModel2k: e.target.value }))}
                          placeholder="可选"
                          autoComplete="off"
                        />
                      </label>
                      <label className="composer-menu-field">
                        <span>4K 上游模型</span>
                        <input
                          value={providerDraft.upstreamModel4k}
                          onChange={(e) => setProviderDraft((c) => ({ ...c, upstreamModel4k: e.target.value }))}
                          placeholder="可选"
                          autoComplete="off"
                        />
                      </label>
                    </>
                  ) : null}
                  {draftHasVideoBilling ? (
                    <>
                      <label className="composer-menu-field">
                        <span>i2v 5s SKU</span>
                        <input
                          value={providerDraft.upstreamSkuI2v5s}
                          onChange={(e) => setProviderDraft((c) => ({ ...c, upstreamSkuI2v5s: e.target.value }))}
                          placeholder="可选"
                          autoComplete="off"
                        />
                      </label>
                      <label className="composer-menu-field">
                        <span>i2v 10s SKU</span>
                        <input
                          value={providerDraft.upstreamSkuI2v10s}
                          onChange={(e) => setProviderDraft((c) => ({ ...c, upstreamSkuI2v10s: e.target.value }))}
                          placeholder="可选"
                          autoComplete="off"
                        />
                      </label>
                      <label className="composer-menu-field">
                        <span>ref 5s SKU</span>
                        <input
                          value={providerDraft.upstreamSkuRef5s}
                          onChange={(e) => setProviderDraft((c) => ({ ...c, upstreamSkuRef5s: e.target.value }))}
                          placeholder="可选"
                          autoComplete="off"
                        />
                      </label>
                      <label className="composer-menu-field">
                        <span>ref 10s SKU</span>
                        <input
                          value={providerDraft.upstreamSkuRef10s}
                          onChange={(e) => setProviderDraft((c) => ({ ...c, upstreamSkuRef10s: e.target.value }))}
                          placeholder="可选"
                          autoComplete="off"
                        />
                      </label>
                    </>
                  ) : null}
                  <p className="admin-form-help composer-menu-field-full">
                    {activeAdapterOption.label} · {supportLevelLabel(activeProviderSupport)} — {activeAdapterOption.note}
                  </p>
                </div>
              ) : null}

              {editingProviderProfileId !== null && draftHasImageBilling ? (
                <div className="composer-menu-field composer-menu-field-full">
                  <span>完整请求体预览</span>
                  <div className="capability-chip-row" style={{ marginBottom: 8 }}>
                    {(["1k", "2k", "4k"] as const).map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        className={`capability-chip${previewResolution === tier ? " is-on" : ""}`}
                        onClick={() => setPreviewResolution(tier)}
                      >
                        {tier.toUpperCase()}
                      </button>
                    ))}
                    {(["1:1", "16:9", "9:16", "4:3"] as const).map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        className={`capability-chip${previewAspectRatio === ratio ? " is-on" : ""}`}
                        onClick={() => setPreviewAspectRatio(ratio)}
                      >
                        {ratio}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`capability-chip${previewHasReference ? " is-on" : ""}`}
                      onClick={() => setPreviewHasReference((value) => !value)}
                    >
                      含参考图
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={previewLoading}
                      onClick={() => void handlePreviewProviderRequest()}
                    >
                      {previewLoading ? "生成中..." : "预览请求体"}
                    </button>
                  </div>
                  {previewResult ? (
                    <>
                      <div
                        className="admin-form-help"
                        style={{
                          display: "grid",
                          gap: 4,
                          marginBottom: 8,
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: "rgba(37, 99, 235, 0.06)",
                          border: "1px solid rgba(37, 99, 235, 0.18)",
                        }}
                      >
                        <strong>{previewResult.strategy_label || previewResult.strategy || "未知策略"}</strong>
                        <span>
                          {previewResult.method} {previewResult.endpoint}
                        </span>
                        <span>
                          strategy=<code>{previewResult.strategy || "-"}</code>
                          {previewResult.adapter_mode ? (
                            <>
                              {" "}
                              · adapter=<code>{previewResult.adapter_mode}</code>
                            </>
                          ) : null}
                        </span>
                        <span>body 字段：{previewResult.body_shape || Object.keys(previewResult.body || {}).join(", ") || "-"}</span>
                        {previewResult.note ? <span>{previewResult.note}</span> : null}
                      </div>
                      <pre
                        className="admin-json-preview"
                        style={{
                          maxHeight: 280,
                          overflow: "auto",
                          padding: 12,
                          borderRadius: 8,
                          background: "rgba(0,0,0,0.04)",
                          fontSize: 12,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {JSON.stringify(previewResult.body, null, 2)}
                      </pre>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            JSON.stringify(previewResult.body, null, 2)
                          );
                        }}
                      >
                        复制 body
                      </button>
                    </>
                  ) : (
                    <p className="admin-form-help">
                      按当前已保存配置生成与生产一致的上游 body（只读）。预览会标明策略类型：聊天多模态（长）vs 异步生图（短）。
                    </p>
                  )}
                </div>
              ) : editingProviderProfileId !== null && draftHasVideoBilling && !draftHasImageBilling ? (
                <p className="admin-form-help composer-menu-field-full">视频能力本波仅支持图像请求体预览。</p>
              ) : null}

              <label className="model-toggle">
                <input
                  type="checkbox"
                  checked={providerDraft.enabled}
                  onChange={(e) => setProviderDraft((c) => ({ ...c, enabled: e.target.checked }))}
                />
                <span>启用</span>
              </label>
              <div className="template-editor-actions">
                <button type="submit" className="submit-button" disabled={savingProviderProfile}>
                  {savingProviderProfile ? "保存中..." : editingProviderProfileId === null ? "保存" : "更新"}
                </button>
                {editingProviderProfileId !== null ? (
                  <button type="button" className="ghost-button" onClick={resetProviderProfileDraft}>
                    取消
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <div className="admin-side-form model-chat-billing-panel">
              <div className="admin-detail-head admin-detail-head-compact">
                <h2>Chat Token 计费</h2>
              </div>
              <p className="admin-form-help">只影响对话。生图/视频在「模型配置」填分档价。</p>
              {chatProviderProfiles.length === 0 ? (
                <div className="template-empty">还没有 Chat 模型，先在模型配置勾选 Chat 并保存。</div>
              ) : (
                <>
                  <div className="template-list admin-template-list">
                    {filteredPricingRules.length > 0 ? (
                      filteredPricingRules.map((rule) => (
                        <div key={rule.id} className="template-list-item">
                          <button type="button" className="template-card template-card-main" onClick={() => handleEditPricingRule(rule)}>
                            <strong>chat.completions</strong>
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
                      ))
                    ) : (
                      <div className="template-empty">当前 Chat 模型还没有 token 规则。</div>
                    )}
                  </div>
                  <div className="template-editor-row template-editor-row-3">
                    <label className="composer-menu-field">
                      <span>Chat 模型</span>
                      <select
                        value={selectedPricingProfileId}
                        onChange={(e) =>
                          setPricingRuleDraft((current) => ({ ...current, providerProfileId: e.target.value }))
                        }
                      >
                        {chatProviderProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.display_name || profile.provider_name}
                          </option>
                        ))}
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
                        placeholder="CNY"
                      />
                    </label>
                  </div>
                  <label className="model-toggle">
                    <input
                      type="checkbox"
                      checked={pricingRuleDraft.isActive}
                      onChange={(e) => setPricingRuleDraft((current) => ({ ...current, isActive: e.target.checked }))}
                    />
                    <span>启用这条规则</span>
                  </label>
                  <div className="template-editor-actions">
                    <button
                      type="button"
                      className="submit-button"
                      disabled={savingPricingRule || chatProviderProfiles.length === 0}
                      onClick={() => void handleSavePricingRule()}
                    >
                      {savingPricingRule ? "保存中..." : editingPricingRuleId === null ? "新增规则" : "更新规则"}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() =>
                        resetPricingRuleDraft(
                          selectedPricingProfileId ? Number(selectedPricingProfileId) : chatProviderProfiles[0]?.id ?? null
                        )
                      }
                    >
                      {editingPricingRuleId === null ? "重置" : "取消"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </aside>


      </div>
    </section>
  );
}
