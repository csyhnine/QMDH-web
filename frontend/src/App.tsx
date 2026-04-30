import { type CSSProperties, type ChangeEvent, type DragEvent, type FormEvent, type RefObject, useEffect, useRef, useState } from "react";

import {
  api,
  clearStoredAuthToken,
  type Asset,
  type AuthUser,
  type DashboardStats,
  getStoredAuthToken,
  type ManagedUser,
  type Project,
  type PromptTemplateRecord,
  type Provider,
  type ProviderProfileCreatePayload,
  type ProviderProfileRecord,
  setStoredAuthToken,
  type Task,
  type UserCreatePayload,
  type Workflow
} from "./api";

type LoadState = {
  health: string;
  projects: Project[];
  providers: Provider[];
  providerProfiles: ProviderProfileRecord[];
  workflows: Workflow[];
  tasks: Task[];
  assets: Asset[];
  users: ManagedUser[];
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
type ActiveView = "studio" | "models" | "users" | "dashboard";

type ProviderProfileDraft = {
  providerName: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
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

const IMAGE_WORKFLOW_KEY = "image-generate";

const initialState: LoadState = {
  health: "loading",
  projects: [],
  providers: [],
  providerProfiles: [],
  workflows: [],
  tasks: [],
  assets: [],
  users: [],
  dashboard: null,
  error: "",
  ready: false
};

const defaultProviderProfileDraft: ProviderProfileDraft = {
  providerName: "",
  apiKey: "",
  baseUrl: "",
  modelName: "",
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

const defaultStudioForm: StudioFormState = {
  title: featuredAtmosphereTemplates[0].title,
  prompt: featuredAtmosphereTemplates[0].prompt,
  projectCode: "QMDH-001",
  requestedProvider: "modelscope_free_image",
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

function buildImagePayload(form: StudioFormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    prompt: form.prompt,
    style: form.style,
    aspect_ratio: form.aspectRatio,
    resolution: form.resolution,
    image_count: clampImageCount(form.imageCount),
    deliverable: form.deliverable,
    prompt_supplement: form.notes,
    reference_image: form.referenceImage
  };

  return Object.fromEntries(Object.entries(payload).filter(([, value]) => Boolean(value)));
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
    apiKey: "",
    baseUrl: profile.base_url,
    modelName: profile.model_name,
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
    adapter_kind: "openai_compatible",
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
  onLike: () => void;
  onShare: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const summary =
    props.asset?.prompt_text ??
    (props.task.result["summary"]
      ? String(props.task.result["summary"])
      : props.task.result["error"]
        ? String(props.task.result["error"])
        : "等待结果返回。");

  return (
    <article className="feed-card" ref={props.anchorRef}>
      <div className="feed-card-head">
        <div className="feed-card-avatar">{props.task.requested_provider.slice(0, 1).toUpperCase()}</div>
        <div className="feed-card-copy">
          <div className="feed-card-topline">
            <strong>{props.task.title}</strong>
            <span className={`status-pill status-${props.task.status}`}>{formatStatus(props.task.status)}</span>
          </div>
          <p>{summary}</p>
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
            <button key={asset.id} type="button" className="feed-gallery-item" onClick={props.onReuse}>
              <AssetTile asset={asset} emphasis={index === 0 ? "primary" : "secondary"} />
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
          <button type="button" className="ghost-button" onClick={props.onLike} disabled={!props.asset}>
            点赞 {props.asset?.like_count ?? 0}
          </button>
          <button type="button" className="ghost-button" onClick={props.onShare} disabled={!props.asset}>
            分享 {props.asset?.share_count ?? 0}
          </button>
        </div>
        <span className="feed-card-time">{formatDate(props.task.created_at)}</span>
      </div>
    </article>
  );
}

export default function App() {
  const activeView = resolveActiveView();
  const [state, setState] = useState<LoadState>(initialState);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [studioForm, setStudioForm] = useState<StudioFormState>(defaultStudioForm);
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
  const [userDraft, setUserDraft] = useState<UserDraft>(defaultUserDraft);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const isFetchingRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const composerToolbarRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const latestTaskRef = useRef<HTMLElement | null>(null);
  const hasAutoPositionedRef = useRef(false);

  async function loadData(options: { force?: boolean } = {}) {
    if (isFetchingRef.current && !options.force) return;
    isFetchingRef.current = true;
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    try {
      const [health, projects, providers, providerProfiles, workflows, tasks, assets, templates, users, dashboard] = await Promise.all([
        api.health(),
        api.projects(),
        api.providers(),
        activeView === "models" ? api.providerProfiles().catch(() => []) : Promise.resolve([]),
        api.workflows(),
        api.tasks(),
        api.assets(),
        api.promptTemplates().catch(() => null),
        activeView === "users" ? api.users().catch(() => []) : Promise.resolve([]),
        activeView === "dashboard" ? api.dashboardStats().catch(() => null) : Promise.resolve(null)
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

  const selectedWorkflow = state.workflows.find((workflow) => workflow.key === IMAGE_WORKFLOW_KEY);

  const availableProviders = state.providers.filter((provider) =>
    selectedWorkflow
      ? isRuntimeImageProvider(provider) && provider.capabilities.includes(selectedWorkflow.provider_capability)
      : false
  );
  const providerGroups = groupProviders(availableProviders);

  const activeProject = state.projects.find((project) => project.code === studioForm.projectCode);
  const workspaceName = activeProject?.name ?? "默认创作";
  const selectedProvider = availableProviders.find((provider) => provider.provider_name === studioForm.requestedProvider);
  const selectedStyle = stylePresets.find((preset) => preset.id === studioForm.style);
  const selectedResolution = resolutionOptions.find((option) => option.id === studioForm.resolution);

  const imageAssets = state.assets.filter((asset) => asset.asset_type === "image");
  const imageTasks = state.tasks.filter(
    (task) => task.workflow_key === IMAGE_WORKFLOW_KEY && task.project_code === studioForm.projectCode
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
  const showCenteredComposer = !hasProjectHistory;
  const activeTemplate =
    [...featuredAtmosphereTemplates, ...customTemplates].find(
      (template) => template.title === studioForm.title && template.prompt === studioForm.prompt
    ) ?? null;

  useEffect(() => {
    if (availableProviders.length === 0) return;
    if (!availableProviders.some((provider) => provider.provider_name === studioForm.requestedProvider)) {
      const preferredProvider =
        availableProviders.find((provider) => provider.provider_name === "modelscope_free_image")?.provider_name ??
        availableProviders[0].provider_name;

      setStudioForm((current) => ({
        ...current,
        requestedProvider: preferredProvider
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
        workflow_key: IMAGE_WORKFLOW_KEY,
        project_code: studioForm.projectCode,
        requested_provider: studioForm.requestedProvider,
        classification: studioForm.classification,
        payload: buildImagePayload(studioForm)
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

  async function handleGalleryAction(action: "like" | "share", assetId: number) {
    try {
      if (action === "like") {
        await api.likeAsset(assetId);
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
    window.location.href = "/";
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
  const isAdminView = activeView === "models" || activeView === "users" || activeView === "dashboard";
  const dashboardModelTotal = state.dashboard ? sumMetric(state.dashboard.model_rankings, "count") : 0;
  const dashboardAccountQuotaTotal = state.dashboard ? sumMetric(state.dashboard.account_usage, "quota_limit") : 0;
  const dashboardAccountUsedTotal = state.dashboard ? sumMetric(state.dashboard.account_usage, "quota_used") : 0;
  const dashboardProjectTotal = state.dashboard ? sumMetric(state.dashboard.project_rankings, "count") : 0;
  const dashboardFailureTotal = state.dashboard ? sumMetric(state.dashboard.failure_reasons, "count") : 0;

  return (
    <div className={isAdminView ? "studio-shell admin-shell" : "studio-shell"}>
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
                <span>运营看板</span>
              </button>
              <button
                type="button"
                className={activeView === "users" ? "rail-item active" : "rail-item"}
                onClick={() => (window.location.href = "/admin/users")}
              >
                <span>账号管理</span>
              </button>
              <button
                type="button"
                className={activeView === "models" ? "rail-item active" : "rail-item"}
                onClick={() => (window.location.href = "/admin/models")}
              >
                <span>模型管理</span>
              </button>
              <button type="button" className="rail-item">
                <span>账单管理</span>
              </button>
              <button type="button" className="rail-item">
                <span>告警中心</span>
              </button>
              <button type="button" className="rail-item">
                <span>设置中心</span>
              </button>
            </>
          ) : (
            <>
              <button type="button" className="rail-item">
                <span>灵感</span>
              </button>
              <button type="button" className="rail-item active">
                <span>生成</span>
              </button>
              <button type="button" className="rail-item">
                <span>画布</span>
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

      {activeView === "studio" ? (
        <aside className="workspace-pane">
        <div className="workspace-header">
          <div>
            <p className="workspace-kicker">开启创作</p>
            <h2>{workspaceName}</h2>
            <p>{activeProject?.summary ?? "从左侧切换项目，中间区域会按时间流展示这个项目的历史生成记录。"}</p>
          </div>
        </div>

        <button type="button" className="workspace-primary" onClick={handleResetComposer}>
          新对话
        </button>

        <div className="workspace-list">
          {state.projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={project.code === studioForm.projectCode ? "workspace-item active" : "workspace-item"}
              onClick={() => handleProjectSelect(project)}
            >
              <strong>{project.name}</strong>
              <span>
                {project.code} / {project.classification}
              </span>
            </button>
          ))}
        </div>
        </aside>
      ) : null}

      <main className={isAdminView ? "canvas-area model-admin-area" : showCenteredComposer ? "canvas-area canvas-area-empty" : "canvas-area"}>
        {activeView === "users" ? (
          <section className="model-admin">
            <header className="canvas-title model-admin-head">
              <p className="canvas-kicker">QMDH / USER ADMIN</p>
              <h1>账号管理</h1>
              <p>创建和停用设计师账号，分配角色与可访问项目。</p>
              <div className="template-card-actions">
                <button type="button" className="ghost-button" onClick={() => (window.location.href = "/admin/dashboard")}>使用看板</button>
                <button type="button" className="ghost-button" onClick={() => (window.location.href = "/admin/models")}>运维配置</button>
              </div>
            </header>

            {!userCanManageUsers ? (
              <div className="floating-error">当前账号没有用户管理权限。</div>
            ) : (
              <div className="model-admin-layout">
                <form className="model-profile-form" onSubmit={handleSaveUser}>
                  <div className="template-section-head">
                    <strong>{editingUserId === null ? "新增账号" : "编辑账号"}</strong>
                    <span>项目权限用英文逗号分隔，使用 * 可访问全部项目。</span>
                  </div>
                  <div className="model-form-grid">
                    <label className="composer-menu-field">
                      <span>用户名</span>
                      <input value={userDraft.name} disabled={editingUserId !== null} onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))} />
                    </label>
                    <label className="composer-menu-field">
                      <span>显示名</span>
                      <input value={userDraft.displayName} onChange={(event) => setUserDraft((current) => ({ ...current, displayName: event.target.value }))} />
                    </label>
                    <label className="composer-menu-field">
                      <span>角色</span>
                      <select value={userDraft.role} onChange={(event) => setUserDraft((current) => ({ ...current, role: event.target.value }))}>
                        <option value="designer">designer</option>
                        <option value="ops">ops</option>
                        <option value="admin">admin</option>
                        <option value="owner">owner</option>
                      </select>
                    </label>
                    <label className="composer-menu-field">
                      <span>{editingUserId === null ? "初始密码" : "重置密码"}</span>
                      <input type="password" value={userDraft.password} onChange={(event) => setUserDraft((current) => ({ ...current, password: event.target.value }))} />
                    </label>
                    <label className="composer-menu-field composer-menu-field-full">
                      <span>项目权限</span>
                      <input value={userDraft.projectCodes} onChange={(event) => setUserDraft((current) => ({ ...current, projectCodes: event.target.value }))} placeholder="QMDH-001 或 *" />
                    </label>
                    <label className="composer-menu-field">
                      <span>月度额度</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={userDraft.monthlyQuota}
                        onChange={(event) => setUserDraft((current) => ({ ...current, monthlyQuota: event.target.value }))}
                        placeholder="留空表示不限额"
                      />
                    </label>
                  </div>
                  <label className="model-toggle">
                    <input type="checkbox" checked={userDraft.isActive} onChange={(event) => setUserDraft((current) => ({ ...current, isActive: event.target.checked }))} />
                    <span>启用账号</span>
                  </label>
                  {state.error ? <div className="floating-error">{state.error}</div> : null}
                  <div className="template-editor-actions">
                    <button type="submit" className="submit-button" disabled={savingUser}>{savingUser ? "保存中..." : "保存账号"}</button>
                    {editingUserId !== null ? <button type="button" className="ghost-button" onClick={resetUserDraft}>取消编辑</button> : null}
                  </div>
                </form>

                <section className="model-profile-list">
                  <div className="template-section-head">
                    <strong>账号列表</strong>
                    <span>{state.users.length} 个账号</span>
                  </div>
                  {state.users.map((user) => (
                    <article key={user.id} className="model-profile-card">
                      <div className="feed-card-topline">
                        <strong>{user.display_name || user.name}</strong>
                        <span className={`status-pill ${user.is_active ? "status-completed" : "status-failed"}`}>{user.is_active ? "active" : "disabled"}</span>
                      </div>
                      <p>{user.name}</p>
                      <div className="feed-card-meta">
                        <span>{user.role}</span>
                        <span>{user.project_codes.join(", ")}</span>
                        <span>{user.monthly_quota === null ? "不限额" : `${user.monthly_quota} cost unit/月`}</span>
                        <span>{user.last_login_at ? formatDate(user.last_login_at) : "未登录"}</span>
                      </div>
                      <div className="template-card-actions">
                        <button type="button" className="template-action-button" onClick={() => handleEditUser(user)}>编辑</button>
                        <button type="button" className="template-action-button" onClick={() => handleDeactivateUser(user.id)}>停用</button>
                      </div>
                    </article>
                  ))}
                </section>
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
                  <button type="button" className="active">日</button>
                  <button type="button">周</button>
                  <button type="button">月</button>
                </div>
                <div className="ops-date-range">
                  <span>最近 30 天</span>
                  <span>至</span>
                  <span>{lastSyncedAt ? formatDate(lastSyncedAt) : "当前"}</span>
                </div>
                <button type="button" className="ops-icon-button" onClick={() => void loadData({ force: true })}>刷新</button>
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
                      <h2>真实成本趋势</h2>
                      <span>单位：{state.dashboard.cost_unit}</span>
                    </div>
                    <div className="ops-line-chart">
                      <div className="ops-y-axis"><span>200</span><span>150</span><span>100</span><span>50</span><span>0</span></div>
                      <svg viewBox="0 0 560 220" role="img" aria-label="真实成本趋势">
                        <defs>
                          <linearGradient id="costFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#3778f6" stopOpacity="0.24" />
                            <stop offset="100%" stopColor="#3778f6" stopOpacity="0.02" />
                          </linearGradient>
                        </defs>
                        <path d="M20 160 L120 72 L220 110 L320 176 L420 168 L520 128" fill="none" stroke="#3778f6" strokeWidth="4" />
                        <path d="M20 160 L120 72 L220 110 L320 176 L420 168 L520 128 L520 210 L20 210 Z" fill="url(#costFill)" />
                        {[["20", "160"], ["120", "72"], ["220", "110"], ["320", "176"], ["420", "168"], ["520", "128"]].map(([cx, cy]) => (
                          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" fill="#3778f6" stroke="white" strokeWidth="3" />
                        ))}
                      </svg>
                      <div className="ops-x-axis"><span>05-07</span><span>05-08</span><span>05-09</span><span>05-10</span><span>05-11</span><span>05-12</span></div>
                    </div>
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
                    <div className="ops-stacked-chart">
                      {["05-07", "05-08", "05-09", "05-10", "05-11", "05-12", "05-13"].map((day, dayIndex) => (
                        <div key={day} className="ops-stack-day">
                          <div>
                            {state.dashboard.model_rankings.slice(0, 5).map((row, index) => (
                              <span
                                key={`${day}-${metricValue(row, "name")}`}
                                style={{
                                  height: `${Math.max(10, percentOf(metricNumber(row, "count"), dashboardModelTotal) * (0.72 + ((dayIndex + index) % 3) * 0.16))}%`,
                                  background: chartColors[index % chartColors.length]
                                }}
                              />
                            ))}
                          </div>
                          <small>{day}</small>
                        </div>
                      ))}
                    </div>
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
          <section className="model-admin">
            <header className="canvas-title model-admin-head">
              <p className="canvas-kicker">QMDH / MODEL ADMIN</p>
              <h1>模型与 Key 管理</h1>
              <p>管理可用于图像生成的 OpenAI-compatible 模型配置。Key 只会在后端保存，前端只显示脱敏结果。</p>
              <div className="template-card-actions">
                <button type="button" className="ghost-button" onClick={() => (window.location.href = "/admin/dashboard")}>使用看板</button>
                {userCanManageUsers ? <button type="button" className="ghost-button" onClick={() => (window.location.href = "/admin/users")}>账号管理</button> : null}
              </div>
            </header>

            {state.error ? <div className="floating-error">{state.error}</div> : null}

            <div className="model-admin-layout">
              <form className="model-profile-form" onSubmit={handleSaveProviderProfile}>
                <div className="template-section-head">
                  <strong>{editingProviderProfileId === null ? "新增模型配置" : "编辑模型配置"}</strong>
                  <span>保存后会立即进入生成模型列表，停用后不会再参与任务选择。</span>
                </div>

                <div className="model-form-grid">
                  <label className="composer-menu-field">
                    <span>Provider</span>
                    <input
                      value={providerDraft.providerName}
                      disabled={editingProviderProfileId !== null}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, providerName: event.target.value }))}
                      placeholder="modelscope_arch"
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>Model</span>
                    <input
                      value={providerDraft.modelName}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, modelName: event.target.value }))}
                      placeholder="Qwen/Qwen-Image"
                    />
                  </label>
                  <label className="composer-menu-field composer-menu-field-full">
                    <span>Base URL</span>
                    <input
                      value={providerDraft.baseUrl}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, baseUrl: event.target.value }))}
                      placeholder="https://api-inference.modelscope.cn/v1"
                    />
                  </label>
                  <label className="composer-menu-field composer-menu-field-full">
                    <span>API Key</span>
                    <input
                      type="password"
                      value={providerDraft.apiKey}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, apiKey: event.target.value }))}
                      placeholder={editingProviderProfileId === null ? "新增时必填" : "留空则保留已保存 key"}
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>Capabilities</span>
                    <input
                      value={providerDraft.capabilities}
                      onChange={(event) => setProviderDraft((current) => ({ ...current, capabilities: event.target.value }))}
                      placeholder="image.generate"
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

              <section className="model-profile-list">
                <div className="template-section-head">
                  <strong>已保存配置</strong>
                  <span>{state.providerProfiles.length} 条后台配置，当前运行时共 {state.providers.length} 个 provider。</span>
                </div>
                {state.providerProfiles.length > 0 ? (
                  state.providerProfiles.map((profile) => (
                    <article key={profile.id} className="model-profile-card">
                      <div>
                        <div className="feed-card-topline">
                          <strong>{profile.provider_name}</strong>
                          <span className={`status-pill ${profile.enabled ? "status-completed" : "status-failed"}`}>
                            {profile.enabled ? "enabled" : "disabled"}
                          </span>
                        </div>
                        <p>{profile.model_name}</p>
                        <div className="feed-card-meta">
                          <span>{profile.capabilities.join(", ")}</span>
                          <span>{profile.masked_api_key || "no key"}</span>
                          <span>{profile.unit_price} {profile.pricing_currency} / {profile.pricing_unit}</span>
                          <span>{profile.reference_mode}</span>
                        </div>
                      </div>
                      <div className="model-profile-url">{profile.base_url}</div>
                      <div className="template-card-actions">
                        <button type="button" className="template-action-button" onClick={() => handleEditProviderProfile(profile)}>
                          编辑
                        </button>
                        <button type="button" className="template-action-button" onClick={() => handleDeleteProviderProfile(profile.id)}>
                          删除
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="template-empty">还没有后台模型配置；当前仍会读取 .env 中的 provider。</div>
                )}
              </section>
            </div>
          </section>
        ) : (
          <>
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

        {hasProjectHistory ? (
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
                    onLike={() => (linkedAsset ? void handleGalleryAction("like", linkedAsset.id) : undefined)}
                    onShare={() => (linkedAsset ? void handleGalleryAction("share", linkedAsset.id) : undefined)}
                    anchorRef={isLatestTask ? latestTaskRef : undefined}
                  />
                );
              })
            ) : (
              <section className="empty-stage empty-stage-filtered">
                <div className="empty-stage-copy">
                  <p className="canvas-kicker">QMDH / IMAGE STUDIO</p>
                  <h1>没有匹配的生成记录</h1>
                  <p>调整时间、模型或状态筛选后，可以继续查看这个项目的历史任务。</p>
                </div>
              </section>
            )}
          </section>
        ) : (
          <section className="empty-stage">
            <div className="empty-stage-copy">
              <p className="canvas-kicker">QMDH / IMAGE STUDIO</p>
              <h1>你好，想创作什么？</h1>
              <p>上传参考图，输入主体、场景和氛围方向，生成记录会在这里按时间沉淀下来。</p>
            </div>
          </section>
        )}

        <form className={showCenteredComposer ? "composer-dock composer-dock-centered" : "composer-dock"} onSubmit={handleSubmit}>
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
                <span>{state.health === "ok" ? "服务在线" : "服务异常"}</span>
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
          </>
        )}
      </main>
    </div>
  );
}
