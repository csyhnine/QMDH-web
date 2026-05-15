import { type CSSProperties, type ChangeEvent, type DragEvent, type FormEvent, type RefObject, useEffect, useRef, useState } from "react";

import {
  api,
  clearStoredAuthToken,
  type Asset,
  type AuthUser,
  type DashboardStats,
  type DiscoveredModel,
  type InspirationPost,
  type ProviderBulkImportItem,
  getStoredAuthToken,
  type ManagedUser,
  type Project,
  type ProjectMember,
  type PromptTemplateRecord,
  type Provider,
  type ProviderProfileCreatePayload,
  type ProviderProfileRecord,
  setStoredAuthToken,
  type Task,
  type UserCreatePayload,
  type Workflow
} from "../../api";

type LoadState = {
  health: string;
  projects: Project[];
  providers: Provider[];
  providerProfiles: ProviderProfileRecord[];
  workflows: Workflow[];
  tasks: Task[];
  assets: Asset[];
  users: ManagedUser[];
  projectMembers: ProjectMember[];
  dashboard: DashboardStats | null;
  error: string;
  ready: boolean;
};

type StudioFormState = {
  title: string;
  prompt: string;
  projectCode: string;
  requestedProvider: string;
  classification: string;
  style: string;
  aspectRatio: string;
  resolution: string;
  imageCount: number;
  deliverable: string;
  referenceImage: string;
  notes: string;
};

type PromptTemplate = {
  id: string;
  label: string;
  title: string;
  prompt: string;
  style: string;
  aspectRatio: string;
  resolution: string;
  deliverable: string;
  notes: string;
};

type PromptTemplateFormValue = Pick<
  PromptTemplate,
  "label" | "title" | "prompt" | "style" | "aspectRatio" | "resolution" | "deliverable" | "notes"
>;

type CustomPromptTemplate = PromptTemplateRecord;

type FeedFilterState = {
  sort: "latest" | "oldest";
  status: "all" | "running" | "completed";
  provider: string;
};

type ComposerMenuKey = "template" | "provider" | "display" | "count" | null;
type ActiveView = "studio" | "projects" | "models" | "users" | "dashboard" | "settings";

type ProviderProfileDraft = {
  providerName: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  adapterKind: string;
  capabilities: string;
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

type UserDraft = {
  name: string;
  password: string;
  displayName: string;
  role: string;
  projectCodes: string;
  monthlyQuota: string;
  isActive: boolean;
};

type DiscoveredModelAssignment = {
  generate: boolean;
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

type ProviderPreset = {
  key: string;
  label: string;
  adapterKind: string;
  baseUrl: string;
  recommendedCapabilities: string[];
  pricingUnit: string;
  quality?: string;
  outputFormat?: string;
  referenceMode?: string;
  referenceCaptionModel?: string;
  support: "ready" | "partial" | "planned";
  note: string;
};

const IMAGE_WORKFLOW_KEY = "image-generate";
const IMAGE_EDIT_WORKFLOW_KEY = "image-edit";

const initialState: LoadState = {
  health: "loading",
  projects: [],
  providers: [],
  providerProfiles: [],
  workflows: [],
  tasks: [],
  assets: [],
  users: [],
  projectMembers: [],
  dashboard: null,
  error: "",
  ready: false
};

const defaultProviderProfileDraft: ProviderProfileDraft = {
  providerName: "",
  apiKey: "",
  baseUrl: "",
  modelName: "",
  adapterKind: "openai_compatible",
  capabilities: "image.generate",
  quality: "medium",
  outputFormat: "png",
  timeoutSeconds: 90,
  pricingCurrency: "CNY",
  pricingUnit: "per_image",
  unitPrice: 0,
  enabled: true,
  referenceMode: "disabled",
  referenceCaptionModel: ""
};

const defaultUserDraft: UserDraft = {
  name: "",
  password: "",
  displayName: "",
  role: "designer",
  projectCodes: "QMDH-001",
  monthlyQuota: "200",
  isActive: true
};

const stylePresets = [
  { id: "modern", label: "现代竞赛" },
  { id: "editorial", label: "杂志感" },
  { id: "cinematic", label: "电影感" },
  { id: "minimal", label: "极简体块" }
];

const aspectRatioOptions = ["智能", "21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"];

const capabilityDefinitions: CapabilityDefinition[] = [
  {
    key: "chat.completions",
    label: "Chat",
    description: "分配到 Chat 页面",
    support: "ready"
  },
  {
    key: "image.generate",
    label: "生成页",
    description: "分配到图像生成页面",
    support: "ready"
  },
  {
    key: "image.edit",
    label: "图像编辑",
    description: "保留图像编辑能力",
    support: "ready"
  },
  {
    key: "video.generate",
    label: "视频生成",
    description: "用于 Kling / 即梦 / Seedance 等视频链路",
    support: "partial"
  }
];

const adapterOptions: AdapterOption[] = [
  {
    key: "openai_compatible",
    label: "OpenAI Compatible",
    support: "ready",
    note: "当前后端已支持这一适配器的 Chat、图像生成和图像编辑。"
  },
  {
    key: "anthropic_native",
    label: "Anthropic Native",
    support: "planned",
    note: "可以先保存配置，但后端还没有 Claude 原生 adapter。"
  },
  {
    key: "kling_native",
    label: "Kling Native",
    support: "partial",
    note: "适合快手 Kling 系列；当前仅保留配置结构，视频执行 adapter 待补。"
  },
  {
    key: "jimeng_native",
    label: "即梦 / Seedance Native",
    support: "partial",
    note: "适合即梦 / Seedance 视频链路；当前仅能配置，后端尚未执行。"
  },
  {
    key: "custom_http",
    label: "Custom HTTP",
    support: "planned",
    note: "用于后续接入非标准厂商接口，当前前后端都还没有通用执行器。"
  }
];

const resolutionOptions = [
  { id: "2k", label: "高清 2K" },
  { id: "4k", label: "超清 4K" }
];

const featuredAtmosphereTemplates: PromptTemplate[] = [
  {
    id: "architectural-enhancement-conservative",
    label: "建筑效果图氛围增强一",
    title: "建筑效果图氛围增强模板一",
    prompt:
      "一张超写实的建筑摄影场景，严格保持原始构图和相机视角，16:9画幅比例。\n晴朗通透的白天环境，阳光从侧上方强烈照射，形成高对比度、清晰锐利的阴影，地面呈现出层次丰富的树影斑驳效果。\n【核心约束】\n不得改变建筑结构、材料或立面细节。不得删除任何原有元素。\n【前景与空间层次】\n画面左上角自然延伸出树枝与树叶，叶片具有轻微透光效果（次表面散射），阳光穿透叶片，增强画面景深与空间层次感。\n【建筑细节】\n强化材质的真实表现，包括混凝土、涂料表面、砖材、金属与玻璃，呈现清晰的微观细节与照片级写实渲染质量。\n【地面与环境】\n柏油路面呈现细腻颗粒质感，并带有轻微磨损痕迹，在阳光下具有符合物理规律的反射效果。\n【人物与生活气息】\n画面中包含若干行人，自然地行走、站立或互动，穿着现代休闲服装，为场景增加真实的城市生活氛围与尺度参照。\n【视觉风格】\n顶级当代建筑摄影风格，强调人与空间互动的纪实感，色彩干净自然，高动态范围光照表现，超高分辨率，电影级写实质感，适用于建筑作品集展示。\n【文字内容】\n图中出现的文字内容如下“韶关市兰康阁电子商务”“烟花炮竹”“LESSO联塑 联塑管道”“兰乡·古韵”。",
    style: "modern",
    aspectRatio: "16:9",
    resolution: "4k",
    deliverable: "保守型 / 文字与前景保留",
    notes: "强调保留原图中的文字信息、前景树内容、建筑材质与构图，不做结构性改动。"
  },
  {
    id: "architectural-enhancement-bold",
    label: "建筑效果图氛围增强二",
    title: "建筑效果图氛围增强模板二",
    prompt:
      "一张荣获建筑竞赛大奖的超写实建筑摄影作品，严格保持当前构图和视角。画面展示了一个晴朗通透的白天，阳光从侧上方洒下，形成高对比度的清晰光影，地面投射出斑驳而富有层次的树影。\n【最高原则】\n禁止改变建筑的材质，禁止删除原图包含的内容。\n【建筑主体细节】\n建筑主体维持原有的体量、结构与立面逻辑，只强化照片级材质细节、通透度与空间气质。\n【配景与氛围】\n画面左上角自然地探出几枝高精度的树叶和枝干，叶片具有次表面散射（Subsurface Scattering）的透光感，为画面增加前景景深。柏油马路呈现出细腻的颗粒质感和轻微的旧化痕迹。道路边缘（非路面上）整齐摆放着一排极具设计感的现代花箱，花草色彩鲜艳且自然。\n【人物与活力】\n街道上有几位黑头发的行人，动态自然，衣着时尚，为建筑增添生活气息。\n【整体基调】\n影像风格模仿顶级建筑摄影师 Iwan Baan 的风格，画面锐利，色彩通透，具有 ArchDaily 或 Dezeen 首页推荐的视觉冲击力，高动态范围（HDR），8K 超高清分辨率。",
    style: "editorial",
    aspectRatio: "16:9",
    resolution: "4k",
    deliverable: "激进型 / 花箱与氛围强化",
    notes: "允许增加更强的前景、花箱、人物和摄影氛围，但仍然禁止修改建筑材质与删除原图内容。"
  },
  {
    id: "landscape-enhancement",
    label: "景观效果图氛围增强",
    title: "景观效果图氛围增强模板",
    prompt:
      "一张超写实的景观效果图摄影场景，严格保持原始构图和相机视角，16:9 画幅比例。晴朗通透的白天环境，阳光从侧上方照射，形成清晰而丰富的光影层次。\n【核心约束】\n不得改变原有硬质铺装、水体、植物骨架、构筑物和场地结构，不得删除任何原有元素。\n【植物与空间层次】\n强化乔木、灌木、地被之间的层次关系，树叶具备轻微透光感，前景与中景形成自然景深，提升空间纵深与通透感。\n【地面与材质】\n强化石材、木平台、铺装缝隙、水面反射和金属细节，呈现高精度、照片级真实材质效果。\n【人物与生活气息】\n适度加入自然活动的人物，如散步、停留、交谈或休憩，增强尺度感与场所活力。\n【视觉风格】\n顶级景观摄影风格，色彩干净自然，强调光影、植物层次与公共空间氛围，超高分辨率，适用于景观方案展示与作品集表达。",
    style: "minimal",
    aspectRatio: "16:9",
    resolution: "4k",
    deliverable: "景观专用 / 层次与通透增强",
  notes: "面向景观效果图，重点强化植物层次、空间通透感、地面材质和公共活动氛围。"
  }
];

const providerPresets: ProviderPreset[] = [
  {
    key: "deepseek-chat",
    label: "DeepSeek / Chat",
    adapterKind: "openai_compatible",
    baseUrl: "https://api.deepseek.com/v1",
    recommendedCapabilities: ["chat.completions"],
    pricingUnit: "per_request",
    support: "ready",
    note: "适合 DeepSeek-R1、V3 等聊天模型，当前后端可直接走 OpenAI-compatible Chat。",
  },
  {
    key: "glm-chat",
    label: "GLM / Chat",
    adapterKind: "openai_compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    recommendedCapabilities: ["chat.completions"],
    pricingUnit: "per_request",
    support: "ready",
    note: "适合 GLM-4.x / GLM-5 系列，直接分配到 Chat 页面。",
  },
  {
    key: "qwen-chat",
    label: "Qwen / Chat",
    adapterKind: "openai_compatible",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    recommendedCapabilities: ["chat.completions"],
    pricingUnit: "per_request",
    support: "ready",
    note: "适合通义千问聊天模型；如果是视觉/推理模型，也建议先分配到 Chat。",
  },
  {
    key: "modelscope-image",
    label: "ModelScope / 图像生成",
    adapterKind: "openai_compatible",
    baseUrl: "https://api-inference.modelscope.cn/v1",
    recommendedCapabilities: ["image.generate"],
    pricingUnit: "per_image",
    quality: "medium",
    outputFormat: "png",
    referenceMode: "caption_prompt",
    referenceCaptionModel: "Qwen/Qwen3-VL-8B-Instruct",
    support: "ready",
    note: "适合 Qwen-Image、Z-Image、FLUX 类图像模型，当前生成页可直接使用。",
  },
  {
    key: "openai-image",
    label: "OpenAI / 图像",
    adapterKind: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    recommendedCapabilities: ["image.generate", "image.edit"],
    pricingUnit: "per_image",
    quality: "high",
    outputFormat: "png",
    support: "ready",
    note: "适合 GPT-Image 系列；图像生成与图像编辑都可以通过现有图片链路接入。",
  },
  {
    key: "anthropic-native",
    label: "Claude / 原生 API",
    adapterKind: "anthropic_native",
    baseUrl: "https://api.anthropic.com/v1",
    recommendedCapabilities: ["chat.completions"],
    pricingUnit: "per_request",
    support: "planned",
    note: "当前页面可配置，但后端还没有原生 Anthropic adapter；需后端补适配后才能真连 Claude。",
  },
  {
    key: "kling-video",
    label: "Kling / 视频",
    adapterKind: "kling_native",
    baseUrl: "https://api.klingai.com",
    recommendedCapabilities: ["video.generate"],
    pricingUnit: "per_video",
    support: "partial",
    note: "视频能力在数据结构里已预留，但当前任务执行器还没有真实视频 adapter。",
  },
  {
    key: "seedance-video",
    label: "即梦 / Seedance",
    adapterKind: "jimeng_native",
    baseUrl: "https://api.jimeng.ai",
    recommendedCapabilities: ["video.generate"],
    pricingUnit: "per_video",
    support: "partial",
    note: "适合即梦视频链路；当前只能做配置占位，需后端补视频执行 adapter。",
  },
];

const defaultStudioForm: StudioFormState = {
  title: featuredAtmosphereTemplates[0].title,
  prompt: featuredAtmosphereTemplates[0].prompt,
  projectCode: "QMDH-001",
  requestedProvider: "",
  classification: "B",
  style: featuredAtmosphereTemplates[0].style,
  aspectRatio: featuredAtmosphereTemplates[0].aspectRatio,
  resolution: featuredAtmosphereTemplates[0].resolution,
  imageCount: 1,
  deliverable: featuredAtmosphereTemplates[0].deliverable,
  referenceImage: "",
  notes: featuredAtmosphereTemplates[0].notes
};

function formatDate(value: string | null): string {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDuration(ms: number): string {
  if (!ms) return "排队中";
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} 分钟`;
  return `${Math.max(1, Math.round(ms / 1000))} 秒`;
}

function formatStatus(status: string | null): string {
  const mapping: Record<string, string> = {
    pending: "待执行",
    running: "执行中",
    completed: "已完成",
    failed: "执行失败",
    loading: "加载中",
    ok: "在线",
    error: "异常"
  };
  return mapping[status ?? ""] ?? (status ?? "未记录");
}

function clampImageCount(value: number): number {
  return Math.max(1, Math.min(4, Math.trunc(value || 1)));
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Reference image could not be read"));
    };
    reader.onerror = () => reject(new Error("Reference image could not be read"));
    reader.readAsDataURL(file);
  });
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function buildPreviewStyle(seed: string): CSSProperties {
  const base = hashString(seed || "qmdh-preview");
  const hueA = base % 360;
  const hueB = (base * 1.9 + 48) % 360;
  const hueC = (base * 2.6 + 120) % 360;

  return {
    "--preview-glow": `hsla(${hueA}, 88%, 76%, 0.72)`,
    "--preview-start": `hsl(${hueB}, 72%, 72%)`,
    "--preview-end": `hsl(${hueC}, 28%, 26%)`
  } as CSSProperties;
}

function getRenderableUrl(asset: Asset): string | null {
  const rawPath = asset.storage_path.trim();
  return /^(https?:|data:|blob:|\/)/.test(rawPath) ? rawPath : null;
}

function summarizeStoragePath(path: string): string {
  if (!path) return "未生成路径";
  if (path.length <= 42) return path;
  return `...${path.slice(-39)}`;
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

function taskSummary(task: Task, asset?: Asset): string {
  return asset?.prompt_text ??
    (task.result["summary"]
      ? String(task.result["summary"])
      : task.result["error"]
        ? String(task.result["error"])
        : "等待结果返回。");
}

function buildImagePayload(form: StudioFormState, workflowKey: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    style: form.style,
    aspect_ratio: form.aspectRatio,
    resolution: form.resolution,
    image_count: clampImageCount(form.imageCount),
    deliverable: form.deliverable,
    prompt_supplement: form.notes,
    reference_image: form.referenceImage,
    source_image: form.referenceImage,
    prompt: form.prompt,
    edit_prompt: workflowKey === IMAGE_EDIT_WORKFLOW_KEY ? form.prompt : ""
  };

  return Object.fromEntries(Object.entries(payload).filter(([, value]) => Boolean(value)));
}

function getStudioWorkflowKeyForProvider(provider: Provider | undefined): string {
  if (provider?.capabilities.includes("image.generate")) return IMAGE_WORKFLOW_KEY;
  if (provider?.capabilities.includes("image.edit")) return IMAGE_EDIT_WORKFLOW_KEY;
  return IMAGE_WORKFLOW_KEY;
}

function applyTemplateToForm(template: PromptTemplateFormValue, current: StudioFormState): StudioFormState {
  return {
    ...current,
    title: template.title,
    prompt: template.prompt,
    style: template.style,
    aspectRatio: template.aspectRatio,
    resolution: template.resolution,
    deliverable: template.deliverable,
    notes: template.notes
  };
}

function toTemplateFormValue(template: CustomPromptTemplate): PromptTemplateFormValue {
  return {
    label: template.label,
    title: template.title,
    prompt: template.prompt,
    style: template.style,
    aspectRatio: template.aspect_ratio || "16:9",
    resolution: template.resolution,
    deliverable: template.deliverable,
    notes: template.notes
  };
}

function sortTemplatesByUpdatedAt(templates: CustomPromptTemplate[]): CustomPromptTemplate[] {
  return [...templates].sort(
    (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  );
}

function buildGalleryAssets(taskAssets: Asset[]): Asset[] {
  return [...taskAssets]
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
    .slice(0, 4);
}

function inferStyleFromAsset(asset: Asset | undefined, fallback: string): string {
  if (!asset) return fallback;
  const matched = stylePresets.find((preset) => asset.tags.includes(preset.id));
  return matched?.id ?? fallback;
}

function inferRequestedImageCount(task: Task): number {
  const requestedCount = Number(task.result["requested_image_count"] ?? task.result["output_count"] ?? 1);
  if (Number.isNaN(requestedCount)) return 1;
  return clampImageCount(requestedCount);
}

function parseCapabilities(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatCapabilities(value: string[]): string {
  return value.join(", ");
}

function hasCapability(value: string, capability: string): boolean {
  return parseCapabilities(value).includes(capability);
}

function toggleCapability(value: string, capability: string, enabled: boolean): string {
  const capabilities = new Set(parseCapabilities(value));
  if (enabled) {
    capabilities.add(capability);
  } else {
    capabilities.delete(capability);
  }
  return formatCapabilities(Array.from(capabilities));
}

function parseProjectCodes(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toUserPayload(draft: UserDraft): UserCreatePayload {
  const trimmedQuota = draft.monthlyQuota.trim();

  return {
    name: draft.name.trim(),
    password: draft.password,
    display_name: draft.displayName.trim(),
    role: draft.role,
    project_codes: parseProjectCodes(draft.projectCodes),
    monthly_quota: trimmedQuota ? Number(trimmedQuota) : null,
    is_active: draft.isActive
  };
}

function toUserDraft(user: ManagedUser): UserDraft {
  return {
    name: user.name,
    password: "",
    displayName: user.display_name,
    role: user.role,
    projectCodes: user.project_codes.join(", "),
    monthlyQuota: user.monthly_quota === null ? "" : String(user.monthly_quota),
    isActive: user.is_active
  };
}

function resolveActiveView(): ActiveView {
  const path = window.location.pathname.replace(/\/$/, "");
  if (path === "/admin/models") return "models";
  if (path === "/admin/users") return "users";
  if (path === "/admin/dashboard") return "dashboard";
  if (path === "/admin/projects") return "projects";
  if (path === "/admin/settings") return "settings";
  return "studio";
}

function canManageUsers(user: AuthUser | null): boolean {
  return user ? ["owner", "admin"].includes(user.role) : false;
}

function canUseOpsViews(user: AuthUser | null): boolean {
  return user ? ["owner", "admin", "ops"].includes(user.role) : false;
}

function metricValue(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return typeof value === "number" || typeof value === "string" ? String(value) : "";
}

function metricNumber(item: Record<string, unknown>, key: string): number {
  const value = item[key];
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricList(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const row = entry as Record<string, unknown>;
        const name = metricValue(row, "name");
        const count = metricValue(row, "count");
        return count ? `${name} ${count}` : name;
      }
      return String(entry);
    })
    .filter(Boolean)
    .join(", ");
}

function metricCost(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return typeof value === "number" ? value.toFixed(2) : metricValue(item, key);
}

function formatCost(value: unknown, currency: unknown): string {
  const amount = typeof value === "number" ? value.toFixed(2) : String(value ?? "0.00");
  const unit = typeof currency === "string" && currency ? currency : "CNY";
  return `${amount} ${unit}`;
}

function formatCostBreakdown(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "0.00 CNY";
  return rows.map((row) => formatCost(row.total_cost, row.currency)).join(" / ");
}

function sumMetric(rows: Array<Record<string, unknown>>, key: string): number {
  return rows.reduce((total, row) => total + metricNumber(row, key), 0);
}

function percentOf(value: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

const chartColors = ["#3778f6", "#35c37d", "#8c55e8", "#f3a646", "#cfd6df"];

function formatDayLabel(isoDate: string): string {
  return isoDate.length >= 10 ? isoDate.slice(5, 10) : isoDate;
}

function svgLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  return `M ${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")}`;
}

function svgAreaPath(
  points: Array<{ x: number; y: number }>,
  bottomY: number
): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    const w = 10;
    return `M ${(p.x - w).toFixed(1)} ${bottomY.toFixed(1)} L ${(p.x - w).toFixed(1)} ${p.y.toFixed(
      1
    )} L ${(p.x + w).toFixed(1)} ${p.y.toFixed(1)} L ${(p.x + w).toFixed(1)} ${bottomY.toFixed(1)} Z`;
  }
  const line = svgLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x.toFixed(1)} ${bottomY.toFixed(1)} L ${first.x.toFixed(1)} ${bottomY.toFixed(1)} Z`;
}

function costFailureChartGeometry(
  series: Array<{ total_cost: number; failed_tasks: number }>
): {
  costPts: Array<{ x: number; y: number }>;
  failPts: Array<{ x: number; y: number }>;
  maxCost: number;
  maxFail: number;
} {
  const chartLeft = 32;
  const chartWidth = 496;
  const chartBottom = 198;
  const chartTop = 32;
  const n = series.length;
  const maxCost = Math.max(1e-6, ...series.map((s) => s.total_cost));
  const maxFail = Math.max(1, ...series.map((s) => s.failed_tasks));
  const h = chartBottom - chartTop;
  const span = Math.max(n - 1, 1);
  const costPts = series.map((s, i) => ({
    x: n <= 1 ? chartLeft + chartWidth / 2 : chartLeft + (i / span) * chartWidth,
    y: chartBottom - (s.total_cost / maxCost) * h
  }));
  const failPts = series.map((s, i) => ({
    x: n <= 1 ? chartLeft + chartWidth / 2 : chartLeft + (i / span) * chartWidth,
    y: chartBottom - (s.failed_tasks / maxFail) * h
  }));
  return { costPts, failPts, maxCost, maxFail };
}

function yAxisTicks(maxValue: number, ticks: number): number[] {
  const m = Math.max(maxValue, 1e-9);
  return Array.from({ length: ticks }, (_, i) => (m * (ticks - 1 - i)) / (ticks - 1));
}

function xAxisTickIndexes(len: number): number[] {
  if (len === 0) return [];
  if (len <= 8) return Array.from({ length: len }, (_, i) => i);
  const maxLabels = 7;
  const step = Math.max(1, Math.floor((len - 1) / (maxLabels - 1)));
  const out = new Set<number>();
  for (let i = 0; i < len; i += step) {
    out.add(i);
  }
  out.add(len - 1);
  return Array.from(out).sort((a, b) => a - b);
}

function modelSliceColor(modelName: string, rankings: Array<Record<string, unknown>>): string {
  if (modelName === "其他") return "#9aa3af";
  const idx = rankings.findIndex((r) => metricValue(r, "name") === modelName);
  return chartColors[(idx >= 0 ? idx : chartColors.length - 1) % chartColors.length];
}

function donutBackground(rows: Array<Record<string, unknown>>): string {
  const total = sumMetric(rows, "count");
  if (!total) {
    return "conic-gradient(#e6ebf2 0deg 360deg)";
  }

  let current = 0;
  const segments = rows.slice(0, 5).map((row, index) => {
    const value = metricNumber(row, "count");
    const start = current;
    current += (value / total) * 360;
    return `${chartColors[index % chartColors.length]} ${start}deg ${current}deg`;
  });
  if (current < 360) {
    segments.push(`#e6ebf2 ${current}deg 360deg`);
  }
  return `conic-gradient(${segments.join(", ")})`;
}

