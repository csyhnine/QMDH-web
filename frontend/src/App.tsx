import { type CSSProperties, type ChangeEvent, type DragEvent, type FormEvent, type RefObject, useEffect, useRef, useState } from "react";

import {
  api,
  type Asset,
  type Project,
  type PromptTemplateRecord,
  type Provider,
  type Task,
  type Workflow
} from "./api";

type LoadState = {
  health: string;
  projects: Project[];
  providers: Provider[];
  workflows: Workflow[];
  tasks: Task[];
  assets: Asset[];
  error: string;
  ready: boolean;
};

type StudioFormState = {
  title: string;
  prompt: string;
  workflowKey: string;
  projectCode: string;
  requestedProvider: string;
  userName: string;
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

type CustomPromptTemplate = Omit<PromptTemplateRecord, "id" | "aspect_ratio" | "updated_at"> & {
  id: number | string;
  aspectRatio?: string;
  aspect_ratio?: string;
  updatedAt?: string;
  updated_at?: string;
};

type FeedFilterState = {
  sort: "latest" | "oldest";
  status: "all" | "running" | "completed";
  provider: string;
};

type ComposerMenuKey = "template" | "workflow" | "provider" | "display" | "count" | null;

const initialState: LoadState = {
  health: "loading",
  projects: [],
  providers: [],
  workflows: [],
  tasks: [],
  assets: [],
  error: "",
  ready: false
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

const hotPromptTemplates: PromptTemplate[] = [
  {
    id: "riverfront",
    label: "滨水更新",
    title: "滨水更新生图方案",
    prompt: "滨水复合街区，连续骑行步道，首层商业外摆，玻璃与浅色石材立面，清晨柔光，适合作为方案汇报首页。",
    style: "modern",
    aspectRatio: "16:9",
    resolution: "2k",
    deliverable: "首页主视觉",
    notes: "强调开放公共界面与亲水空间，避免过度赛博风。"
  },
  {
    id: "night-scene",
    label: "商业夜景",
    title: "街角商业夜景效果图",
    prompt: "街角商业综合体，暖色灯光克制，雨后路面轻微反射，入口节点有识别度，真实摄影视角。",
    style: "cinematic",
    aspectRatio: "3:2",
    resolution: "2k",
    deliverable: "夜景效果图",
    notes: "控制灯光层次，保留真实尺度感和人流。"
  },
  {
    id: "cultural-hub",
    label: "文化综合体",
    title: "文化综合体概念图",
    prompt: "文化综合体入口广场，厚重体块与通透界面并置，前景有人群停留，天空通透，强调城市客厅气质。",
    style: "editorial",
    aspectRatio: "4:3",
    resolution: "4k",
    deliverable: "方案概念图",
    notes: "突出入口仪式感和公共活动场景。"
  },
  {
    id: "commercial-plaza",
    label: "商业广场",
    title: "商业广场主入口效果图",
    prompt: "城市商业广场主入口，层叠雨棚，玻璃幕墙，导视醒目，人流活跃，日间通透光影，适合招商展示。",
    style: "modern",
    aspectRatio: "16:9",
    resolution: "2k",
    deliverable: "入口主视觉",
    notes: "强调入口昭示性和商业氛围，但不要过度夸张。"
  },
  {
    id: "landscape-axis",
    label: "景观轴线",
    title: "中央景观轴概念图",
    prompt: "中央景观轴，连续水景与林荫步道，局部休憩平台，低维护植物配置，黄昏柔光，构图简洁。",
    style: "minimal",
    aspectRatio: "3:2",
    resolution: "2k",
    deliverable: "景观概念图",
    notes: "控制色彩，突出空间秩序和慢行体验。"
  }
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
  workflowKey: "image-generate",
  projectCode: "QMDH-001",
  requestedProvider: "modelscope_free_image",
  userName: "reviewer",
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
    aspectRatio: template.aspect_ratio ?? template.aspectRatio ?? "16:9",
    resolution: template.resolution,
    deliverable: template.deliverable,
    notes: template.notes
  };
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
  const [state, setState] = useState<LoadState>(initialState);
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
  const [editingTemplateId, setEditingTemplateId] = useState<number | string | null>(null);
  const isFetchingRef = useRef(false);
  const composerToolbarRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const latestTaskRef = useRef<HTMLElement | null>(null);
  const hasAutoPositionedRef = useRef(false);

  async function loadData() {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const [health, projects, providers, workflows, tasks, assets, templates] = await Promise.all([
        api.health(),
        api.projects(),
        api.providers(),
        api.workflows(),
        api.tasks(),
        api.assets(),
        api.promptTemplates(studioForm.userName).catch(() => null)
      ]);

      setState({
        health: health.status,
        projects,
        providers,
        workflows,
        tasks,
        assets,
        error: "",
        ready: true
      });
      if (templates) {
        setCustomTemplates(templates);
      }
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      setState((current) => ({
        ...current,
        health: "error",
        error: error instanceof Error ? error.message : "加载失败"
      }));
    } finally {
      isFetchingRef.current = false;
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadData();
    }, 8000);

    return () => window.clearInterval(timer);
  }, []);

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

  const studioWorkflows = state.workflows.filter(
    (workflow) => workflow.key === "image-generate" || workflow.key === "video-generate"
  );
  const selectedWorkflow = studioWorkflows.find((workflow) => workflow.key === studioForm.workflowKey) ?? studioWorkflows[0];
  const isVideoWorkflow = selectedWorkflow?.key === "video-generate";

  const availableProviders = !isVideoWorkflow
    ? state.providers.filter((provider) =>
        selectedWorkflow ? provider.capabilities.includes(selectedWorkflow.provider_capability) : false
      )
    : [];

  const activeProject = state.projects.find((project) => project.code === studioForm.projectCode);
  const workspaceName = activeProject?.name ?? "默认创作";
  const selectedProvider = availableProviders.find((provider) => provider.provider_name === studioForm.requestedProvider);
  const selectedStyle = stylePresets.find((preset) => preset.id === studioForm.style);
  const selectedResolution = resolutionOptions.find((option) => option.id === studioForm.resolution);

  const imageAssets = state.assets.filter((asset) => asset.asset_type === "image");
  const imageTasks = state.tasks.filter(
    (task) => task.workflow_key === "image-generate" && task.project_code === studioForm.projectCode
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
  const hasHistory = filteredTasks.length > 0;
  const showCenteredComposer = !hasHistory;
  const activeTemplate =
    [...featuredAtmosphereTemplates, ...customTemplates].find(
      (template) => template.title === studioForm.title && template.prompt === studioForm.prompt
    ) ?? null;

  useEffect(() => {
    if (isVideoWorkflow) {
      setActiveComposerMenu((current) => (current === "provider" ? null : current));
    }
  }, [isVideoWorkflow]);

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
    hasAutoPositionedRef.current = false;
  }, [studioForm.projectCode]);

  useEffect(() => {
    if (!state.ready || !hasHistory || hasAutoPositionedRef.current) return;

    window.requestAnimationFrame(() => {
      latestTaskRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      hasAutoPositionedRef.current = true;
    });
  }, [state.ready, hasHistory, latestTask?.id]);

  function syncTemplateDraftWithCurrentForm() {
    setTemplateDraftLabel(activeTemplate?.label ?? "");
    setTemplateDraftTitle(studioForm.title);
  }

  function handleProjectSelect(project: Project) {
    setStudioForm((current) => {
      const suggestedTitle = `${project.name} 生图方案`;
      const shouldReplaceTitle =
        current.title.trim() === "" ||
        current.title === defaultStudioForm.title ||
        current.title.endsWith("生图方案") ||
        current.title === `${workspaceName} 生图方案`;

      return {
        ...current,
        projectCode: project.code,
        title: shouldReplaceTitle ? suggestedTitle : current.title
      };
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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
      title: `${workspaceName} 生图方案`
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

  async function handleDeleteCustomTemplate(templateId: number | string) {
    try {
      const numericTemplateId = Number(templateId);
      await api.deletePromptTemplate(numericTemplateId, studioForm.userName);
      setCustomTemplates((current) => current.filter((template) => Number(template.id) !== numericTemplateId));
      if (Number(editingTemplateId) === numericTemplateId) {
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

    if (false && !label) {
      setState((current) => ({
        ...current,
        error: "请先填写自定义提示词名称"
      }));
      return;
    }

    if (false && !prompt) {
      setState((current) => ({
        ...current,
        error: "请先填写提示词内容后再保存"
      }));
      return;
    }

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
          user_name: studioForm.userName,
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
          [createdTemplate, ...current].sort(
            (left, right) =>
              new Date(right.updated_at ?? right.updatedAt ?? 0).getTime() -
              new Date(left.updated_at ?? left.updatedAt ?? 0).getTime()
          )
        );
        setEditingTemplateId(createdTemplate.id);
      } else {
        const templateId = Number(editingTemplateId);
        const updatedTemplate = await api.updatePromptTemplate(templateId, studioForm.userName, {
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
          [updatedTemplate, ...current.filter((template) => Number(template.id) !== updatedTemplate.id)].sort(
            (left, right) =>
              new Date(right.updated_at ?? right.updatedAt ?? 0).getTime() -
              new Date(left.updated_at ?? left.updatedAt ?? 0).getTime()
          )
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
      return;
    }

    const nextTemplate: CustomPromptTemplate = {
      id: editingTemplateId ?? `custom-${Date.now()}`,
      label,
      title: title || `${workspaceName} 自定义提示词`,
      prompt,
      style: studioForm.style,
      aspectRatio: studioForm.aspectRatio,
      resolution: studioForm.resolution,
      deliverable: studioForm.deliverable,
      notes: studioForm.notes,
      updatedAt: new Date().toISOString()
    };

    setCustomTemplates((current) => {
      const nextTemplates = current.filter((template) => template.id !== nextTemplate.id);
      return [nextTemplate, ...nextTemplates].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      );
    });
    setEditingTemplateId(nextTemplate.id);
    setState((current) => ({
      ...current,
      error: ""
    }));
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

    if (isVideoWorkflow) {
      setState((current) => ({
        ...current,
        error: "视频生成模块待开发，当前版本暂不支持提交。"
      }));
      return;
    }

    setSubmitting(true);

    try {
      await api.createTask({
        title: studioForm.title.trim() || `${workspaceName} 生图方案`,
        workflow_key: studioForm.workflowKey,
        project_code: studioForm.projectCode,
        requested_provider: studioForm.requestedProvider,
        user_name: studioForm.userName,
        classification: studioForm.classification,
        payload: buildImagePayload(studioForm)
      });
      await loadData();
      window.requestAnimationFrame(() => {
        latestTaskRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
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

  return (
    <div className="studio-shell">
      <aside className="global-rail">
        <div className="rail-logo">Q</div>
        <nav className="rail-nav">
          <button type="button" className="rail-item">
            <span>灵感</span>
          </button>
          <button type="button" className="rail-item active">
            <span>生成</span>
          </button>
          <button type="button" className="rail-item">
            <span>资产</span>
          </button>
          <button type="button" className="rail-item">
            <span>画布</span>
          </button>
        </nav>
        <div className="rail-footer">
          <div className={`rail-health rail-health-${state.health}`}>{formatStatus(state.health)}</div>
          <span className="rail-sync">{lastSyncedAt ? formatDate(lastSyncedAt) : "等待同步"}</span>
        </div>
      </aside>

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

      <main className={showCenteredComposer ? "canvas-area canvas-area-empty" : "canvas-area"}>
        {hasHistory ? (
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

        {hasHistory ? (
          <section className="feed-stream">
            {filteredTasks.map((task) => {
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
            })}
          </section>
        ) : (
          <section className="empty-stage">
            <div className="empty-stage-copy">
              <p className="canvas-kicker">QMDH / IMAGE STUDIO</p>
              <h1>你好，想创作什么？</h1>
              <p>输入想法、脚本或参考方向，生成记录会在这里按时间沉淀下来。</p>
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
              <span>{isVideoWorkflow ? "待开发" : (selectedProvider?.model_name ?? studioForm.requestedProvider)}</span>
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
                placeholder={
                  isVideoWorkflow
                    ? "输入视频脚本、镜头描述与运动方式。该功能当前待开发。"
                    : "上传参考图，输入文字或描述主体、场景和想要生成的画面。"
                }
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
                className={activeComposerMenu === "workflow" ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
                onClick={() => toggleComposerMenu("workflow")}
              >
                {selectedWorkflow?.name ?? "创作类型"}
              </button>
              {activeComposerMenu === "workflow" ? (
                <div className="composer-menu-panel composer-menu-panel-list">
                  {studioWorkflows.map((workflow) => {
                    const waiting = workflow.key === "video-generate";

                    return (
                      <button
                        key={workflow.id}
                        type="button"
                        className={studioForm.workflowKey === workflow.key ? "composer-choice-item is-active" : "composer-choice-item"}
                        onClick={() => {
                          setStudioForm((current) => ({ ...current, workflowKey: workflow.key }));
                          setActiveComposerMenu(null);
                        }}
                      >
                        <strong>{workflow.name}</strong>
                        <span>{waiting ? "待开发，当前仅展示入口" : workflow.description}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="composer-menu">
              <button
                type="button"
                disabled={isVideoWorkflow}
                className={
                  isVideoWorkflow
                    ? "composer-menu-trigger is-disabled"
                    : activeComposerMenu === "provider"
                      ? "composer-menu-trigger is-open"
                      : "composer-menu-trigger"
                }
                onClick={() => toggleComposerMenu("provider")}
              >
                {isVideoWorkflow ? "待开发" : (selectedProvider?.model_name ?? "选择模型")}
              </button>
              {activeComposerMenu === "provider" && !isVideoWorkflow ? (
                <div className="composer-menu-panel composer-menu-panel-list">
                  {availableProviders.map((provider) => (
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
                disabled={submitting || uploadingReference || isVideoWorkflow || availableProviders.length === 0}
              >
                {isVideoWorkflow ? "视频生成待开发" : submitting ? "正在创建..." : "开始生成"}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