function metricQuota(item: Record<string, unknown>): string {
  const limit = item.quota_limit;
  const remaining = item.quota_remaining;
  const status = metricValue(item, "quota_status");
  const currency = metricValue(item, "quota_currency") || "CNY";
  if (typeof limit !== "number") {
    return `不限额 / 已用 ${formatCost(item.quota_used, currency)}`;
  }
  return `${formatCost(item.quota_used, currency)} / ${limit.toFixed(2)} ${currency}，剩余 ${
    typeof remaining === "number" ? remaining.toFixed(2) : "0.00"
  } ${currency}（${status}）`;
}

function toProviderProfileDraft(profile: ProviderProfileRecord): ProviderProfileDraft {
  return {
    providerName: profile.provider_name,
    apiKey: profile.editable_api_key ?? "",
    baseUrl: profile.base_url,
    modelName: profile.model_name,
    adapterKind: profile.adapter_kind,
    capabilities: profile.capabilities.join(", "),
    quality: profile.quality,
    outputFormat: profile.output_format,
    timeoutSeconds: profile.timeout_seconds,
    pricingCurrency: profile.pricing_currency || "CNY",
    pricingUnit: profile.pricing_unit || "per_image",
    unitPrice: profile.unit_price || 0,
    enabled: profile.enabled,
    referenceMode: profile.reference_mode,
    referenceCaptionModel: profile.reference_caption_model ?? ""
  };
}

function toProviderProfilePayload(draft: ProviderProfileDraft): ProviderProfileCreatePayload {
  return {
    provider_name: draft.providerName.trim(),
    api_key: draft.apiKey.trim(),
    base_url: draft.baseUrl.trim(),
    model_name: draft.modelName.trim(),
    adapter_kind: draft.adapterKind.trim() || "openai_compatible",
    capabilities: parseCapabilities(draft.capabilities),
    quality: draft.quality.trim() || "medium",
    output_format: draft.outputFormat.trim() || "png",
    timeout_seconds: Number(draft.timeoutSeconds) || 90,
    pricing_currency: draft.pricingCurrency.trim().toUpperCase() || "CNY",
    pricing_unit: draft.pricingUnit.trim() || "per_image",
    unit_price: Number(draft.unitPrice) || 0,
    enabled: draft.enabled,
    reference_mode: draft.referenceMode.trim() || "disabled",
    reference_caption_model: draft.referenceCaptionModel.trim() || null
  };
}

function providerGroupLabel(provider: Provider): string {
  const name = `${provider.provider_name} ${provider.model_name}`.toLowerCase();
  if (name.includes("firered")) return "魔搭 / FireRed";
  if (name.includes("z_image") || name.includes("z-image")) return "魔搭 / 造相 Z";
  if (name.includes("qwen")) return "魔搭 / Qwen";
  if (name.includes("modelscope")) return "魔搭 / 其他";
  return "其他真实模型";
}

function modelLooksLikeImageGeneration(modelId: string, ownedBy: string, baseUrl: string): boolean {
  const text = `${modelId} ${ownedBy} ${baseUrl}`.toLowerCase();
  const imageKeywords = [
    "image",
    "flux",
    "diffusion",
    "sdxl",
    "stable-diffusion",
    "kolors",
    "cogview",
    "recraft",
    "seedream",
    "wanx",
    "mj",
    "midjourney",
    "画",
    "生图",
    "z-image",
  ];
  return imageKeywords.some((keyword) => text.includes(keyword));
}

function modelLooksLikeImageEdit(modelId: string, ownedBy: string): boolean {
  const text = `${modelId} ${ownedBy}`.toLowerCase();
  const editKeywords = ["image-edit", "img-edit", "edit", "inpaint", "outpaint", "img2img"];
  return editKeywords.some((keyword) => text.includes(keyword));
}

function guessDiscoveredModelAssignment(
  modelId: string,
  ownedBy: string,
  baseUrl: string
): DiscoveredModelAssignment {
  const looksLikeImage = modelLooksLikeImageGeneration(modelId, ownedBy, baseUrl);
  return looksLikeImage
    ? { generate: true, chat: false }
    : { generate: false, chat: true };
}

function assignmentToCapabilities(
  modelId: string,
  ownedBy: string,
  assignment: DiscoveredModelAssignment
): string[] {
  const capabilities: string[] = [];
  if (assignment.generate) {
    capabilities.push("image.generate");
    if (modelLooksLikeImageEdit(modelId, ownedBy)) {
      capabilities.push("image.edit");
    }
  }
  if (assignment.chat) {
    capabilities.push("chat.completions");
  }
  return capabilities;
}

function assignmentLabel(assignment: DiscoveredModelAssignment): string {
  if (assignment.generate && assignment.chat) return "生成页 + Chat";
  if (assignment.generate) return "生成页";
  if (assignment.chat) return "Chat";
  return "未分配";
}

function supportLevelLabel(level: SupportLevel): string {
  if (level === "ready") return "已支持";
  if (level === "partial") return "待补适配";
  return "规划中";
}

function getAdapterOption(adapterKind: string): AdapterOption {
  return (
    adapterOptions.find((item) => item.key === adapterKind) ?? {
      key: adapterKind,
      label: adapterKind,
      support: "planned",
      note: "未知适配器，请先确认后端是否已经实现执行逻辑。"
    }
  );
}

function getCapabilityDefinition(capability: string): CapabilityDefinition {
  return (
    capabilityDefinitions.find((item) => item.key === capability) ?? {
      key: capability,
      label: capability,
      description: "自定义能力",
      support: "planned"
    }
  );
}

function summarizeProfileSupport(adapterKind: string, capabilities: string[]): SupportLevel {
  const adapter = getAdapterOption(adapterKind);
  if (adapter.support === "planned") {
    return "planned";
  }

  const capabilitySupports = capabilities.map((capability) => getCapabilityDefinition(capability).support);
  if (capabilitySupports.length === 0) {
    return adapter.support;
  }

  if (capabilitySupports.every((level) => level === "ready") && adapter.support === "ready") {
    return "ready";
  }

  if (capabilitySupports.some((level) => level === "ready") || capabilitySupports.some((level) => level === "partial")) {
    return "partial";
  }

  return adapter.support;
}

function groupProviders(providers: Provider[]): Array<{ label: string; providers: Provider[] }> {
  const groups = new Map<string, Provider[]>();
  for (const provider of providers) {
    const label = providerGroupLabel(provider);
    groups.set(label, [...(groups.get(label) ?? []), provider]);
  }
  return Array.from(groups.entries()).map(([label, groupedProviders]) => ({
    label,
    providers: groupedProviders
  }));
}

function isRuntimeImageProvider(provider: Provider): boolean {
  return provider.outbound && (provider.adapter_kind === "openai_compatible" || provider.provider_name.startsWith("modelscope_"));
}

function AssetTile(props: { asset: Asset; emphasis?: "primary" | "secondary" }) {
  const renderableUrl = getRenderableUrl(props.asset);

  return (
    <div
      className={props.emphasis === "primary" ? "asset-tile asset-tile-primary" : "asset-tile"}
      style={buildPreviewStyle(props.asset.storage_path || props.asset.name)}
    >
      {renderableUrl ? <img src={renderableUrl} alt={props.asset.name} loading="lazy" /> : null}
      <div className="asset-tile-overlay">
        <strong>{props.asset.name}</strong>
        <span>{summarizeStoragePath(props.asset.storage_path)}</span>
      </div>
    </div>
  );
}

function FeedCard(props: {
  task: Task;
  asset?: Asset;
  galleryAssets: Asset[];
  onReuse: () => void;
  onBookmark: () => void;
  onShare: () => void;
  onDelete: () => void;
  onAssetPreview?: (asset: Asset) => void;
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const summary = taskSummary(props.task, props.asset);
  const summaryPreview = truncateText(summary, 160);
  const hasLongSummary = summaryPreview !== summary;

  return (
    <article className="feed-card" ref={props.anchorRef}>
      <div className="feed-card-head">
        <div className="feed-card-avatar">{props.task.requested_provider.slice(0, 1).toUpperCase()}</div>
        <div className="feed-card-copy">
          <div className="feed-card-topline">
            <strong>{props.task.title}</strong>
            <span className={`status-pill status-${props.task.status}`}>{formatStatus(props.task.status)}</span>
          </div>
          <p className="feed-card-summary-preview">{summaryPreview}</p>
          {hasLongSummary ? (
            <details className="feed-card-summary-details">
              <summary>展开完整提示词</summary>
              <p>{summary}</p>
            </details>
          ) : null}
          <div className="feed-card-meta">
            <span>{props.task.project_code}</span>
            <span>{props.task.requested_provider}</span>
            <span>{formatDuration(props.task.latency_ms)}</span>
            {props.asset ? <span>已入图库</span> : null}
          </div>
        </div>
      </div>

      {props.galleryAssets.length > 0 ? (
        <div className="feed-gallery">
          {props.galleryAssets.map((asset, index) => (
            <button
              key={asset.id}
              type="button"
              className="feed-gallery-item"
              onClick={() =>
                props.onAssetPreview?.(asset) ?? props.onReuse()
              }
              aria-label="查看大图"
            >
              <AssetTile asset={asset} emphasis={index === 0 ? "primary" : "secondary"} />
              <span className="feed-gallery-zoom-hint" aria-hidden>
                放大
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="feed-gallery-empty">
          <h3>任务还没有返回预览</h3>
          <p>任务执行完成后，这里会显示本轮生成结果和可复用资产。</p>
        </div>
      )}

      <div className="feed-card-actions">
        <div className="feed-action-group">
          <button type="button" className="ghost-button" onClick={props.onReuse}>
            再次生成
          </button>
          <button type="button" className={`ghost-button${props.asset?.is_bookmarked ? " bookmarked" : ""}`} onClick={props.onBookmark} disabled={!props.asset}>
            {props.asset?.is_bookmarked ? "★ 已标记" : "☆ 标记"}
          </button>
          <button type="button" className="ghost-button" onClick={props.onShare} disabled={!props.asset}>
            分享 {props.asset?.share_count ?? 0}
          </button>
          <button type="button" className="ghost-button danger-text" onClick={props.onDelete}>
            删除
          </button>
        </div>
        <span className="feed-card-time">{formatDate(props.task.created_at)}</span>
      </div>
    </article>
  );
}

export default function GenerateStudioShell() {
  const activeView = resolveActiveView();
  const [state, setState] = useState<LoadState>(initialState);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [studioForm, setStudioForm] = useState<StudioFormState>(defaultStudioForm);
  const [studioTab, setStudioTab] = useState<"generate" | "inspiration" | "chat">("generate");
  const [inspirationPosts, setInspirationPosts] = useState<InspirationPost[]>([]);
  const [inspirationCategory, setInspirationCategory] = useState("全部");
  const [inspirationLightbox, setInspirationLightbox] = useState<InspirationPost | null>(null);
  const [importDialog, setImportDialog] = useState<{ open: boolean; url: string; loading: boolean; images: string[]; selectedImage: string; title: string; category: string; tags: string; error: string; manualMode: boolean }>({ open: false, url: "", loading: false, images: [], selectedImage: "", title: "", category: "建筑", tags: "", error: "", manualMode: false });
  const [inspirationEdit, setInspirationEdit] = useState<{ postId: number; title: string; image_path: string; source_url: string } | null>(null);
  // Chat state
  const [chatConversations, setChatConversations] = useState<{ id: number; title: string; model_provider_id: number | null; created_at: string; updated_at: string }[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<{ id?: number; role: string; content: string; created_at?: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatModels, setChatModels] = useState<{ provider_id: number; provider_name: string; model_name: string; base_url: string }[]>([]);
  const [selectedChatModel, setSelectedChatModel] = useState<number | null>(() => {
    const saved = localStorage.getItem("qmdh_chat_model");
    return saved ? parseInt(saved, 10) : null;
  });
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesBottomRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollChatRef = useRef(true);
  const previousChatMessageCountRef = useRef(0);
  const pendingInitialChatScrollRef = useRef(false);
  const [filters, setFilters] = useState<FeedFilterState>({
    sort: "oldest",
    status: "all",
    provider: "all"
  });
  const [submitting, setSubmitting] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [activeComposerMenu, setActiveComposerMenu] = useState<ComposerMenuKey>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [referenceFileName, setReferenceFileName] = useState("");
  const [uploadingReference, setUploadingReference] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<CustomPromptTemplate[]>([]);
  const [templateDraftLabel, setTemplateDraftLabel] = useState("");
  const [templateDraftTitle, setTemplateDraftTitle] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [providerDraft, setProviderDraft] = useState<ProviderProfileDraft>(defaultProviderProfileDraft);
  const [editingProviderProfileId, setEditingProviderProfileId] = useState<number | null>(null);
  const [savingProviderProfile, setSavingProviderProfile] = useState(false);
  const [modelFilters, setModelFilters] = useState<ModelFilterState>({
    search: "",
    capability: "all",
    adapterKind: "all",
    status: "all"
  });
  // discover panel state
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
  const [userDraft, setUserDraft] = useState<UserDraft>(defaultUserDraft);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [showMemberEditor, setShowMemberEditor] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [memberDraftIds, setMemberDraftIds] = useState<Set<number>>(new Set());
  const [allUsersBrief, setAllUsersBrief] = useState<{ id: number; name: string; display_name: string; role: string; is_active: boolean }[]>([]);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectCode, setNewProjectCode] = useState("");

  function updateChatAutoScrollState() {
    const element = chatMessagesRef.current;
    if (!element) {
      return;
    }
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldAutoScrollChatRef.current = distanceFromBottom <= 96;
  }

  function scrollChatToBottom(behavior: ScrollBehavior = "auto") {
    chatMessagesBottomRef.current?.scrollIntoView({ block: "end", behavior });
  }
  const [renamingProjectCode, setRenamingProjectCode] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [selectedAdminProjectCode, setSelectedAdminProjectCode] = useState("");
  const [dashboardStatsDays, setDashboardStatsDays] = useState(30);
  const [galleryPreview, setGalleryPreview] = useState<{ task: Task; asset: Asset } | null>(null);
  const isFetchingRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const composerToolbarRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const latestTaskRef = useRef<HTMLElement | null>(null);
  const hasAutoPositionedRef = useRef(false);

  async function loadData(options: { force?: boolean; dashboardDays?: number } = {}) {
    if (isFetchingRef.current && !options.force) return;
    isFetchingRef.current = true;
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const statsDays = options.dashboardDays ?? dashboardStatsDays;

    try {
      const shouldLoadAdminData = activeView !== "studio";
      const shouldLoadProviderProfiles = activeView === "models" || activeView === "settings";
      const shouldLoadUsers = (activeView === "users" || activeView === "settings") && canManageUsers(currentUser);
      const shouldLoadDashboard = activeView === "dashboard" || activeView === "projects" || activeView === "settings";
      const [health, projects, providers, providerProfiles, workflows, tasks, assets, templates, users, dashboard] = await Promise.all([
        api.health(),
        api.projects(),
        api.providers(),
        shouldLoadProviderProfiles ? api.providerProfiles().catch(() => []) : Promise.resolve([]),
        api.workflows(),
        api.tasks(),
        api.assets(),
        api.promptTemplates().catch(() => null),
        shouldLoadUsers ? api.users().catch(() => []) : Promise.resolve([]),
        shouldLoadAdminData && shouldLoadDashboard ? api.dashboardStats(statsDays).catch(() => null) : Promise.resolve(null)
      ]);

      if (requestId !== loadRequestIdRef.current) return;

      setState({
        health: health.status,
        projects,
        providers,
        providerProfiles,
        workflows,
        tasks,
        assets,
        users,
        projectMembers: state.projectMembers,
        dashboard,
        error: "",
        ready: true
      });
      if (templates) {
        setCustomTemplates(sortTemplatesByUpdatedAt(templates));
      }
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;

      setState((current) => ({
        ...current,
        health: "error",
        error: error instanceof Error ? error.message : "加载失败"
      }));
    } finally {
      if (requestId === loadRequestIdRef.current) {
        isFetchingRef.current = false;
      }
    }
  }

  useEffect(() => {
    async function restoreSession() {
      if (!getStoredAuthToken()) {
        setAuthReady(true);
        return;
      }

      try {
        const user = await api.me();
        setCurrentUser(user);
      } catch {
        clearStoredAuthToken();
        setCurrentUser(null);
      } finally {
        setAuthReady(true);
      }
    }

    void restoreSession();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void loadData({ force: true });
  }, [currentUser?.name, activeView]);

  useEffect(() => {
    if (!currentUser) return;
    const timer = window.setInterval(() => {
      void loadData();
    }, 8000);

    return () => window.clearInterval(timer);
  }, [currentUser?.name, activeView]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!composerToolbarRef.current) return;
      if (!(event.target instanceof Node)) return;
      if (!composerToolbarRef.current.contains(event.target)) {
        setActiveComposerMenu(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    return () => {
      if (referencePreviewUrl) {
        URL.revokeObjectURL(referencePreviewUrl);
      }
    };
  }, [referencePreviewUrl]);

  useEffect(() => {
    if (!galleryPreview) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setGalleryPreview(null);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [galleryPreview]);

  useEffect(() => {
    shouldAutoScrollChatRef.current = true;
    pendingInitialChatScrollRef.current = true;
    previousChatMessageCountRef.current = 0;
  }, [activeChatId]);

  const lastChatMessageContent = chatMessages[chatMessages.length - 1]?.content ?? "";

  useEffect(() => {
    const messageCount = chatMessages.length;
    if (messageCount === 0) {
      previousChatMessageCountRef.current = 0;
      return;
    }

    const hasNewMessage = messageCount > previousChatMessageCountRef.current;
    const shouldScroll = pendingInitialChatScrollRef.current || shouldAutoScrollChatRef.current;

    if (shouldScroll) {
      const behavior: ScrollBehavior = hasNewMessage ? "smooth" : "auto";
      window.requestAnimationFrame(() => scrollChatToBottom(behavior));
      pendingInitialChatScrollRef.current = false;
    }

    previousChatMessageCountRef.current = messageCount;
  }, [activeChatId, chatMessages.length, lastChatMessageContent]);

  const availableProviders = state.providers.filter(
    (provider) =>
      isRuntimeImageProvider(provider) &&
      provider.capabilities.some((capability) => capability === "image.generate" || capability === "image.edit")
  );
  const providerGroups = groupProviders(availableProviders);

  const activeProject = state.projects.find((project) => project.code === studioForm.projectCode);
  const workspaceName = activeProject?.name ?? "默认创作";
  const selectedProvider = availableProviders.find((provider) => provider.provider_name === studioForm.requestedProvider);
  const selectedWorkflowKey = getStudioWorkflowKeyForProvider(selectedProvider);
  const selectedWorkflow = state.workflows.find((workflow) => workflow.key === selectedWorkflowKey);
  const selectedStyle = stylePresets.find((preset) => preset.id === studioForm.style);
  const selectedResolution = resolutionOptions.find((option) => option.id === studioForm.resolution);

  const imageAssets = state.assets.filter((asset) => asset.asset_type === "image");
  const imageTasks = state.tasks.filter(
    (task) =>
      (task.workflow_key === IMAGE_WORKFLOW_KEY || task.workflow_key === IMAGE_EDIT_WORKFLOW_KEY) &&
      task.project_code === studioForm.projectCode
  );
  const imageAssetsByTaskId = imageAssets.reduce((map, asset) => {
    if (asset.source_task_id === null) return map;
    const current = map.get(asset.source_task_id) ?? [];
    current.push(asset);
    map.set(asset.source_task_id, current);
    return map;
  }, new Map<number, Asset[]>());

  const filteredTasks = [...imageTasks]
    .filter((task) => {
      if (filters.status === "running") {
        return task.status === "pending" || task.status === "running";
      }
      if (filters.status === "completed") {
        return task.status === "completed";
      }
      return true;
    })
    .filter((task) => (filters.provider === "all" ? true : task.requested_provider === filters.provider))
    .sort((left, right) => {
      const leftTime = new Date(left.created_at).getTime();
      const rightTime = new Date(right.created_at).getTime();
      return filters.sort === "latest" ? rightTime - leftTime : leftTime - rightTime;
    });

  const latestTask =
    filteredTasks.length > 0
      ? filteredTasks.reduce((currentLatest, task) =>
          new Date(task.created_at).getTime() > new Date(currentLatest.created_at).getTime() ? task : currentLatest
        )
      : null;
  const hasProjectHistory = imageTasks.length > 0;
  const hasFilteredHistory = filteredTasks.length > 0;
  const isStudioDockLayout = activeView === "studio" && studioTab === "generate";
  const activeTemplate =
    [...featuredAtmosphereTemplates, ...customTemplates].find(
      (template) => template.title === studioForm.title && template.prompt === studioForm.prompt
    ) ?? null;

  useEffect(() => {
    if (availableProviders.length === 0) return;
    if (!availableProviders.some((provider) => provider.provider_name === studioForm.requestedProvider)) {
      setStudioForm((current) => ({
        ...current,
        requestedProvider: availableProviders[0].provider_name
      }));
    }
  }, [availableProviders, studioForm.requestedProvider]);

  useEffect(() => {
    if (state.projects.length === 0) return;
    if (state.projects.some((project) => project.code === studioForm.projectCode)) return;
    const nextProject = state.projects[0];

    setStudioForm((current) => ({
      ...current,
      projectCode: nextProject.code,
      classification: nextProject.classification
    }));
  }, [state.projects, studioForm.projectCode]);

  useEffect(() => {
    hasAutoPositionedRef.current = false;
  }, [studioForm.projectCode]);

  useEffect(() => {
    if (!state.ready || !hasFilteredHistory || hasAutoPositionedRef.current) return;

    window.requestAnimationFrame(() => {
      latestTaskRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      hasAutoPositionedRef.current = true;
    });
  }, [state.ready, hasFilteredHistory, latestTask?.id]);

  function syncTemplateDraftWithCurrentForm() {
    setTemplateDraftLabel(activeTemplate?.label ?? "");
    setTemplateDraftTitle(studioForm.title);
  }

  function resetReferenceFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleProjectSelect(project: Project) {
    setStudioForm((current) => ({
      ...current,
      projectCode: project.code,
      classification: project.classification
    }));
    // Load project members
    api.projectMembers(project.code).then((members) => {
      setState((current) => ({ ...current, projectMembers: members }));
    }).catch(() => {
      setState((current) => ({ ...current, projectMembers: [] }));
    });
  }

  function clearReferenceUpload() {
    if (referencePreviewUrl) {
      URL.revokeObjectURL(referencePreviewUrl);
    }
    setReferencePreviewUrl(null);
    setReferenceFileName("");
    setUploadingReference(false);
    setStudioForm((current) => ({
      ...current,
      referenceImage: ""
    }));
    resetReferenceFileInput();
  }

  function handleResetComposer() {
    clearReferenceUpload();
    setActiveComposerMenu(null);
    setEditingTemplateId(null);
    setTemplateDraftLabel("");
    setTemplateDraftTitle("");
    setStudioForm((current) => ({
      ...defaultStudioForm,
      projectCode: current.projectCode,
      classification: current.classification
    }));
  }

  function handleReuseTask(task: Task, asset?: Asset) {
    setActiveComposerMenu(null);
    setStudioForm((current) => {
      const nextProvider =
        availableProviders.find((provider) => provider.provider_name === task.requested_provider)?.provider_name ??
        current.requestedProvider;

      return {
        ...current,
        title: task.title,
        prompt: asset?.prompt_text ?? current.prompt,
        projectCode: task.project_code,
        requestedProvider: nextProvider,
        style: inferStyleFromAsset(asset, current.style),
        imageCount: inferRequestedImageCount(task)
      };
    });

    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  function toggleComposerMenu(menu: Exclude<ComposerMenuKey, null>) {
    setActiveComposerMenu((current) => (current === menu ? null : menu));
    if (menu === "template") {
      syncTemplateDraftWithCurrentForm();
    }
  }

  async function handleReferenceFile(file: File) {
    if (!file.type.startsWith("image/")) {
      resetReferenceFileInput();
      setState((current) => ({
        ...current,
        error: "请上传图片文件作为参考图"
      }));
      return;
    }

    if (referencePreviewUrl) {
      URL.revokeObjectURL(referencePreviewUrl);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setReferencePreviewUrl(nextPreviewUrl);
    setReferenceFileName(file.name);
    setUploadingReference(true);

    try {
      const dataUrl = await fileToDataUrl(file);
      const uploaded = await api.uploadReferenceImage({
        file_name: file.name,
        data_url: dataUrl
      });

      setStudioForm((current) => ({
        ...current,
        referenceImage: uploaded.storage_path
      }));
      setState((current) => ({
        ...current,
        error: ""
      }));
    } catch (error) {
      setStudioForm((current) => ({
        ...current,
        referenceImage: ""
      }));
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "参考图上传失败"
      }));
    } finally {
      setUploadingReference(false);
      resetReferenceFileInput();
    }
  }

  function handleReferenceInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      handleReferenceFile(file);
    }
  }

  function handleReferenceDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleReferenceFile(file);
    }
  }

  function openReferencePicker() {
    fileInputRef.current?.click();
  }

  function handleApplyTemplate(template: PromptTemplateFormValue | CustomPromptTemplate) {
    const nextTemplate = "aspect_ratio" in template || "updated_at" in template ? toTemplateFormValue(template) : template;
    setStudioForm((current) => applyTemplateToForm(nextTemplate, current));
    setActiveComposerMenu(null);
  }

  function handleEditCustomTemplate(template: CustomPromptTemplate) {
    setEditingTemplateId(template.id);
    setTemplateDraftLabel(template.label);
    setTemplateDraftTitle(template.title);
    setStudioForm((current) => applyTemplateToForm(toTemplateFormValue(template), current));
    setActiveComposerMenu("template");
  }

  async function handleDeleteCustomTemplate(templateId: number) {
    try {
      await api.deletePromptTemplate(templateId);
      setCustomTemplates((current) => current.filter((template) => template.id !== templateId));
      if (editingTemplateId === templateId) {
        setEditingTemplateId(null);
        setTemplateDraftLabel("");
        setTemplateDraftTitle("");
      }
      setState((current) => ({
        ...current,
        error: ""
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "删除提示词失败"
      }));
    }
  }

  async function handleSaveCustomTemplate() {
    const label = templateDraftLabel.trim();
    const title = templateDraftTitle.trim() || studioForm.title.trim();
    const prompt = studioForm.prompt.trim();

    if (!label) {
      setState((current) => ({
        ...current,
        error: "请先填写自定义提示词名称"
      }));
      return;
    }

    if (!prompt) {
      setState((current) => ({
        ...current,
        error: "请先填写提示词内容后再保存"
      }));
      return;
    }

    try {
      if (editingTemplateId === null) {
        const createdTemplate = await api.createPromptTemplate({
          label,
          title: title || `${workspaceName} 自定义提示词`,
          prompt,
          style: studioForm.style,
          aspect_ratio: studioForm.aspectRatio,
          resolution: studioForm.resolution,
          deliverable: studioForm.deliverable,
          notes: studioForm.notes
        });

        setCustomTemplates((current) => sortTemplatesByUpdatedAt([createdTemplate, ...current]));
        setEditingTemplateId(createdTemplate.id);
      } else {
        const updatedTemplate = await api.updatePromptTemplate(editingTemplateId, {
          label,
          title: title || `${workspaceName} 自定义提示词`,
          prompt,
          style: studioForm.style,
          aspect_ratio: studioForm.aspectRatio,
          resolution: studioForm.resolution,
          deliverable: studioForm.deliverable,
          notes: studioForm.notes
        });

        setCustomTemplates((current) =>
          sortTemplatesByUpdatedAt([updatedTemplate, ...current.filter((template) => template.id !== updatedTemplate.id)])
        );
        setEditingTemplateId(updatedTemplate.id);
      }

      setState((current) => ({
        ...current,
        error: ""
      }));
      return;
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "保存提示词失败"
      }));
    }
  }

  function resetProviderProfileDraft() {
    setEditingProviderProfileId(null);
    setProviderDraft(defaultProviderProfileDraft);
  }

  function applyProviderPreset(preset: ProviderPreset) {
    setProviderDraft((current) => ({
      ...current,
      adapterKind: preset.adapterKind,
      baseUrl: preset.baseUrl,
      capabilities: formatCapabilities(preset.recommendedCapabilities),
      pricingUnit: preset.pricingUnit,
      quality: preset.quality ?? current.quality,
      outputFormat: preset.outputFormat ?? current.outputFormat,
      referenceMode: preset.referenceMode ?? current.referenceMode,
      referenceCaptionModel: preset.referenceCaptionModel ?? current.referenceCaptionModel
    }));
  }

  function handleEditProviderProfile(profile: ProviderProfileRecord) {
    setEditingProviderProfileId(profile.id);
    setProviderDraft(toProviderProfileDraft(profile));
  }

  async function handleSaveProviderProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = toProviderProfilePayload(providerDraft);

    if (!payload.provider_name || !payload.base_url || !payload.model_name) {
      setState((current) => ({
        ...current,
        error: "请填写 provider 名称、base URL 和模型名称"
      }));
      return;
    }

    if (payload.capabilities.length === 0) {
      setState((current) => ({
        ...current,
        error: "请至少填写一个模型能力，例如 image.generate"
      }));
      return;
    }

    if (editingProviderProfileId === null && !payload.api_key) {
      setState((current) => ({
        ...current,
        error: "新增模型配置需要填写 API Key"
      }));
      return;
    }

    setSavingProviderProfile(true);
    try {
      if (editingProviderProfileId === null) {
        await api.createProviderProfile(payload);
      } else {
        await api.updateProviderProfile(editingProviderProfileId, {
          base_url: payload.base_url,
          model_name: payload.model_name,
          adapter_kind: payload.adapter_kind,
          capabilities: payload.capabilities,
          quality: payload.quality,
          output_format: payload.output_format,
          timeout_seconds: payload.timeout_seconds,
          pricing_currency: payload.pricing_currency,
          pricing_unit: payload.pricing_unit,
          unit_price: payload.unit_price,
          enabled: payload.enabled,
          reference_mode: payload.reference_mode,
          reference_caption_model: payload.reference_caption_model,
          ...(payload.api_key ? { api_key: payload.api_key } : {})
        });
      }
      resetProviderProfileDraft();
      await loadData({ force: true });
      setState((current) => ({
        ...current,
        error: ""
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "保存模型配置失败"
      }));
    } finally {
      setSavingProviderProfile(false);
    }
  }

  async function handleDeleteProviderProfile(profileId: number) {
    try {
      await api.deleteProviderProfile(profileId);
      if (editingProviderProfileId === profileId) {
        resetProviderProfileDraft();
      }
      await loadData({ force: true });
      setState((current) => ({
        ...current,
        error: ""
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "删除模型配置失败"
      }));
    }
  }

  async function handleDiscoverModels(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDiscoverError("");
    setDiscoveredModels([]);
    setDiscoveredAssignments({});
    setSelectedModelIds(new Set());
    setImportResult(null);
    setDiscoverLoading(true);
    try {
      const result = await api.discoverProviderModels(discoverBaseUrl.trim(), discoverApiKey.trim());
      setDiscoveredModels(result.models);
      setDiscoveredAssignments(
        Object.fromEntries(
          result.models.map((model) => [
            model.model_id,
            guessDiscoveredModelAssignment(model.model_id, model.owned_by, result.base_url),
          ])
        )
      );
      setDiscoverBaseUrlForImport(result.base_url);
      setDiscoverApiKeyForImport(discoverApiKey.trim());
      // pre-select models that don't already exist
      setSelectedModelIds(new Set(result.models.filter((m) => !m.already_exists).map((m) => m.model_id)));
    } catch (error) {
      setDiscoverError(error instanceof Error ? error.message : "探测失败");
    } finally {
      setDiscoverLoading(false);
    }
  }

  function toggleModelSelection(modelId: string) {
    setSelectedModelIds((current) => {
      const next = new Set(current);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  }

  function updateDiscoveredAssignment(modelId: string, patch: Partial<DiscoveredModelAssignment>) {
    setDiscoveredAssignments((current) => ({
      ...current,
      [modelId]: {
        ...(current[modelId] ?? { generate: false, chat: false }),
        ...patch,
      },
    }));
  }

  function buildProviderName(baseUrl: string, modelId: string): string {
    // derive a safe provider_name from model_id: replace / and spaces with _
    const slug = modelId.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").toLowerCase();
    const isModelscope = baseUrl.includes("modelscope.cn");
    return isModelscope ? `ms_${slug}` : slug;
  }

  async function handleBulkImport() {
    if (selectedModelIds.size === 0) return;
    setImportingModels(true);
    setImportResult(null);
    try {
      const items: ProviderBulkImportItem[] = discoveredModels
        .filter((m) => selectedModelIds.has(m.model_id))
        .map((m) => {
          const assignment = discoveredAssignments[m.model_id] ?? { generate: false, chat: false };
          return {
            model_id: m.model_id,
            provider_name: buildProviderName(discoverBaseUrlForImport, m.model_id),
            capabilities: assignmentToCapabilities(m.model_id, m.owned_by, assignment),
            adapter_kind: "openai_compatible",
            reference_mode:
              assignment.generate && discoverBaseUrlForImport.includes("modelscope.cn") ? "caption_prompt" : "disabled",
          };
        });
      const unassigned = items.filter((item) => item.capabilities.length === 0).map((item) => item.model_id);
      if (unassigned.length > 0) {
        setDiscoverError(`以下模型尚未分配到生成页或 Chat：${unassigned.join(", ")}`);
        setImportingModels(false);
        return;
      }
      const result = await api.bulkImportProviderProfiles({
        base_url: discoverBaseUrlForImport,
        api_key: discoverApiKeyForImport,
        models: items,
      });
      setImportResult(result);
      setSelectedModelIds(new Set());
      await loadData({ force: true });
    } catch (error) {
      setDiscoverError(error instanceof Error ? error.message : "批量导入失败");
    } finally {
      setImportingModels(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveComposerMenu(null);

    if (uploadingReference) {
      setState((current) => ({
        ...current,
        error: "参考图仍在上传，请稍后再提交。"
      }));
      return;
    }

    setSubmitting(true);

    try {
      await api.createTask({
        title: studioForm.title.trim() || defaultStudioForm.title,
        workflow_key: selectedWorkflowKey,
        project_code: studioForm.projectCode,
        requested_provider: studioForm.requestedProvider,
        classification: studioForm.classification,
        payload: buildImagePayload(studioForm, selectedWorkflowKey)
      });
      hasAutoPositionedRef.current = false;
      await loadData({ force: true });
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "提交任务失败"
      }));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGalleryAction(action: "bookmark" | "share", assetId: number) {
    try {
      if (action === "bookmark") {
        await api.bookmarkAsset(assetId);
      } else {
        await api.shareAsset(assetId);
      }
      await loadData();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "图库操作失败"
      }));
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    try {
      const response = await api.login(loginName.trim(), loginPassword);
      setStoredAuthToken(response.token);
      setCurrentUser(response.user);
      setLoginPassword("");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败");
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // Local logout should still clear the browser session.
    }
    clearStoredAuthToken();
    setCurrentUser(null);
    setState(initialState);
    window.location.href = "/login";
  }

  function resetUserDraft() {
    setEditingUserId(null);
    setUserDraft(defaultUserDraft);
  }

  function handleEditUser(user: ManagedUser) {
    setEditingUserId(user.id);
    setUserDraft(toUserDraft(user));
  }

  async function handleSaveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = toUserPayload(userDraft);
    if (!payload.name || (editingUserId === null && !payload.password)) {
      setState((current) => ({ ...current, error: "请填写用户名和初始密码" }));
      return;
    }

    setSavingUser(true);
    try {
      if (editingUserId === null) {
        await api.createUser(payload);
      } else {
        await api.updateUser(editingUserId, {
          display_name: payload.display_name,
          role: payload.role,
          project_codes: payload.project_codes,
          monthly_quota: payload.monthly_quota,
          is_active: payload.is_active
        });
        if (payload.password) {
          await api.resetUserPassword(editingUserId, payload.password);
        }
      }
      resetUserDraft();
      await loadData({ force: true });
      setState((current) => ({ ...current, error: "" }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "保存用户失败"
      }));
    } finally {
      setSavingUser(false);
    }
  }

  async function handleDeactivateUser(userId: number) {
    try {
      await api.deleteUser(userId);
      await loadData({ force: true });
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "停用用户失败"
      }));
    }
  }

  if (!authReady) {
    return <div className="auth-shell">正在确认登录状态...</div>;
  }

  if (!currentUser) {
    return (
      <main className="auth-shell">
        <form className="auth-card" onSubmit={handleLogin}>
          <p className="canvas-kicker">QMDH / LOGIN</p>
          <h1>登录 QMDH</h1>
          <label className="composer-menu-field">
            <span>用户名</span>
            <input value={loginName} onChange={(event) => setLoginName(event.target.value)} autoComplete="username" />
          </label>
          <label className="composer-menu-field">
            <span>密码</span>
            <input
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {loginError ? <div className="floating-error">{loginError}</div> : null}
          <button type="submit" className="submit-button">登录</button>
        </form>
      </main>
    );
  }

  const userCanManageUsers = canManageUsers(currentUser);
  const userCanUseOpsViews = canUseOpsViews(currentUser);
  const isAdminView =
    activeView === "models" ||
    activeView === "users" ||
    activeView === "dashboard" ||
    activeView === "projects" ||
    activeView === "settings";
  const dashboardModelTotal = state.dashboard ? sumMetric(state.dashboard.model_rankings, "count") : 0;
  const dashboardAccountQuotaTotal = state.dashboard ? sumMetric(state.dashboard.account_usage, "quota_limit") : 0;
  const dashboardAccountUsedTotal = state.dashboard ? sumMetric(state.dashboard.account_usage, "quota_used") : 0;
  const dashboardProjectTotal = state.dashboard ? sumMetric(state.dashboard.project_rankings, "count") : 0;
  const dashboardFailureTotal = state.dashboard ? sumMetric(state.dashboard.failure_reasons, "count") : 0;
  const activeUsers = state.users.filter((user) => user.is_active);
  const disabledUsers = state.users.filter((user) => !user.is_active);
  const adminUsers = state.users.filter((user) => ["owner", "admin"].includes(user.role));
  const enabledProviderProfiles = state.providerProfiles.filter((profile) => profile.enabled);
  const disabledProviderProfiles = state.providerProfiles.filter((profile) => !profile.enabled);
  const isChatStudioLayout = activeView === "studio" && studioTab === "chat";
  const filteredProviderProfiles = state.providerProfiles.filter((profile) => {
    const searchText = `${profile.provider_name} ${profile.model_name}`.toLowerCase();
    const searchMatches = !modelFilters.search.trim() || searchText.includes(modelFilters.search.trim().toLowerCase());
    const capabilityMatches =
      modelFilters.capability === "all" || profile.capabilities.includes(modelFilters.capability);
    const adapterMatches =
      modelFilters.adapterKind === "all" || profile.adapter_kind === modelFilters.adapterKind;
    const statusMatches =
      modelFilters.status === "all" ||
      (modelFilters.status === "enabled" ? profile.enabled : !profile.enabled);
    return searchMatches && capabilityMatches && adapterMatches && statusMatches;
  });
  const chatProviderProfileCount = state.providerProfiles.filter((profile) => profile.capabilities.includes("chat.completions")).length;
  const imageProviderProfileCount = state.providerProfiles.filter((profile) =>
    profile.capabilities.some((capability) => capability === "image.generate" || capability === "image.edit")
  ).length;
  const experimentalProviderProfileCount = state.providerProfiles.filter((profile) => {
    const support = summarizeProfileSupport(profile.adapter_kind, profile.capabilities);
    return support !== "ready" || profile.capabilities.includes("video.generate");
  }).length;
  const activeProviderSupport = summarizeProfileSupport(providerDraft.adapterKind, parseCapabilities(providerDraft.capabilities));
  const activeAdapterOption = getAdapterOption(providerDraft.adapterKind);
  const selectedAdminProject =
    state.projects.find((project) => project.code === selectedAdminProjectCode) ?? state.projects[0] ?? null;
  const selectedAdminProjectTasks = selectedAdminProject
    ? state.tasks.filter((task) => task.project_code === selectedAdminProject.code)
    : [];
  const selectedAdminProjectCost = selectedAdminProjectTasks.reduce((total, task) => total + Number(task.cost || 0), 0);
  const selectedAdminProjectFailures = selectedAdminProjectTasks.filter((task) => task.status === "failed").length;
  const selectedAdminProjectSuccesses = selectedAdminProjectTasks.filter((task) => task.status === "completed").length;

  return (
    <div
      className={
        isAdminView
          ? "studio-shell admin-shell"
          : studioTab === "inspiration"
            ? "studio-shell inspiration-shell"
            : isChatStudioLayout
              ? "studio-shell chat-shell"
              : "studio-shell"
      }
    >
      <aside className="global-rail">
        <div className="rail-logo">Q</div>
        <nav className="rail-nav">
          {isAdminView ? (
            <>
              <button
                type="button"
                className={activeView === "dashboard" ? "rail-item active" : "rail-item"}
                onClick={() => (window.location.href = "/admin/dashboard")}
              >
                <b>□</b>
                <span>运营看板</span>
              </button>
              <button
                type="button"
                className={activeView === "projects" ? "rail-item active" : "rail-item"}
                onClick={() => (window.location.href = "/admin/projects")}
              >
                <b>◇</b>
                <span>项目管理</span>
              </button>
              <button
                type="button"
                className={activeView === "models" ? "rail-item active" : "rail-item"}
                onClick={() => (window.location.href = "/admin/models")}
              >
                <b>⬡</b>
                <span>模型管理</span>
              </button>
              <button
                type="button"
                className={activeView === "users" ? "rail-item active" : "rail-item"}
                onClick={() => (window.location.href = "/admin/users")}
              >
                <b>▤</b>
                <span>账号管理</span>
              </button>
              <button
                type="button"
                className={activeView === "settings" ? "rail-item active" : "rail-item"}
                onClick={() => (window.location.href = "/admin/settings")}
              >
                <b>⚙</b>
                <span>设置中心</span>
              </button>
            </>
          ) : (
            <>
              <button type="button" className={studioTab === "inspiration" ? "rail-item active" : "rail-item"} onClick={() => (window.location.href = "/studio/inspiration")}>
                <span>灵感</span>
              </button>
              <button type="button" className={studioTab === "generate" ? "rail-item active" : "rail-item"} onClick={() => (window.location.href = "/studio/generate")}>
                <span>生成</span>
              </button>
              <button type="button" className={studioTab === "chat" ? "rail-item active" : "rail-item"} onClick={() => (window.location.href = "/studio/chat")}>
                <span>Chat</span>
              </button>
            </>
          )}
        </nav>
        <div className="rail-footer">
          {isAdminView ? (
            <div className="admin-user-card">
              <div className="admin-user-avatar">{currentUser.display_name.slice(0, 1).toUpperCase()}</div>
              <div>
                <strong>{currentUser.display_name || currentUser.name}</strong>
                <span>{currentUser.role}</span>
              </div>
            </div>
          ) : null}
          {userCanUseOpsViews && !isAdminView ? (
            <button type="button" className="rail-logout" onClick={() => (window.location.href = "/admin/dashboard")}>
              看板
            </button>
          ) : null}
          {userCanManageUsers && !isAdminView ? (
            <button type="button" className="rail-logout" onClick={() => (window.location.href = "/admin/users")}>
              账号
            </button>
          ) : null}
          <button type="button" className="rail-logout" onClick={handleLogout}>
            退出
          </button>
          <div className={`rail-health rail-health-${state.health}`}>{formatStatus(state.health)}</div>
          <span className="rail-sync">{lastSyncedAt ? formatDate(lastSyncedAt) : "等待同步"}</span>
        </div>
      </aside>

      {activeView === "studio" && studioTab === "generate" ? (
        <aside className="workspace-pane">
        <div className="workspace-header">
          <div>
            <p className="workspace-kicker">开启创作</p>
            <h2>{workspaceName}</h2>
            <p>{activeProject?.summary ?? "从左侧切换项目，中间区域会按时间流展示这个项目的历史生成记录。"}</p>
          </div>
        </div>

        <button type="button" className="workspace-primary" onClick={() => setShowNewProjectForm(true)}>
          + 新项目
        </button>

        {showNewProjectForm ? (
          <div className="new-project-form">
            <input
              type="text"
              placeholder="项目名称"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="member-search-input"
            />
            <input
              type="text"
              placeholder="项目代码（大写英文+数字）"
              value={newProjectCode}
              onChange={(e) => setNewProjectCode(e.target.value.toUpperCase())}
              className="member-search-input"
            />
            <div className="new-project-actions">
              <button type="button" className="ghost-button" onClick={() => { setShowNewProjectForm(false); setNewProjectName(""); setNewProjectCode(""); }}>取消</button>
              <button
                type="button"
                className="workspace-primary member-save-btn"
                disabled={!newProjectName.trim() || !newProjectCode.trim()}
                onClick={async () => {
                  try {
                    await api.createProject(newProjectName.trim(), newProjectCode.trim());
                    setShowNewProjectForm(false);
                    setNewProjectName("");
                    setNewProjectCode("");
                    await loadData();
                  } catch (err) {
                    setState((cur) => ({ ...cur, error: err instanceof Error ? err.message : "创建项目失败" }));
                  }
                }}
              >创建</button>
            </div>
          </div>
        ) : null}

        <div className="workspace-list">
          {state.projects.map((project) => (
            <div
              key={project.id}
              className={project.code === studioForm.projectCode ? "workspace-item active" : "workspace-item"}
            >
              {renamingProjectCode === project.code ? (
                <div className="project-rename-form">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="member-search-input"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && renameValue.trim()) {
                        api.renameProject(project.code, renameValue.trim()).then(() => {
                          setRenamingProjectCode(null);
                          setRenameValue("");
                          loadData();
                        });
                      } else if (e.key === "Escape") {
                        setRenamingProjectCode(null);
                        setRenameValue("");
                      }
                    }}
                  />
                  <button type="button" className="ghost-button ghost-button-sm" onClick={() => {
                    if (renameValue.trim()) {
                      api.renameProject(project.code, renameValue.trim()).then(() => {
                        setRenamingProjectCode(null);
                        setRenameValue("");
                        loadData();
                      });
                    }
                  }}>✓</button>
                  <button type="button" className="ghost-button ghost-button-sm" onClick={() => { setRenamingProjectCode(null); setRenameValue(""); }}>✕</button>
                </div>
              ) : (
                <button
                  type="button"
                  className="workspace-item-btn"
                  onClick={() => handleProjectSelect(project)}
                >
                  <strong>{project.name}</strong>
                  <span>{project.code} / {project.classification}</span>
                </button>
              )}
              {renamingProjectCode !== project.code && (canManageUsers(currentUser) || canUseOpsViews(currentUser)) ? (
                <button
                  type="button"
                  className="project-rename-trigger"
                  onClick={(e) => { e.stopPropagation(); setRenamingProjectCode(project.code); setRenameValue(project.name); }}
                  title="重命名"
                >✎</button>
              ) : null}
            </div>
          ))}
        </div>

        {state.projectMembers.length > 0 ? (
          <div className="workspace-members">
            <div className="workspace-members-header">
              <h4>项目成员 ({state.projectMembers.length})</h4>
              {canManageUsers(currentUser) || canUseOpsViews(currentUser) ? (
                <button type="button" className="ghost-button ghost-button-sm" onClick={() => {
                  setMemberDraftIds(new Set(state.projectMembers.filter((m) => !m.is_global).map((m) => m.id)));
                  setShowMemberEditor(true);
                  api.usersBrief().then(setAllUsersBrief).catch(() => {});
                }}>
                  编辑
                </button>
              ) : null}
            </div>
            <div className="member-list">
              {state.projectMembers.map((member) => (
                <div key={member.id} className="member-chip">
                  <span className="member-avatar">{member.display_name.slice(0, 1)}</span>
                  <span className="member-name">{member.display_name}</span>
                  <em className="member-role">{member.role}</em>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {showMemberEditor ? (
          <div className="member-editor-overlay">
            <div className="member-editor-left">
              <div className="member-editor-header">
                <h4>全体成员</h4>
                <button type="button" className="ghost-button" onClick={() => { setShowMemberEditor(false); setMemberSearchQuery(""); }}>✕</button>
              </div>
              <input
                type="text"
                className="member-search-input"
                placeholder="搜索用户..."
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
              />
              <div className="member-editor-list">
                {allUsersBrief
                  .filter((u) => u.is_active)
                  .filter((u) => {
                    if (!memberSearchQuery.trim()) return true;
                    const q = memberSearchQuery.toLowerCase();
                    return u.name.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q);
                  })
                  .map((u) => {
                    const isGlobal = state.projectMembers.some((m) => m.id === u.id && m.is_global);
                    const isInDraft = memberDraftIds.has(u.id);
                    return (
                      <label key={u.id} className={`member-editor-row${isInDraft || isGlobal ? " is-member" : ""}`}>
                        <input
                          type="checkbox"
                          checked={isInDraft || isGlobal}
                          disabled={isGlobal}
                          onChange={() => {
                            if (isGlobal) return;
                            setMemberDraftIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(u.id)) {
                                next.delete(u.id);
                              } else {
                                next.add(u.id);
                              }
                              return next;
                            });
                          }}
                        />
                        <span className="member-avatar">{u.display_name.slice(0, 1)}</span>
                        <span className="member-editor-name">{u.display_name} <small>@{u.name}</small></span>
                        <em className="member-role">{isGlobal ? "全局" : u.role}</em>
                      </label>
                    );
                  })}
              </div>
            </div>
          </div>
        ) : null}
        </aside>
      ) : null}

      {showMemberEditor ? (
        <div className="member-participants-floating">
          <h4>项目参与人</h4>
          <div className="member-selected-list">
            {state.projectMembers.filter((m) => m.is_global).map((m) => (
              <div key={m.id} className="member-selected-item">
                <span className="member-avatar">{m.display_name.slice(0, 1)}</span>
                <span className="member-selected-name">{m.display_name}</span>
                <em className="member-role">全局</em>
              </div>
            ))}
            {[...memberDraftIds].map((uid) => {
              const u = allUsersBrief.find((x) => x.id === uid);
              if (!u) return null;
              return (
                <div key={u.id} className="member-selected-item">
                  <span className="member-avatar">{u.display_name.slice(0, 1)}</span>
                  <span className="member-selected-name">{u.display_name}</span>
                  <button
                    type="button"
                    className="member-remove-btn"
                    onClick={() => {
                      setMemberDraftIds((prev) => {
                        const next = new Set(prev);
                        next.delete(uid);
                        return next;
                      });
                    }}
                  >✕</button>
                </div>
              );
            })}
          </div>
          {(() => {
            const originalIds = new Set(state.projectMembers.filter((m) => !m.is_global).map((m) => m.id));
            const toAdd = [...memberDraftIds].filter((id) => !originalIds.has(id));
            const toRemove = [...originalIds].filter((id) => !memberDraftIds.has(id));
            const hasChanges = toAdd.length > 0 || toRemove.length > 0;
            return (
              <div className="member-editor-footer">
                <span className="member-editor-summary">
                  {hasChanges
                    ? `${toAdd.length > 0 ? `+${toAdd.length}` : ""}${toAdd.length > 0 && toRemove.length > 0 ? " " : ""}${toRemove.length > 0 ? `-${toRemove.length}` : ""}`
                    : "未修改"}
                </span>
                <button
                  type="button"
                  className="workspace-primary member-save-btn"
                  disabled={!hasChanges}
                  onClick={() => {
                    const projectCode = studioForm.projectCode;
                    if (!projectCode) return;
                    api.updateProjectMembers(projectCode, toAdd, toRemove).then((members) => {
                      setState((cur) => ({ ...cur, projectMembers: members }));
                      setShowMemberEditor(false);
                      setMemberSearchQuery("");
                    }).catch((err) => {
                      setState((cur) => ({ ...cur, error: err instanceof Error ? err.message : "成员操作失败" }));
                    });
                  }}
                >
                  保存
                </button>
              </div>
            );
          })()}
        </div>
      ) : null}

      <main
        className={
          isAdminView
            ? "canvas-area model-admin-area"
            : isStudioDockLayout
              ? "canvas-area canvas-studio-layout"
              : isChatStudioLayout
                ? "canvas-area canvas-chat-layout"
              : "canvas-area"
        }
      >
        {activeView === "users" ? (
          <section className="admin-page">
            <header className="admin-page-head">
              <div>
                <h1>账号管理</h1>
                <p>管理团队成员账号、角色权限及状态</p>
              </div>
              {userCanManageUsers ? (
                <button type="button" className="admin-primary-button" onClick={resetUserDraft}>+ 创建账号</button>
              ) : null}
            </header>

            {!userCanManageUsers ? (
              <div className="floating-error">当前账号没有用户管理权限。</div>
            ) : (
              <>
                <div className="admin-kpi-grid">
                  <article className="admin-kpi-card admin-blue"><span>账号总数</span><strong>{state.users.length}</strong><small>全部后台账号</small><i>♙</i></article>
                  <article className="admin-kpi-card admin-green"><span>活跃账号</span><strong>{activeUsers.length}</strong><small>可正常登录</small><i>●</i></article>
                  <article className="admin-kpi-card admin-gray"><span>已禁用账号</span><strong>{disabledUsers.length}</strong><small>停用或不可登录</small><i>○</i></article>
                  <article className="admin-kpi-card admin-purple"><span>管理员账号</span><strong>{adminUsers.length}</strong><small>owner / admin</small><i>◆</i></article>
                </div>

                <div className="admin-split-layout">
                  <section className="admin-table-panel">
                    <div className="admin-toolbar">
                      <select aria-label="账号状态筛选"><option>全部状态</option><option>活跃</option><option>禁用</option></select>
                      <select aria-label="账号角色筛选"><option>全部角色</option><option>designer</option><option>ops</option><option>admin</option><option>owner</option></select>
                      <input aria-label="搜索账号" placeholder="搜索账号、姓名或角色" />
                      <button type="button" onClick={() => void loadData({ force: true })}>刷新</button>
                    </div>
                    <div className="admin-data-table admin-user-table">
                      <div className="admin-table-row admin-table-head">
                        <span>账号</span><span>角色</span><span>项目权限</span><span>额度</span><span>状态</span><span>最后登录</span><span>操作</span>
                      </div>
                      {state.users.map((user) => (
                        <div key={user.id} className="admin-table-row">
                          <span><strong>{user.display_name || user.name}</strong><small>@{user.name}</small></span>
                          <span><em className="admin-tag">{user.role}</em></span>
                          <span>{user.project_codes.join(", ")}</span>
                          <span>{user.monthly_quota === null ? "不限额" : `${user.monthly_quota} / 月`}</span>
                          <span><em className={`status-pill ${user.is_active ? "status-completed" : "status-failed"}`}>{user.is_active ? "活跃" : "禁用"}</em></span>
                          <span>{user.last_login_at ? formatDate(user.last_login_at) : "未登录"}</span>
                          <span className="admin-row-actions">
                            <button type="button" onClick={() => handleEditUser(user)}>编辑</button>
                            <button type="button" onClick={() => handleDeactivateUser(user.id)} disabled={!user.is_active}>停用</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <aside className="admin-detail-panel">
                    <form className="admin-side-form" onSubmit={handleSaveUser}>
                      <div className="admin-detail-head">
                        <h2>{editingUserId === null ? "创建账号" : "编辑账号"}</h2>
                        <p>项目权限用英文逗号分隔，使用 * 可访问全部项目。</p>
                      </div>
                      <label className="composer-menu-field"><span>用户名</span><input value={userDraft.name} disabled={editingUserId !== null} onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                      <label className="composer-menu-field"><span>显示名</span><input value={userDraft.displayName} onChange={(event) => setUserDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>
                      <label className="composer-menu-field"><span>角色</span><select value={userDraft.role} onChange={(event) => setUserDraft((current) => ({ ...current, role: event.target.value }))}><option value="designer">designer</option><option value="ops">ops</option><option value="admin">admin</option><option value="owner">owner</option></select></label>
                      <label className="composer-menu-field"><span>{editingUserId === null ? "初始密码" : "重置密码"}</span><input type="password" value={userDraft.password} onChange={(event) => setUserDraft((current) => ({ ...current, password: event.target.value }))} /></label>
                      <label className="composer-menu-field"><span>项目权限</span><input value={userDraft.projectCodes} onChange={(event) => setUserDraft((current) => ({ ...current, projectCodes: event.target.value }))} placeholder="QMDH-001 或 *" /></label>
                      <label className="composer-menu-field"><span>月度额度</span><input type="number" min="0" step="0.01" value={userDraft.monthlyQuota} onChange={(event) => setUserDraft((current) => ({ ...current, monthlyQuota: event.target.value }))} placeholder="留空表示不限额" /></label>
                      <label className="model-toggle"><input type="checkbox" checked={userDraft.isActive} onChange={(event) => setUserDraft((current) => ({ ...current, isActive: event.target.checked }))} /><span>启用账号</span></label>
                      {state.error ? <div className="floating-error">{state.error}</div> : null}
                      <div className="template-editor-actions">
                        <button type="submit" className="submit-button" disabled={savingUser}>{savingUser ? "保存中..." : "保存账号"}</button>
                        {editingUserId !== null ? <button type="button" className="ghost-button" onClick={resetUserDraft}>取消编辑</button> : null}
                      </div>
                    </form>
                  </aside>
                </div>
              </>
            )}
          </section>
        ) : activeView === "projects" ? (
          <section className="admin-page">
            <header className="admin-page-head">
              <div>
                <h1>项目管理</h1>
                <p>管理和监控所有项目的使用情况与成本</p>
              </div>
              <div className="admin-head-actions">
                <button type="button" className="ghost-button">卡片视图</button>
                <button type="button" className="ghost-button">列表视图</button>
              </div>
            </header>
            {!userCanUseOpsViews ? (
              <div className="floating-error">当前账号没有查看项目管理的权限。</div>
            ) : (
              <div className="admin-split-layout admin-project-layout">
                <section className="admin-table-panel">
                  <div className="admin-toolbar">
                    <input aria-label="搜索项目" placeholder="搜索项目名称或 Key" />
                    <select aria-label="项目状态"><option>全部状态</option><option>运行中</option><option>暂停</option></select>
                    <select aria-label="成本区间"><option>成本区间</option><option>0-10</option><option>10-100</option></select>
                    <button type="button" onClick={() => void loadData({ force: true })}>刷新</button>
                  </div>
                  <div className="project-card-grid">
                    {state.projects.map((project) => {
                      const projectTasks = state.tasks.filter((task) => task.project_code === project.code);
                      const projectCost = projectTasks.reduce((total, task) => total + Number(task.cost || 0), 0);
                      const projectFailures = projectTasks.filter((task) => task.status === "failed").length;
                      const failureRate = percentOf(projectFailures, projectTasks.length);
                      const topProviders = Array.from(
                        projectTasks.reduce((counter, task) => counter.set(task.requested_provider, (counter.get(task.requested_provider) ?? 0) + 1), new Map<string, number>())
                      ).sort((a, b) => b[1] - a[1]).slice(0, 2);
                      return (
                        <article
                          key={project.code}
                          className={selectedAdminProject?.code === project.code ? "project-card active" : "project-card"}
                          onClick={() => setSelectedAdminProjectCode(project.code)}
                        >
                          <div className="feed-card-topline">
                            <strong>{project.code}</strong>
                            <span className="status-pill status-completed">运行中</span>
                          </div>
                          <p>{project.name}</p>
                          <div className="project-metrics">
                            <span><small>今日成本</small><b>{formatCost(projectCost, "CNY")}</b></span>
                            <span><small>调用次数</small><b>{projectTasks.length}</b></span>
                            <span><small>失败率</small><b>{formatPercent(failureRate)}</b></span>
                          </div>
                          <div className="project-provider-list">
                            {topProviders.length > 0 ? topProviders.map(([provider, count]) => (
                              <span key={provider}><em>{provider}</em><b style={{ width: `${percentOf(count, projectTasks.length)}%` }} /></span>
                            )) : <small>暂无调用数据</small>}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
                <aside className="admin-detail-panel">
                  {selectedAdminProject ? (
                    <>
                      <button type="button" className="admin-panel-close">×</button>
                      <div className="admin-detail-head">
                        <h2>{selectedAdminProject.code}</h2>
                        <p>{selectedAdminProject.name}</p>
                      </div>
                      <div className="admin-detail-meta">
                        <span>阶段：{selectedAdminProject.current_phase ?? "未设置"}</span>
                        <span>状态：{selectedAdminProject.phase_status ?? "进行中"}</span>
                        <span>更新：{selectedAdminProject.last_updated ?? "未记录"}</span>
                      </div>
                      <div className="detail-metric-grid">
                        <span><small>调用次数</small><strong>{selectedAdminProjectTasks.length}</strong></span>
                        <span><small>实际成本</small><strong>{formatCost(selectedAdminProjectCost, "CNY")}</strong></span>
                        <span><small>成功任务</small><strong>{selectedAdminProjectSuccesses}</strong></span>
                        <span><small>失败任务</small><strong>{selectedAdminProjectFailures}</strong></span>
                      </div>
                      <section className="admin-mini-panel">
                        <h3>项目说明</h3>
                        <p>{selectedAdminProject.summary ?? "暂无项目说明。"}</p>
                      </section>
                      <section className="admin-mini-panel">
                        <h3>下一步</h3>
                        <p>{selectedAdminProject.next_action ?? "暂无下一步记录。"}</p>
                      </section>
                      <section className="admin-mini-panel admin-project-actions">
                        <h3>项目操作</h3>
                        <div className="admin-project-action-row">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => {
                              const newName = prompt("输入新的项目名称：", selectedAdminProject.name);
                              if (newName && newName.trim() && newName.trim() !== selectedAdminProject.name) {
                                api.renameProject(selectedAdminProject.code, newName.trim()).then(() => loadData());
                              }
                            }}
                          >✎ 重命名</button>
                          <button
                            type="button"
                            className="ghost-button danger-button"
                            onClick={async () => {
                              if (!confirm(`确定要删除项目「${selectedAdminProject.name}」(${selectedAdminProject.code})？\n\n此操作不可撤销，项目下的任务将迁移到默认项目。`)) return;
                              try {
                                await api.deleteProject(selectedAdminProject.code);
                                setSelectedAdminProjectCode("");
                                await loadData();
                              } catch (err) {
                                alert(err instanceof Error ? err.message : "删除项目失败");
                              }
                            }}
                          >🗑 删除项目</button>
                        </div>
                      </section>
                    </>
                  ) : (
                    <div className="template-empty">暂无项目数据。</div>
                  )}
                </aside>
              </div>
            )}
          </section>
        ) : activeView === "dashboard" ? (
          <section className="ops-dashboard">
            <header className="ops-dashboard-head">
              <div>
                <h1>运营看板</h1>
                <p>全局概览与运营洞察</p>
              </div>
              <div className="ops-toolbar">
                <div className="ops-segment">
                  <button
                    type="button"
                    className={dashboardStatsDays === 7 ? "active" : ""}
                    onClick={() => {
                      setDashboardStatsDays(7);
                      void loadData({ force: true, dashboardDays: 7 });
                    }}
                  >
                    日
                  </button>
                  <button
                    type="button"
                    className={dashboardStatsDays === 7 ? "active" : ""}
                    onClick={() => {
                      setDashboardStatsDays(7);
                      void loadData({ force: true, dashboardDays: 7 });
                    }}
                  >
                    周
                  </button>
                  <button
                    type="button"
                    className={dashboardStatsDays === 30 ? "active" : ""}
                    onClick={() => {
                      setDashboardStatsDays(30);
                      void loadData({ force: true, dashboardDays: 30 });
                    }}
                  >
                    月
                  </button>
                </div>
                <div className="ops-date-range">
                  <span>最近 {dashboardStatsDays} 天</span>
                  <span>至</span>
                  <span>{lastSyncedAt ? formatDate(lastSyncedAt) : "当前"}</span>
                </div>
                <button
                  type="button"
                  className="ops-icon-button"
                  onClick={() => void loadData({ force: true, dashboardDays: dashboardStatsDays })}
                >
                  刷新
                </button>
                <button type="button" className="ops-export-button">导出报告</button>
              </div>
            </header>
            {!userCanUseOpsViews ? (
              <div className="floating-error">当前账号没有查看运营看板的权限。</div>
            ) : state.dashboard ? (
              <>
                <div className="ops-kpi-grid">
                  <article className="ops-kpi-card ops-kpi-blue">
                    <div><span>任务总览</span><strong>{state.dashboard.total_tasks}</strong><small>成功率 {state.dashboard.success_rate}%</small></div>
                    <i>⌁</i>
                  </article>
                  <article className="ops-kpi-card ops-kpi-green">
                    <div><span>真实成本</span><strong>{formatCostBreakdown(state.dashboard.cost_by_currency)}</strong><small>{state.dashboard.cost_unit}</small></div>
                    <i>￥</i>
                  </article>
                  <article className="ops-kpi-card ops-kpi-purple">
                    <div><span>账号额度</span><strong>{formatCost(dashboardAccountUsedTotal, "CNY")}</strong><small>额度 {formatCost(dashboardAccountQuotaTotal, "CNY")}</small></div>
                    <i>▣</i>
                  </article>
                  <article className="ops-kpi-card ops-kpi-orange">
                    <div><span>模型调用</span><strong>{dashboardModelTotal}</strong><small>覆盖 {state.dashboard.model_rankings.length} 个模型</small></div>
                    <i>∿</i>
                  </article>
                  <article className="ops-kpi-card ops-kpi-red">
                    <div><span>失败次数</span><strong>{state.dashboard.failed_tasks}</strong><small>{formatPercent(percentOf(state.dashboard.failed_tasks, state.dashboard.total_tasks))}</small></div>
                    <i>!</i>
                  </article>
                </div>

                <div className="ops-dashboard-grid">
                  <section className="ops-panel ops-panel-wide">
                    <div className="ops-panel-head">
                      <h2>真实成本与失败趋势</h2>
                      <span>左轴：成本（{state.dashboard.cost_unit}）· 右轴：失败次数</span>
                    </div>
                    {(() => {
                      const dash = state.dashboard;
                      if (!dash) return null;
                      const dailySeries = dash.daily_series ?? [];
                      const hasTrendActivity = dailySeries.some((d) => d.total_tasks > 0 || d.total_cost > 0);
                      const geom = costFailureChartGeometry(
                        dailySeries.map((d) => ({ total_cost: d.total_cost, failed_tasks: d.failed_tasks }))
                      );
                      const costTicks = yAxisTicks(geom.maxCost, 5);
                      const failTicks = yAxisTicks(geom.maxFail, 5);
                      const xIndexes = xAxisTickIndexes(dailySeries.length);
                      if (!hasTrendActivity) {
                        return (
                          <div className="ops-line-chart">
                            <div className="template-empty" style={{ gridColumn: "1 / -1", minHeight: 220 }}>
                              所选时间范围内暂无任务与成本数据。
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="ops-line-chart ops-line-chart-dual">
                          <div className="ops-y-axis">
                            {costTicks.map((t) => (
                              <span key={`cost-${t}`}>{t >= 10 ? t.toFixed(0) : t.toFixed(2)}</span>
                            ))}
                          </div>
                          <svg viewBox="0 0 560 220" role="img" aria-label="真实成本与失败趋势">
                            <defs>
                              <linearGradient id="costFill" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#3778f6" stopOpacity="0.24" />
                                <stop offset="100%" stopColor="#3778f6" stopOpacity="0.02" />
                              </linearGradient>
                            </defs>
                            <path d={svgAreaPath(geom.costPts, 198)} fill="url(#costFill)" />
                            <path
                              d={svgLinePath(geom.costPts)}
                              fill="none"
                              stroke="#3778f6"
                              strokeWidth={3}
                              strokeLinejoin="round"
                            />
                            <path
                              d={svgLinePath(geom.failPts)}
                              fill="none"
                              stroke="#e85d5d"
                              strokeWidth={2.5}
                              strokeDasharray="5 4"
                              strokeLinejoin="round"
                            />
                            {geom.costPts.map((p, i) => (
                              <circle key={`cp-${dailySeries[i]?.date ?? i}`} cx={p.x} cy={p.y} r={4} fill="#3778f6" stroke="white" strokeWidth={2} />
                            ))}
                            {geom.failPts.map((p, i) => (
                              <circle key={`fp-${dailySeries[i]?.date ?? i}`} cx={p.x} cy={p.y} r={3} fill="#e85d5d" stroke="white" strokeWidth={2} />
                            ))}
                            <text x={420} y={24} fill="#6b7687" fontSize="11">
                              — 成本
                            </text>
                            <text x={420} y={38} fill="#e85d5d" fontSize="11">
                              ··· 失败
                            </text>
                          </svg>
                          <div className="ops-y-axis">
                            {failTicks.map((t) => (
                              <span key={`fail-${t}`}>{t >= 10 ? t.toFixed(0) : t.toFixed(1)}</span>
                            ))}
                          </div>
                          <div className="ops-x-axis">
                            {xIndexes.map((i) => (
                              <span key={dailySeries[i]?.date ?? i}>{formatDayLabel(dailySeries[i]?.date ?? "")}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </section>

                  <section className="ops-panel">
                    <div className="ops-panel-head">
                      <h2>模型调用分布</h2>
                    </div>
                    <div className="ops-donut-layout">
                      <div className="ops-donut" style={{ background: donutBackground(state.dashboard.model_rankings) }}>
                        <div><strong>{dashboardModelTotal}</strong><span>总调用</span></div>
                      </div>
                      <div className="ops-legend-list">
                        {state.dashboard.model_rankings.slice(0, 5).map((row, index) => (
                          <div key={metricValue(row, "name")} className="ops-legend-row">
                            <i style={{ background: chartColors[index % chartColors.length] }} />
                            <span>{metricValue(row, "name")}</span>
                            <strong>{formatPercent(percentOf(metricNumber(row, "count"), dashboardModelTotal))}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="ops-panel">
                    <div className="ops-panel-head">
                      <h2>项目排行（按任务）</h2>
                    </div>
                    <div className="ops-table-list">
                      {state.dashboard.project_rankings.slice(0, 5).map((row) => (
                        <div key={metricValue(row, "code")} className="ops-rank-row">
                          <span>{metricValue(row, "code")}</span>
                          <div><b style={{ width: `${percentOf(metricNumber(row, "count"), dashboardProjectTotal)}%` }} /></div>
                          <strong>{metricValue(row, "count")}</strong>
                          <em>{formatPercent(percentOf(metricNumber(row, "count"), dashboardProjectTotal))}</em>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="ops-panel">
                    <div className="ops-panel-head">
                      <h2>失败原因分析</h2>
                      <span>全部</span>
                    </div>
                    <div className="ops-table-list">
                      {(state.dashboard.failure_reasons.length ? state.dashboard.failure_reasons : [{ reason: "暂无失败", count: 0 }]).slice(0, 5).map((row) => (
                        <div key={metricValue(row, "reason")} className="ops-failure-row">
                          <span>{metricValue(row, "reason")}</span>
                          <strong>{metricValue(row, "count") || "0"}</strong>
                          <div><b style={{ width: `${percentOf(metricNumber(row, "count"), dashboardFailureTotal || 1)}%` }} /></div>
                          <em>{formatPercent(percentOf(metricNumber(row, "count"), dashboardFailureTotal || 1))}</em>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="ops-panel ops-panel-large">
                    <div className="ops-panel-head">
                      <h2>模型调用趋势</h2>
                      <div className="ops-inline-legend">
                        {state.dashboard.model_rankings.slice(0, 4).map((row, index) => (
                          <span key={metricValue(row, "name")}><i style={{ background: chartColors[index % chartColors.length] }} />{metricValue(row, "name")}</span>
                        ))}
                      </div>
                    </div>
                    {(() => {
                      const dash = state.dashboard;
                      if (!dash) return null;
                      const modelDays = dash.model_calls_by_day ?? [];
                      const hasModelTrend =
                        modelDays.length > 0 &&
                        modelDays.some((day) => day.slices.some((s) => s.count > 0));
                      if (!hasModelTrend) {
                        return <div className="template-empty">所选时间范围内暂无模型调用记录。</div>;
                      }
                      const dayTotals = modelDays.map((day) =>
                        day.slices.reduce((sum, slice) => sum + slice.count, 0)
                      );
                      const maxDayTotal = Math.max(1, ...dayTotals);
                      return (
                        <div className="ops-stacked-chart">
                          {modelDays.map((day, dayIx) => {
                            const dayTotal = dayTotals[dayIx] ?? 0;
                            const activeSlices = day.slices.filter((s) => s.count > 0);
                            const barSlices =
                              dayTotal === 0
                                ? [{ model_name: "—", count: 0 }]
                                : activeSlices;
                            return (
                              <div key={day.date} className="ops-stack-day">
                                <div
                                  style={{
                                    height:
                                      dayTotal === 0
                                        ? "10%"
                                        : `${Math.max(14, (dayTotal / maxDayTotal) * 100)}%`
                                  }}
                                >
                                  <div>
                                    {barSlices.map((slice) => (
                                      <span
                                        key={`${day.date}-${slice.model_name}`}
                                        style={{
                                          height:
                                            dayTotal === 0
                                              ? "100%"
                                              : `${(slice.count / dayTotal) * 100}%`,
                                          background: modelSliceColor(slice.model_name, dash.model_rankings)
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <small>{formatDayLabel(day.date)}</small>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </section>

                  <section className="ops-panel ops-panel-wide">
                    <div className="ops-panel-head">
                      <h2>账号额度监管</h2>
                      <span>软监管</span>
                    </div>
                    <div className="ops-account-list">
                      {state.dashboard.account_usage.slice(0, 4).map((account) => (
                        <div key={metricValue(account, "name")} className="ops-account-row">
                          <span><strong>{metricValue(account, "display_name")}</strong><small>{metricValue(account, "role")} / {metricList(account, "project_codes")}</small></span>
                          <div><b style={{ width: `${percentOf(metricNumber(account, "quota_used"), metricNumber(account, "quota_limit"))}%` }} /></div>
                          <em>{metricQuota(account)}</em>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <div className="template-empty">看板数据加载中。</div>
            )}
          </section>
        ) : activeView === "models" ? (
          <section className="admin-page">
            <header className="admin-page-head">
              <div>
                <h1>模型管理</h1>
                <p>管理可用模型，查看使用情况、成本与配置</p>
              </div>
              <div className="admin-head-actions">
                <button type="button" className="ghost-button" onClick={() => { setDiscoverPanelOpen((v) => !v); setDiscoverError(""); setImportResult(null); }}>
                  {discoverPanelOpen ? "关闭探测" : "🔍 探测模型"}
                </button>
                <button type="button" className="admin-primary-button" onClick={resetProviderProfileDraft}>+ 添加模型</button>
              </div>
            </header>

            {state.error ? <div className="floating-error">{state.error}</div> : null}

            <div className="admin-kpi-grid admin-kpi-grid-4 admin-model-kpi-modern">
              <article className="admin-kpi-card admin-blue">
                <span>{"\u6a21\u578b\u603b\u6570"}</span>
                <strong>{state.providerProfiles.length}</strong>
                <small>{"\u540e\u53f0\u5df2\u4fdd\u5b58\u914d\u7f6e"}</small>
                <i>M</i>
              </article>
              <article className="admin-kpi-card admin-green">
                <span>{"Chat \u6a21\u578b"}</span>
                <strong>{chatProviderProfileCount}</strong>
                <small>{"\u5206\u914d\u5230 Chat \u9875\u9762"}</small>
                <i>C</i>
              </article>
              <article className="admin-kpi-card admin-orange">
                <span>{"\u56fe\u50cf\u6a21\u578b"}</span>
                <strong>{imageProviderProfileCount}</strong>
                <small>{"\u751f\u6210 / \u7f16\u8f91\u80fd\u529b"}</small>
                <i>I</i>
              </article>
              <article className="admin-kpi-card admin-red">
                <span>{"\u5b9e\u9a8c / \u5f85\u9002\u914d"}</span>
                <strong>{experimentalProviderProfileCount}</strong>
                <small>{"\u89c6\u9891\u6216\u539f\u751f adapter"}</small>
                <i>!</i>
              </article>
            </div>

            <div className="admin-kpi-grid admin-kpi-grid-4 admin-model-kpi-legacy">
              <article className="admin-kpi-card admin-blue"><span>模型总数</span><strong>{state.providerProfiles.length}</strong><small>后台配置</small><i>⬡</i></article>
              <article className="admin-kpi-card admin-green"><span>启用模型</span><strong>{enabledProviderProfiles.length}</strong><small>{formatPercent(percentOf(enabledProviderProfiles.length, state.providerProfiles.length))}</small><i>✓</i></article>
              <article className="admin-kpi-card admin-orange"><span>停用模型</span><strong>{disabledProviderProfiles.length}</strong><small>不参与任务选择</small><i>Ⅱ</i></article>
              <article className="admin-kpi-card admin-red"><span>运行时模型</span><strong>{state.providers.length}</strong><small>当前 provider</small><i>!</i></article>
            </div>

            {discoverPanelOpen ? (
              <section className="discover-panel">
                <form className="discover-form" autoComplete="off" onSubmit={(e) => void handleDiscoverModels(e)}>
                  <h3>探测模型列表</h3>
                  <p className="discover-hint">填入 Base URL 和 API Key，自动拉取该服务支持的模型列表。探测接口只会返回“这个服务有哪些模型”，不会告诉我们它们属于 Chat 还是图像生成，所以导入前需要在这里明确分配到生成页或 Chat。</p>
                  <div className="discover-form-row">
                    <label className="composer-menu-field discover-url-field">
                      <span>Base URL</span>
                      <input
                        value={discoverBaseUrl}
                        onChange={(e) => setDiscoverBaseUrl(e.target.value)}
                        placeholder="https://api-inference.modelscope.cn/v1"
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
                      <span>共发现 {discoveredModels.length} 个模型，已选 {selectedModelIds.size} 个</span>
                      <div className="discover-results-actions">
                        <button type="button" className="ghost-button" onClick={() => setSelectedModelIds(new Set(discoveredModels.filter((m) => !m.already_exists).map((m) => m.model_id)))}>
                          全选未导入
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
                    {importResult ? (
                      <p className="discover-import-result">
                        ✓ 已导入 {importResult.created.length} 个：{importResult.created.join(", ") || "无"}
                        {importResult.skipped.length > 0 ? `；跳过已存在 ${importResult.skipped.length} 个` : ""}
                      </p>
                    ) : null}
                    <div className="discover-model-list">
                      {discoveredModels.map((model) => (
                        <div key={model.model_id} className={`discover-model-item${model.already_exists ? " discover-model-exists" : ""}`}>
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
                                分配：{assignmentLabel(discoveredAssignments[model.model_id] ?? { generate: false, chat: false })}
                              </span>
                              {model.already_exists ? <em className="discover-model-tag">已导入</em> : null}
                            </div>
                          </div>
                          <div className="discover-assignment" onClick={(event) => event.stopPropagation()}>
                            <label className="discover-assignment-option">
                              <input
                                type="checkbox"
                                checked={Boolean(discoveredAssignments[model.model_id]?.generate)}
                                disabled={model.already_exists}
                                onChange={(event) => updateDiscoveredAssignment(model.model_id, { generate: event.target.checked })}
                              />
                              <span>生成页</span>
                            </label>
                            <label className="discover-assignment-option">
                              <input
                                type="checkbox"
                                checked={Boolean(discoveredAssignments[model.model_id]?.chat)}
                                disabled={model.already_exists}
                                onChange={(event) => updateDiscoveredAssignment(model.model_id, { chat: event.target.checked })}
                              />
                              <span>Chat</span>
                            </label>
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
                    <input
                      aria-label="搜索模型"
                      placeholder="搜索 provider / model"
                      value={modelFilters.search}
                      onChange={(event) => setModelFilters((current) => ({ ...current, search: event.target.value }))}
                    />
                    <select
                      aria-label="页面分配"
                      value={modelFilters.capability}
                      onChange={(event) => setModelFilters((current) => ({ ...current, capability: event.target.value }))}
                    >
                      <option value="all">全部能力</option>
                      {capabilityDefinitions.map((definition) => (
                        <option key={definition.key} value={definition.key}>{definition.label}</option>
                      ))}
                    </select>
                    <select
                      aria-label="适配器"
                      value={modelFilters.adapterKind}
                      onChange={(event) => setModelFilters((current) => ({ ...current, adapterKind: event.target.value }))}
                    >
                      <option value="all">全部适配器</option>
                      {adapterOptions.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                    <select
                      aria-label="状态"
                      value={modelFilters.status}
                      onChange={(event) => setModelFilters((current) => ({ ...current, status: event.target.value as ModelFilterState["status"] }))}
                    >
                      <option value="all">全部状态</option>
                      <option value="enabled">启用</option>
                      <option value="disabled">停用</option>
                    </select>
                    <button type="button" onClick={() => void loadData({ force: true })}>刷新</button>
                  </div>
                  <input aria-label="搜索模型" placeholder="搜索模型名称或 ID" />
                  <select aria-label="模型类型"><option>全部类型</option><option>图像生成</option><option>图像编辑</option></select>
                  <select aria-label="模型状态"><option>状态</option><option>启用</option><option>停用</option></select>
                  <select aria-label="计费方式"><option>计费方式</option><option>按张图片</option><option>按次请求</option></select>
                  <button type="button" onClick={() => void loadData({ force: true })}>刷新</button>
                </div>
                <div className="model-table-summary">
                  <span>筛选后 {filteredProviderProfiles.length} 个配置</span>
                  <small>这里先管“分配到哪个页面”和“走哪种 adapter”，真实执行范围以右侧支持说明为准。</small>
                </div>
                <div className="admin-data-table admin-model-table model-table-modern">
                  <div className="admin-table-row admin-table-head">
                    <span>模型名称</span><span>页面分配</span><span>适配器</span><span>计费</span><span>Key</span><span>状态</span><span>操作</span>
                  </div>
                  {filteredProviderProfiles.length > 0 ? filteredProviderProfiles.map((profile) => {
                    const support = summarizeProfileSupport(profile.adapter_kind, profile.capabilities);
                    const adapter = getAdapterOption(profile.adapter_kind);
                    return (
                      <div key={profile.id} className="admin-table-row">
                        <span><strong>{profile.provider_name}</strong><small>{profile.model_name}</small></span>
                        <span className="model-capability-list">
                          {profile.capabilities.map((capability) => {
                            const definition = getCapabilityDefinition(capability);
                            return (
                              <em key={capability} className={`model-capability-chip support-${definition.support}`}>
                                {definition.label}
                              </em>
                            );
                          })}
                        </span>
                        <span>
                          <strong>{adapter.label}</strong>
                          <small className={`model-support-badge support-${support}`}>{supportLevelLabel(support)}</small>
                        </span>
                        <span><strong>{profile.unit_price} {profile.pricing_currency}</strong><small>{profile.pricing_unit}</small></span>
                        <span>{profile.masked_api_key || (profile.has_api_key ? "已保存" : "no key")}</span>
                        <span><em className={`status-pill ${profile.enabled ? "status-completed" : "status-failed"}`}>{profile.enabled ? "启用" : "停用"}</em></span>
                        <span className="admin-row-actions">
                          <button type="button" onClick={() => handleEditProviderProfile(profile)}>编辑</button>
                          <button type="button" onClick={() => handleDeleteProviderProfile(profile.id)}>删除</button>
                        </span>
                      </div>
                    );
                  }) : (
                    <div className="template-empty">
                      {state.providerProfiles.length > 0 ? "当前筛选条件下没有匹配的模型配置。" : "还没有后台模型配置。"}
                    </div>
                  )}
                </div>
                <div className="admin-data-table admin-model-table admin-model-table-legacy">
                  <div className="admin-table-row admin-table-head">
                    <span>模型名称</span><span>状态</span><span>能力</span><span>计费方式</span><span>单价</span><span>Key</span><span>操作</span>
                  </div>
                  {state.providerProfiles.length > 0 ? state.providerProfiles.map((profile) => (
                    <div key={profile.id} className="admin-table-row">
                      <span><strong>{profile.provider_name}</strong><small>{profile.model_name}</small></span>
                      <span><em className={`status-pill ${profile.enabled ? "status-completed" : "status-failed"}`}>{profile.enabled ? "启用" : "停用"}</em></span>
                      <span>{profile.capabilities.join(", ")}</span>
                      <span>{profile.pricing_unit}</span>
                      <span>{profile.unit_price} {profile.pricing_currency}</span>
                      <span>{profile.masked_api_key || "no key"}</span>
                      <span className="admin-row-actions">
                        <button type="button" onClick={() => handleEditProviderProfile(profile)}>编辑</button>
                        <button type="button" onClick={() => handleDeleteProviderProfile(profile.id)}>删除</button>
                      </span>
                    </div>
                  )) : <div className="template-empty">还没有后台模型配置。</div>}
                </div>
              </section>

              <aside className="admin-detail-panel">
                <form className="admin-side-form" autoComplete="off" onSubmit={handleSaveProviderProfile}>
                  <div className="admin-detail-head">
                    <h2>{editingProviderProfileId === null ? "新增模型配置" : "编辑模型配置"}</h2>
                    <p>保存后会按 capabilities 出现在对应页面中；停用后不会再参与任务选择。</p>
                  </div>
                  <div className="model-form-grid model-form-grid-tight">
                  <label className="composer-menu-field">
                    <span>Provider</span>
                    <input
                      value={providerDraft.providerName}
                      disabled={editingProviderProfileId !== null}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, providerName: event.target.value }))}
                      placeholder="modelscope_arch"
                      autoComplete="off"
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>Model</span>
                    <input
                      value={providerDraft.modelName}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, modelName: event.target.value }))}
                      placeholder="Qwen/Qwen-Image"
                      autoComplete="off"
                    />
                  </label>
                  <label className="composer-menu-field composer-menu-field-full">
                    <span>Adapter</span>
                    <select
                      value={providerDraft.adapterKind}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, adapterKind: event.target.value }))}
                    >
                      {adapterOptions.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="composer-menu-field composer-menu-field-full">
                    <span>Base URL</span>
                    <input
                      name="provider-base-url"
                      value={providerDraft.baseUrl}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, baseUrl: event.target.value }))}
                      placeholder="https://api-inference.modelscope.cn/v1"
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
                      onChange={(event) => setProviderDraft((current) => ({ ...current, apiKey: event.target.value }))}
                      placeholder={editingProviderProfileId === null ? "新增时必填" : "留空则保留已保存 key"}
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>Capabilities</span>
                    <div className="capability-toggle-list">
                      <label className="capability-toggle">
                        <input
                          type="checkbox"
                          checked={hasCapability(providerDraft.capabilities, "image.generate")}
                          onChange={(event) =>
                            setProviderDraft((current) => ({
                              ...current,
                              capabilities: toggleCapability(current.capabilities, "image.generate", event.target.checked),
                            }))
                          }
                        />
                        <span>生成页</span>
                        <small>`image.generate`</small>
                      </label>
                      <label className="capability-toggle">
                        <input
                          type="checkbox"
                          checked={hasCapability(providerDraft.capabilities, "chat.completions")}
                          onChange={(event) =>
                            setProviderDraft((current) => ({
                              ...current,
                              capabilities: toggleCapability(current.capabilities, "chat.completions", event.target.checked),
                            }))
                          }
                        />
                        <span>Chat</span>
                        <small>`chat.completions`</small>
                      </label>
                      <label className="capability-toggle">
                        <input
                          type="checkbox"
                          checked={hasCapability(providerDraft.capabilities, "image.edit")}
                          onChange={(event) =>
                            setProviderDraft((current) => ({
                              ...current,
                              capabilities: toggleCapability(current.capabilities, "image.edit", event.target.checked),
                            }))
                          }
                        />
                        <span>图像编辑</span>
                        <small>`image.edit`</small>
                      </label>
                      <label className="capability-toggle">
                        <input
                          type="checkbox"
                          checked={hasCapability(providerDraft.capabilities, "video.generate")}
                          onChange={(event) =>
                            setProviderDraft((current) => ({
                              ...current,
                              capabilities: toggleCapability(current.capabilities, "video.generate", event.target.checked),
                            }))
                          }
                        />
                        <span>视频生成</span>
                        <small>`video.generate`</small>
                      </label>
                    </div>
                    <input
                      value={providerDraft.capabilities}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, capabilities: event.target.value }))}
                      placeholder="image.generate, chat.completions"
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>Quality</span>
                    <input
                      value={providerDraft.quality}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, quality: event.target.value }))}
                      placeholder="medium"
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>Format</span>
                    <select
                      value={providerDraft.outputFormat}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, outputFormat: event.target.value }))}
                    >
                      <option value="png">png</option>
                      <option value="jpeg">jpeg</option>
                      <option value="webp">webp</option>
                      <option value="mp4">mp4</option>
                    </select>
                  </label>
                  <label className="composer-menu-field">
                    <span>Timeout</span>
                    <input
                      type="number"
                      min="10"
                      value={providerDraft.timeoutSeconds}
                      onChange={(event) =>
                        setProviderDraft((current) => ({ ...current, timeoutSeconds: Number(event.target.value) || 90 }))
                      }
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>计费币种</span>
                    <input
                      value={providerDraft.pricingCurrency}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, pricingCurrency: event.target.value }))}
                      placeholder="CNY"
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>计费单位</span>
                    <select
                      value={providerDraft.pricingUnit}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, pricingUnit: event.target.value }))}
                    >
                      <option value="per_image">按张图片</option>
                      <option value="per_request">按次请求</option>
                    </select>
                  </label>
                  <label className="composer-menu-field">
                    <span>单价</span>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={providerDraft.unitPrice}
                      onChange={(event) =>
                        setProviderDraft((current) => ({ ...current, unitPrice: Number(event.target.value) || 0 }))
                      }
                      placeholder="0"
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>Reference</span>
                    <select
                      value={providerDraft.referenceMode}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, referenceMode: event.target.value }))}
                    >
                      <option value="disabled">disabled</option>
                      <option value="caption_prompt">caption_prompt</option>
                    </select>
                  </label>
                  <label className="composer-menu-field">
                    <span>Caption Model</span>
                    <input
                      value={providerDraft.referenceCaptionModel}
                      onChange={(event) =>
                        setProviderDraft((current) => ({ ...current, referenceCaptionModel: event.target.value }))
                      }
                      placeholder="Qwen/Qwen3-VL-8B-Instruct"
                    />
                  </label>
                </div>

                <div className={`model-runtime-note support-${activeProviderSupport}`}>
                  <strong>{activeAdapterOption.label} · {supportLevelLabel(activeProviderSupport)}</strong>
                  <p>{activeAdapterOption.note}</p>
                </div>

                <label className="model-toggle">
                  <input
                    type="checkbox"
                    checked={providerDraft.enabled}
                    onChange={(event) => setProviderDraft((current) => ({ ...current, enabled: event.target.checked }))}
                  />
                  <span>启用这个模型配置</span>
                </label>

                <div className="template-editor-actions">
                  <button type="submit" className="submit-button" disabled={savingProviderProfile}>
                    {savingProviderProfile ? "保存中..." : editingProviderProfileId === null ? "保存配置" : "更新配置"}
                  </button>
                  {editingProviderProfileId !== null ? (
                    <button type="button" className="ghost-button" onClick={resetProviderProfileDraft}>
                      取消编辑
                    </button>
                  ) : null}
                </div>
              </form>
              <section className="admin-mini-panel">
                <div className="admin-detail-head">
                  <h2>厂商模板</h2>
                  <p>先套模板，再补 provider 唯一标识、model 名称和 API Key，会比从空白表单开始更稳。</p>
                </div>
                <div className="provider-preset-list">
                  {providerPresets.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      className="provider-preset-card"
                      title={`${preset.baseUrl}\n${preset.note}`}
                      onClick={() => applyProviderPreset(preset)}
                    >
                      <div className="provider-preset-head">
                        <strong>{preset.label}</strong>
                        <em className={`model-support-badge support-${preset.support}`}>{supportLevelLabel(preset.support)}</em>
                      </div>
                      <div className="provider-preset-meta">
                        <span>{getAdapterOption(preset.adapterKind).label}</span>
                        <small>{preset.pricingUnit}</small>
                      </div>
                      <div className="model-capability-list">
                        {preset.recommendedCapabilities.map((capability) => (
                          <em key={capability} className={`model-capability-chip support-${getCapabilityDefinition(capability).support}`}>
                            {getCapabilityDefinition(capability).label}
                          </em>
                        ))}
                      </div>
                      <b>点击套用</b>
                    </button>
                  ))}
                </div>
              </section>
              <section className="admin-mini-panel">
                <div className="admin-detail-head">
                  <h2>当前支持说明</h2>
                  <p>配置页已经按厂商和能力拆开，但后端真实可运行范围还没有全部铺开。</p>
                </div>
                <div className="model-support-list">
                  <div className="model-support-item">
                    <strong>DeepSeek / GLM / Qwen / GPT 聊天</strong>
                    <span>选 OpenAI Compatible + Chat，可直接用于 Chat 页面。</span>
                  </div>
                  <div className="model-support-item">
                    <strong>Qwen-Image / GPT-Image / Nano Banana 类图像模型</strong>
                    <span>分配到生成页；如支持局部编辑，再额外勾选图像编辑。</span>
                  </div>
                  <div className="model-support-item">
                    <strong>Claude 原生 API</strong>
                    <span>现在可以先存配置，但后端还没有 Anthropic native adapter。</span>
                  </div>
                  <div className="model-support-item">
                    <strong>Kling / 即梦 / Seedance 视频模型</strong>
                    <span>先保存为视频能力占位，等后端补视频 adapter 后再真正执行。</span>
                  </div>
                </div>
              </section>
              </aside>
            </div>
          </section>
        ) : activeView === "settings" ? (
          <section className="admin-page">
            <header className="admin-page-head">
              <div>
                <h1>设置中心</h1>
                <p>系统配置、权限管理、通知与运行状态概览</p>
              </div>
              <button type="button" className="admin-primary-button" onClick={() => void loadData({ force: true })}>刷新状态</button>
            </header>
            {!userCanUseOpsViews ? (
              <div className="floating-error">当前账号没有查看设置中心的权限。</div>
            ) : (
              <>
                <div className="settings-tabs">
                  <button type="button" className="active">系统设置</button>
                  <button type="button">权限管理</button>
                  <button type="button">数据管理</button>
                  <button type="button">安全设置</button>
                  <button type="button">集成配置</button>
                </div>
                <div className="settings-layout">
                  <aside className="settings-menu">
                    {["基本信息", "界面设置", "时间与日期", "计量单位", "语言设置", "系统维护"].map((item, index) => (
                      <button key={item} type="button" className={index === 0 ? "active" : ""}>{item}</button>
                    ))}
                  </aside>
                  <section className="settings-main">
                    <article className="admin-table-panel settings-info-card">
                      <div className="admin-detail-head">
                        <h2>基本信息</h2>
                        <p>配置系统的基础信息。当前页面为轻量概览，不写入真实配置。</p>
                      </div>
                      <div className="settings-field-grid">
                        <label className="composer-menu-field"><span>系统名称</span><input value="QMDH 设计师运营平台" readOnly /></label>
                        <label className="composer-menu-field"><span>公司名称</span><input value="QMDH Studio" readOnly /></label>
                        <label className="composer-menu-field composer-menu-field-full"><span>系统描述</span><input value="面向设计团队的 AI 模型运营与设计师账号管理平台" readOnly /></label>
                        <label className="composer-menu-field"><span>时区设置</span><input value="(UTC+08:00) 北京、上海、香港特别行政区" readOnly /></label>
                        <label className="composer-menu-field"><span>系统版本</span><input value="MVP 1.0" readOnly /></label>
                      </div>
                    </article>
                    <article className="admin-table-panel settings-switch-card">
                      <div className="admin-detail-head">
                        <h2>系统功能开关</h2>
                        <p>仅展示当前项目已具备或待补强能力。</p>
                      </div>
                      <div className="settings-switch-grid">
                        {[
                          ["模型上传", "允许管理员维护模型配置", true],
                          ["账号管理", "启用数据库账号与角色权限", true],
                          ["导出报告", "当前仅保留入口，后续补报表", false],
                          ["API 访问", "旧 token 兼容路径仍保留", true],
                          ["操作日志", "待 task-010 接入审计", false],
                          ["维护模式", "暂未接入真实开关", false]
                        ].map(([title, desc, enabled]) => (
                          <div key={String(title)} className="settings-switch-row">
                            <span><strong>{title}</strong><small>{desc}</small></span>
                            <em className={enabled ? "on" : ""}>{enabled ? "ON" : "OFF"}</em>
                          </div>
                        ))}
                      </div>
                    </article>
                  </section>
                  <aside className="admin-detail-panel settings-resource-panel">
                    <div className="admin-detail-head">
                      <h2>系统资源使用</h2>
                      <p>当前数据来自本地运行状态与现有业务统计。</p>
                    </div>
                    <div className="resource-meter"><span>任务记录</span><b><i style={{ width: `${percentOf(state.tasks.length, 200)}%` }} /></b><em>{state.tasks.length} / 200</em></div>
                    <div className="resource-meter"><span>模型配置</span><b><i style={{ width: `${percentOf(state.providerProfiles.length, 20)}%` }} /></b><em>{state.providerProfiles.length} / 20</em></div>
                    <div className="resource-meter"><span>账号数量</span><b><i style={{ width: `${percentOf(state.users.length, 50)}%` }} /></b><em>{state.users.length} / 50</em></div>
                    <div className="resource-meter"><span>项目数量</span><b><i style={{ width: `${percentOf(state.projects.length, 20)}%` }} /></b><em>{state.projects.length} / 20</em></div>
                    <div className="settings-quick-actions">
                      <button type="button" onClick={() => (window.location.href = "/admin/models")}>运维配置</button>
                      {userCanManageUsers ? <button type="button" onClick={() => (window.location.href = "/admin/users")}>账号管理</button> : null}
                      <button type="button" onClick={() => (window.location.href = "/admin/dashboard")}>运营看板</button>
                    </div>
                  </aside>
                </div>
              </>
            )}
          </section>
        ) : (
          <>
        {studioTab === "inspiration" ? (
          <section className="inspiration-page">
            <header className="inspiration-header">
              <div>
                <h1>灵感</h1>
                <p>探索参考案例、材质与构图，激发设计灵感</p>
              </div>
              <div className="inspiration-actions">
                {(canManageUsers(currentUser) || canUseOpsViews(currentUser)) ? (
                  <button type="button" className="admin-primary-button" onClick={() => {
                    setImportDialog({ open: true, url: "", loading: false, images: [], selectedImage: "", title: "", category: inspirationCategory !== "全部" ? inspirationCategory : "建筑", tags: "", error: "", manualMode: false });
                  }}>+ 导入参考</button>
                ) : null}
              </div>
            </header>
            <nav className="inspiration-categories">
              {["全部", "建筑", "景观", "室内", "城市", "构图", "材质", "光影", "色彩"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={inspirationCategory === cat ? "active" : ""}
                  onClick={() => {
                    setInspirationCategory(cat);
                    api.inspiration(cat).then(setInspirationPosts).catch(() => {});
                  }}
                >{cat}</button>
              ))}
            </nav>
            <div className="inspiration-grid">
              {inspirationPosts.length > 0 ? inspirationPosts.map((post) => (
                <article key={post.id} className="inspiration-card">
                  <div className="inspiration-card-image" onClick={() => setInspirationLightbox(post)} style={{ cursor: "pointer" }}>
                    {post.image_path ? (
                      <img src={post.image_path} alt={post.title} loading="lazy" />
                    ) : (
                      <div className="inspiration-card-placeholder" />
                    )}
                    {post.category !== "全部" ? <span className="inspiration-card-badge">{post.category}</span> : null}
                  </div>
                  <div className="inspiration-card-body">
                    <h3>{post.title}</h3>
                    {post.tags.length > 0 ? (
                      <div className="inspiration-card-tags">
                        {post.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                      </div>
                    ) : null}
                    <div className="inspiration-card-meta">
                      <span className="inspiration-source">
                        {post.source_url ? (
                          <a href={post.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            来自 {(() => { try { return new URL(post.source_url).hostname.replace(/^www\./, ""); } catch { return post.source_name || "外部"; } })()}
                          </a>
                        ) : (
                          post.source_type === "user" ? `由 ${post.user_name || "设计师"} 分享` : `来自 ${post.source_name || "外部"}`
                        )}
                      </span>
                      <span className="inspiration-stats">
                        <button type="button" className="ghost-button" onClick={() => {
                          api.likeInspiration(post.id).then(() => api.inspiration(inspirationCategory).then(setInspirationPosts));
                        }}>♡ {post.like_count}</button>
                        {canUseOpsViews(currentUser) ? (
                          <button type="button" className="ghost-button" title="编辑" onClick={() => {
                            setInspirationEdit({ postId: post.id, title: post.title, image_path: post.image_path, source_url: post.source_url });
                          }}>✎</button>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </article>
              )) : (
                <div className="inspiration-empty">
                  <p>暂无灵感内容。管理员可以导入外部参考，设计师可以分享生成成果。</p>
                </div>
              )}
            </div>
            {/* Lightbox */}
            {inspirationLightbox ? (
              <div className="media-lightbox" onClick={() => setInspirationLightbox(null)} onKeyDown={(e) => { if (e.key === "Escape") setInspirationLightbox(null); }} tabIndex={0} ref={(el) => el?.focus()}>
                <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="media-lightbox-close" onClick={() => setInspirationLightbox(null)}>×</button>
                  <img src={inspirationLightbox.image_path} alt={inspirationLightbox.title} style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain" }} />
                  <div style={{ textAlign: "center", marginTop: "12px", color: "#fff" }}>
                    <h3 style={{ margin: "0 0 8px", fontSize: "18px" }}>{inspirationLightbox.title}</h3>
                    {inspirationLightbox.source_url ? (
                      <a href={inspirationLightbox.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "#8bb4ff", fontSize: "14px" }}>
                        查看原文 →
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            {/* Import Dialog */}
            {importDialog.open ? (
              <div className="media-lightbox" onClick={() => setImportDialog({ ...importDialog, open: false })}>
                <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "680px", width: "90vw", maxHeight: "85vh", overflow: "auto", color: "#333" }}>
                  <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>导入灵感参考</h2>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                    <input type="text" placeholder="粘贴文章链接（ArchDaily / 古德 / 小红书 / 微信公众号）" value={importDialog.url} onChange={(e) => setImportDialog({ ...importDialog, url: e.target.value, error: "" })} style={{ flex: 1, padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px" }} />
                    <button type="button" className="admin-primary-button" disabled={importDialog.loading || !importDialog.url.trim()} onClick={async () => {
                      setImportDialog({ ...importDialog, loading: true, error: "", images: [] });
                      try {
                        const result = await api.extractImages(importDialog.url.trim());
                        setImportDialog({ ...importDialog, loading: false, images: result.images, title: result.title || importDialog.title, selectedImage: result.images[0] || "" });
                      } catch (err: any) {
                        setImportDialog({ ...importDialog, loading: false, error: err?.message || "提取失败", manualMode: true });
                      }
                    }}>{importDialog.loading ? "提取中..." : "提取图片"}</button>
                  </div>
                  {importDialog.error ? <p style={{ color: "#e53e3e", fontSize: "13px", margin: "0 0 12px" }}>{importDialog.error}</p> : null}
                  {importDialog.images.length > 0 ? (
                    <div style={{ marginBottom: "16px" }}>
                      <p style={{ fontSize: "13px", color: "#666", margin: "0 0 8px" }}>选择封面图片（共 {importDialog.images.length} 张）：</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "8px", maxHeight: "240px", overflow: "auto" }}>
                        {importDialog.images.map((img) => (
                          <div key={img} onClick={() => setImportDialog({ ...importDialog, selectedImage: img })} style={{ border: importDialog.selectedImage === img ? "3px solid #3b82f6" : "2px solid #eee", borderRadius: "8px", overflow: "hidden", cursor: "pointer", aspectRatio: "4/3" }}>
                            <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {importDialog.manualMode ? (
                    <div style={{ marginBottom: "12px" }}>
                      <input type="text" placeholder="手动输入图片 URL" value={importDialog.selectedImage} onChange={(e) => setImportDialog({ ...importDialog, selectedImage: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px" }} />
                    </div>
                  ) : null}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                    <div>
                      <label style={{ fontSize: "13px", color: "#666" }}>标题</label>
                      <input type="text" value={importDialog.title} onChange={(e) => setImportDialog({ ...importDialog, title: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: "13px", color: "#666" }}>分类</label>
                      <select value={importDialog.category} onChange={(e) => setImportDialog({ ...importDialog, category: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }}>
                        {["建筑", "景观", "室内", "城市", "构图", "材质", "光影", "色彩"].map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ fontSize: "13px", color: "#666" }}>标签（逗号分隔）</label>
                    <input type="text" value={importDialog.tags} onChange={(e) => setImportDialog({ ...importDialog, tags: e.target.value })} placeholder="如：住宅, 日本, 混凝土" style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} />
                  </div>
                  <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                    <button type="button" className="ghost-button" onClick={() => setImportDialog({ ...importDialog, open: false })}>取消</button>
                    <button type="button" className="admin-primary-button" disabled={!importDialog.title.trim() || !importDialog.selectedImage.trim()} onClick={async () => {
                      const tags = importDialog.tags.split(",").map(t => t.trim()).filter(Boolean);
                      let sourceName = "";
                      try { sourceName = new URL(importDialog.url).hostname.replace(/^www\./, ""); } catch {}
                      await api.createInspiration({
                        title: importDialog.title.trim(),
                        image_path: importDialog.selectedImage.trim(),
                        category: importDialog.category,
                        source_type: "external",
                        source_name: sourceName,
                        source_url: importDialog.url.trim(),
                        tags
                      });
                      setImportDialog({ ...importDialog, open: false });
                      api.inspiration(inspirationCategory).then(setInspirationPosts);
                    }}>确认导入</button>
                  </div>
                </div>
              </div>
            ) : null}
            {/* Edit Dialog */}
            {inspirationEdit ? (
              <div className="media-lightbox" onClick={() => setInspirationEdit(null)}>
                <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "480px", width: "90vw", color: "#333" }}>
                  <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>编辑灵感</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={{ fontSize: "13px", color: "#666" }}>标题</label>
                      <input type="text" value={inspirationEdit.title} onChange={(e) => setInspirationEdit({ ...inspirationEdit, title: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: "13px", color: "#666" }}>图片 URL</label>
                      <input type="text" value={inspirationEdit.image_path} onChange={(e) => setInspirationEdit({ ...inspirationEdit, image_path: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: "13px", color: "#666" }}>原文链接</label>
                      <input type="text" value={inspirationEdit.source_url} onChange={(e) => setInspirationEdit({ ...inspirationEdit, source_url: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
                    <button type="button" className="ghost-button" onClick={() => setInspirationEdit(null)}>取消</button>
                    <button type="button" className="admin-primary-button" onClick={async () => {
                      await api.updateInspiration(inspirationEdit.postId, { title: inspirationEdit.title, image_path: inspirationEdit.image_path, source_url: inspirationEdit.source_url });
                      setInspirationEdit(null);
                      api.inspiration(inspirationCategory).then(setInspirationPosts);
                    }}>保存</button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : studioTab === "chat" ? (
          <section className="chat-page">
            {/* Left sidebar - conversations */}
            <aside className="chat-sidebar">
              <button type="button" className="chat-new-btn" onClick={async () => {
                if (!selectedChatModel) { alert("请先选择模型"); return; }
                const conv = await api.createChatConversation(selectedChatModel);
                setChatConversations((prev) => [conv, ...prev]);
                setActiveChatId(conv.id);
                setChatMessages([]);
              }}>
                <span>＋</span> 新对话
              </button>
              <div className="chat-conv-list">
                {chatConversations.map((conv) => (
                  <div key={conv.id} className={`chat-conv-item ${activeChatId === conv.id ? "active" : ""}`} onClick={() => { setActiveChatId(conv.id); api.getChatMessages(conv.id).then(setChatMessages).catch(() => {}); }}>
                    <span className="chat-conv-title">{conv.title}</span>
                    <button type="button" className="chat-conv-del" onClick={(e) => { e.stopPropagation(); api.deleteChatConversation(conv.id).then(() => { setChatConversations((prev) => prev.filter((c) => c.id !== conv.id)); if (activeChatId === conv.id) { setActiveChatId(null); setChatMessages([]); } }); }}>×</button>
                  </div>
                ))}
              </div>
            </aside>
            {/* Main chat area */}
            <div className="chat-main">
              {/* Top bar with model selector */}
              <header className="chat-topbar">
                <select className="chat-model-select" value={selectedChatModel || ""} onChange={(e) => { const v = parseInt(e.target.value, 10); setSelectedChatModel(v); localStorage.setItem("qmdh_chat_model", String(v)); }}>
                  <option value="" disabled>选择模型</option>
                  {chatModels.map((m) => <option key={m.provider_id} value={m.provider_id}>{m.model_name}</option>)}
                </select>
                {activeChatId ? <span className="chat-topbar-title">{chatConversations.find((c) => c.id === activeChatId)?.title || ""}</span> : null}
              </header>
              {activeChatId ? (
                <>
                  {/* Messages */}
                  <div className="chat-messages" ref={chatMessagesRef} onScroll={updateChatAutoScrollState}>
                    {chatMessages.map((msg, i) => (
                      <div key={msg.id || i} className={`chat-msg ${msg.role}`}>
                        {msg.role === "assistant" ? <div className="chat-msg-avatar">AI</div> : null}
                        <div className="chat-msg-bubble">
                          <div className="chat-msg-content">{msg.content || (chatStreaming && i === chatMessages.length - 1 ? "●" : "")}</div>
                        </div>
                        {msg.role === "user" ? <div className="chat-msg-avatar chat-msg-avatar-user">{(currentUser?.display_name || "U").slice(0, 1)}</div> : null}
                      </div>
                    ))}
                    <div ref={chatMessagesBottomRef} aria-hidden="true" />
                  </div>
                  {/* Input area */}
                  <div className="chat-input-area">
                    <div className="chat-input-box">
                      <textarea className="chat-textarea" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); document.getElementById("chat-send-btn")?.click(); } }} placeholder="和我聊聊天吧" rows={1} disabled={chatStreaming} />
                      <button id="chat-send-btn" type="button" className="chat-send-btn" disabled={chatStreaming || !chatInput.trim()} onClick={async () => {
                        if (!chatInput.trim() || !activeChatId) return;
                        const content = chatInput.trim();
                        setChatInput("");
                        setChatMessages((prev) => [...prev, { role: "user", content }]);
                        setChatStreaming(true);
                        setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);
                        try {
                          const token = getStoredAuthToken();
                          const resp = await fetch(`/api/v1/chat/conversations/${activeChatId}/messages`, {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                            body: JSON.stringify({ content }),
                          });
                          if (!resp.ok) {
                            let detail = "请求失败";
                            try {
                              const payload = await resp.json();
                              detail = payload?.detail || detail;
                            } catch {}
                            throw new Error(detail);
                          }
                          const reader = resp.body!.getReader();
                          const decoder = new TextDecoder();
                          let buffer = "";
                          while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split("\n");
                            buffer = lines.pop() || "";
                            for (const line of lines) {
                              if (!line.startsWith("data: ")) continue;
                              const data = line.slice(6);
                              if (data === "[DONE]") break;
                              try {
                                const parsed = JSON.parse(data);
                                if (parsed.delta) {
                                  setChatMessages((prev) => {
                                    const updated = [...prev];
                                    const last = updated[updated.length - 1];
                                    if (last && last.role === "assistant") { updated[updated.length - 1] = { ...last, content: last.content + parsed.delta }; }
                                    return updated;
                                  });
                                }
                                if (parsed.error) {
                                  setChatMessages((prev) => { const updated = [...prev]; updated[updated.length - 1] = { role: "assistant", content: `⚠️ ${parsed.error}` }; return updated; });
                                }
                              } catch {}
                            }
                          }
                        } catch (err: any) {
                          setChatMessages((prev) => { const updated = [...prev]; updated[updated.length - 1] = { role: "assistant", content: `⚠️ 请求失败: ${err?.message || "未知错误"}` }; return updated; });
                        }
                        setChatStreaming(false);
                        api.getChatConversations().then(setChatConversations).catch(() => {});
                      }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="chat-empty">
                  {chatModels.length === 0 ? (
                    <div className="chat-empty-inner">
                      <h2>暂无可用模型</h2>
                      <p>请在后台模型管理中添加 capabilities 包含 "chat.completions" 的模型</p>
                    </div>
                  ) : (
                    <div className="chat-empty-inner">
                      <h2>QMDH Chat</h2>
                      <p>选择模型，创建新对话开始聊天</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        ) : (
        <>
        <div className={isStudioDockLayout ? "studio-scroll-pane" : "studio-scroll-fallback"}>
        {hasProjectHistory ? (
          <header className="canvas-topbar canvas-topbar-history">
            <div className="toolbar-row">
              <label className="toolbar-field">
                <span>时间</span>
                <select
                  value={filters.sort}
                  onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as FeedFilterState["sort"] }))}
                >
                  <option value="latest">最近优先</option>
                  <option value="oldest">最早优先</option>
                </select>
              </label>

              <label className="toolbar-field">
                <span>生成类型</span>
                <select
                  value={filters.provider}
                  onChange={(event) => setFilters((current) => ({ ...current, provider: event.target.value }))}
                >
                  <option value="all">全部模型</option>
                  {availableProviders.map((provider) => (
                    <option key={provider.provider_name} value={provider.provider_name}>
                      {provider.provider_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="toolbar-field">
                <span>操作状态</span>
                <select
                  value={filters.status}
                  onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as FeedFilterState["status"] }))}
                >
                  <option value="all">全部状态</option>
                  <option value="running">运行中</option>
                  <option value="completed">已完成</option>
                </select>
              </label>
            </div>
          </header>
        ) : null}

        {state.error ? <div className="floating-error">{state.error}</div> : null}

        {activeView === "studio" && studioTab === "generate" && hasProjectHistory ? (
          <section className="feed-stream">
            {hasFilteredHistory ? (
              filteredTasks.map((task) => {
                const galleryAssets = buildGalleryAssets(imageAssetsByTaskId.get(task.id) ?? []);
                const linkedAsset = galleryAssets[0];
                const isLatestTask = task.id === latestTask?.id;

                return (
                  <FeedCard
                    key={task.id}
                    task={task}
                    asset={linkedAsset}
                    galleryAssets={galleryAssets}
                    onReuse={() => handleReuseTask(task, linkedAsset ?? galleryAssets[0])}
                    onBookmark={() => (linkedAsset ? void handleGalleryAction("bookmark", linkedAsset.id) : undefined)}
                    onShare={() => (linkedAsset ? void handleGalleryAction("share", linkedAsset.id) : undefined)}
                    onDelete={async () => {
                      if (!confirm("确定删除这条生成记录？")) return;
                      try {
                        await api.deleteTask(task.id);
                        await loadData();
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "删除失败");
                      }
                    }}
                    onAssetPreview={(asset) => {
                      if (getRenderableUrl(asset)) {
                        setGalleryPreview({ task, asset });
                      } else {
                        handleReuseTask(task, asset);
                      }
                    }}
                    anchorRef={isLatestTask ? latestTaskRef : undefined}
                  />
                );
              })
            ) : (
              <section className="empty-stage empty-stage-inline empty-stage-filtered">
                <div className="empty-stage-copy">
                  <p className="canvas-kicker">当前筛选</p>
                  <h1>没有匹配的生成记录</h1>
                  <p>调整时间、模型或状态筛选后，可以继续查看这个项目的历史任务。</p>
                </div>
              </section>
            )}
          </section>
        ) : activeView === "studio" && studioTab === "generate" ? (
          <section className="empty-stage empty-stage-inline">
            <div className="empty-stage-copy">
              <p className="canvas-kicker">当前项目</p>
              <h1>{workspaceName} 还没有生成记录</h1>
              <p>先从下方输入区发起第一轮生成，结果会在这里按时间沉淀下来。</p>
            </div>
          </section>
        ) : null}
        </div>

        {activeView === "studio" && studioTab === "generate" ? (
        <form className="composer-dock" onSubmit={handleSubmit}>
          <div className="composer-leading">
            <div>
              <span className="composer-label">当前创作</span>
              <strong>{workspaceName}</strong>
            </div>
            <div className="composer-statusline">
              <span>{selectedWorkflow?.name ?? "图像生成"}</span>
              <span>{selectedProvider?.model_name ?? studioForm.requestedProvider}</span>
              <span>{studioForm.aspectRatio} / {selectedResolution?.label ?? studioForm.resolution}</span>
              <span>{studioForm.imageCount} 张</span>
            </div>
          </div>

          <div className="composer-body">
            <button
              type="button"
              className={referencePreviewUrl ? "reference-dropzone has-preview" : "reference-dropzone"}
              onClick={openReferencePicker}
              onDrop={handleReferenceDrop}
              onDragOver={(event) => event.preventDefault()}
            >
              {referencePreviewUrl ? (
                <img src={referencePreviewUrl} alt={referenceFileName || "参考图"} className="reference-preview" />
              ) : (
                <span className="reference-dropzone-plus">+</span>
              )}
            </button>

            <label className="composer-textarea">
              <textarea
                rows={4}
                value={studioForm.prompt}
                onChange={(event) => setStudioForm((current) => ({ ...current, prompt: event.target.value }))}
                placeholder="上传参考图，输入文字或描述主体、场景和想要生成的画面。"
              />
              <span className="composer-textarea-hint">
                {referenceFileName
                  ? `已选择参考图：${referenceFileName}`
                  : "支持拖拽上传参考图，也可以点击左侧加号选择图片。"}
              </span>
            </label>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleReferenceInputChange} />

          <div className="composer-toolbar" ref={composerToolbarRef}>
            <div className="composer-menu">
              <button
                type="button"
                className={activeComposerMenu === "template" ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
                onClick={() => toggleComposerMenu("template")}
              >
                {activeTemplate?.label ?? "选择模板"}
              </button>
              {activeComposerMenu === "template" ? (
                <div className="composer-menu-panel composer-menu-panel-template">
                  <div className="template-section">
                    <div className="template-section-head">
                      <strong>热门提示词</strong>
                      <span>快速套用常用创作方向</span>
                    </div>
                    <div className="template-grid">
                      {featuredAtmosphereTemplates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          className={activeTemplate?.id === template.id ? "template-card is-active" : "template-card"}
                          onClick={() => handleApplyTemplate(template)}
                        >
                          <strong>{template.label}</strong>
                          <span>{template.deliverable}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="template-section">
                    <div className="template-section-head">
                      <strong>我的提示词</strong>
                      <span>保存、编辑你自己的常用提示词</span>
                    </div>
                    {customTemplates.length > 0 ? (
                      <div className="template-list">
                        {customTemplates.map((template) => (
                          <div key={template.id} className="template-list-item">
                            <button type="button" className="template-card template-card-main" onClick={() => handleApplyTemplate(template)}>
                              <strong>{template.label}</strong>
                              <span>{template.title}</span>
                            </button>
                            <div className="template-card-actions">
                              <button type="button" className="template-action-button" onClick={() => handleEditCustomTemplate(template)}>
                                编辑
                              </button>
                              <button type="button" className="template-action-button" onClick={() => handleDeleteCustomTemplate(template.id)}>
                                删除
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="template-empty">还没有自定义提示词，可以把当前创作内容保存下来。</div>
                    )}
                  </div>

                  <div className="template-editor">
                    <div className="template-section-head">
                      <strong>{editingTemplateId ? "编辑自定义提示词" : "保存当前提示词"}</strong>
                      <span>会保存当前的提示词、比例、分辨率、风格和补充说明</span>
                    </div>
                    <div className="template-editor-row">
                      <label className="composer-menu-field">
                        <span>名称</span>
                        <input
                          value={templateDraftLabel}
                          onChange={(event) => setTemplateDraftLabel(event.target.value)}
                          placeholder="例如：建筑氛围增强方案"
                        />
                      </label>
                      <label className="composer-menu-field">
                        <span>标题</span>
                        <input
                          value={templateDraftTitle}
                          onChange={(event) => setTemplateDraftTitle(event.target.value)}
                          placeholder="例如：建筑效果图氛围增强模板"
                        />
                      </label>
                    </div>
                    <div className="template-editor-actions">
                      <button type="button" className="ghost-button" onClick={handleSaveCustomTemplate}>
                        {editingTemplateId ? "更新提示词" : "保存当前提示词"}
                      </button>
                      {editingTemplateId ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => {
                            setEditingTemplateId(null);
                            setTemplateDraftLabel("");
                            setTemplateDraftTitle("");
                          }}
                        >
                          取消编辑
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="composer-menu">
              <button
                type="button"
                className={activeComposerMenu === "provider" ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
                onClick={() => toggleComposerMenu("provider")}
              >
                {selectedProvider?.model_name ?? "选择模型"}
              </button>
              {activeComposerMenu === "provider" ? (
                <div className="composer-menu-panel composer-menu-panel-list composer-menu-panel-provider">
                  {providerGroups.map((group) => (
                    <div key={group.label} className="provider-choice-group">
                      <span className="provider-choice-group-title">{group.label}</span>
                      {group.providers.map((provider) => (
                        <button
                          key={provider.provider_name}
                          type="button"
                          className={
                            studioForm.requestedProvider === provider.provider_name ? "composer-choice-item is-active" : "composer-choice-item"
                          }
                          onClick={() => {
                            setStudioForm((current) => ({ ...current, requestedProvider: provider.provider_name }));
                            setActiveComposerMenu(null);
                          }}
                        >
                          <strong>{provider.model_name}</strong>
                          <span>{provider.provider_name}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="composer-menu">
              <button
                type="button"
                className={activeComposerMenu === "display" ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
                onClick={() => toggleComposerMenu("display")}
              >
                {studioForm.aspectRatio} / {selectedResolution?.label ?? studioForm.resolution}
              </button>
              {activeComposerMenu === "display" ? (
                <div className="composer-menu-panel composer-menu-panel-display">
                  <div className="composer-menu-group">
                    <span className="composer-menu-title">比例</span>
                    <div className="composer-chip-grid">
                      {aspectRatioOptions.map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          className={studioForm.aspectRatio === ratio ? "composer-chip-button is-active" : "composer-chip-button"}
                          onClick={() => setStudioForm((current) => ({ ...current, aspectRatio: ratio }))}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="composer-menu-group">
                    <span className="composer-menu-title">分辨率</span>
                    <div className="composer-chip-grid composer-chip-grid-two">
                      {resolutionOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={studioForm.resolution === option.id ? "composer-chip-button is-active" : "composer-chip-button"}
                          onClick={() => setStudioForm((current) => ({ ...current, resolution: option.id }))}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="composer-menu">
              <button
                type="button"
                className={activeComposerMenu === "count" ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
                onClick={() => toggleComposerMenu("count")}
              >
                {studioForm.imageCount} 张
              </button>
              {activeComposerMenu === "count" ? (
                <div className="composer-menu-panel composer-menu-panel-list">
                  {[1, 2, 3, 4].map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={studioForm.imageCount === count ? "composer-choice-item is-active" : "composer-choice-item"}
                      onClick={() => {
                        setStudioForm((current) => ({ ...current, imageCount: count }));
                        setActiveComposerMenu(null);
                      }}
                    >
                      <strong>{count} 张</strong>
                      <span>{count === 1 ? "默认张数" : `一次生成 ${count} 张`}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="composer-toolbar-actions">
              <div className="composer-quickmeta">
                <span>{selectedStyle?.label ?? studioForm.style}</span>
                <span>{state.health === "healthy" ? "服务在线" : "服务异常"}</span>
              </div>

              <button
                type="submit"
                className="submit-button"
                disabled={submitting || uploadingReference || availableProviders.length === 0}
              >
                {submitting ? "正在创建..." : "开始生成"}
              </button>
            </div>
          </div>
        </form>
        ) : null}
        </>
        )}
          </>
        )}
      </main>
      {galleryPreview && getRenderableUrl(galleryPreview.asset) ? (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="生成图预览"
          onClick={() => setGalleryPreview(null)}
        >
          <div className="media-lightbox-surface" onClick={(event) => event.stopPropagation()}>
            <header className="media-lightbox-head">
              <span className="media-lightbox-title">{galleryPreview.asset.name}</span>
              <button type="button" className="media-lightbox-close" aria-label="关闭" onClick={() => setGalleryPreview(null)}>
                ×
              </button>
            </header>
            <div className="media-lightbox-body">
              <img src={getRenderableUrl(galleryPreview.asset)!} alt="" />
            </div>
            <footer className="media-lightbox-foot">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  handleReuseTask(galleryPreview.task, galleryPreview.asset);
                  setGalleryPreview(null);
                }}
              >
                填入创作框
              </button>
              <button type="button" className="submit-button" onClick={() => setGalleryPreview(null)}>
                关闭
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
