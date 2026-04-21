import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from "react";

import { api, type Asset, type Project, type Provider, type Task, type Workflow } from "./api";

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

type ImageFormState = {
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

type FeedFilterState = {
  sort: "latest" | "oldest";
  status: "all" | "running" | "completed";
  provider: string;
};

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

const promptTemplates: PromptTemplate[] = [
  {
    id: "riverfront",
    label: "滨水更新",
    title: "滨水更新概念图",
    prompt: "滨水复合街区，连续骑行步道，首层商业外摆，玻璃与浅色石材立面，清晨柔光，适合方案汇报首页。",
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
  }
];

const defaultImageForm: ImageFormState = {
  title: promptTemplates[0].title,
  prompt: promptTemplates[0].prompt,
  workflowKey: "image-generate",
  projectCode: "QMDH-001",
  requestedProvider: "modelscope_free_image",
  userName: "reviewer",
  classification: "B",
  style: promptTemplates[0].style,
  aspectRatio: promptTemplates[0].aspectRatio,
  resolution: promptTemplates[0].resolution,
  imageCount: 1,
  deliverable: promptTemplates[0].deliverable,
  referenceImage: "",
  notes: promptTemplates[0].notes
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

function buildImagePayload(form: ImageFormState): Record<string, unknown> {
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

function applyTemplateToForm(template: PromptTemplate, current: ImageFormState): ImageFormState {
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

function clampImageCount(value: number): number {
  return Math.max(1, Math.min(4, Math.trunc(value || 1)));
}

function inferRequestedImageCount(task: Task): number {
  const requestedCount = Number(task.result.requested_image_count ?? task.result.output_count ?? 1);
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
}) {
  const summary =
    props.asset?.prompt_text ??
    (props.task.result.summary
      ? String(props.task.result.summary)
      : props.task.result.error
        ? String(props.task.result.error)
        : "等待结果返回。");

  return (
    <article className="feed-card">
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
          <p>Worker 完成执行后，这里会展示本轮生成结果和可复用资产。</p>
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
  const [imageForm, setImageForm] = useState<ImageFormState>(defaultImageForm);
  const [filters, setFilters] = useState<FeedFilterState>({
    sort: "oldest",
    status: "all",
    provider: "all"
  });
  const [submitting, setSubmitting] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  async function loadData() {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const [health, projects, providers, workflows, tasks, assets] = await Promise.all([
        api.health(),
        api.projects(),
        api.providers(),
        api.workflows(),
        api.tasks(),
        api.assets()
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

  const imageWorkflows = state.workflows.filter((workflow) => workflow.category === "image");
  const selectedWorkflow = imageWorkflows.find((workflow) => workflow.key === imageForm.workflowKey) ?? imageWorkflows[0];
  const imageProviders = state.providers.filter((provider) =>
    selectedWorkflow ? provider.capabilities.includes(selectedWorkflow.provider_capability) : false
  );
  const activeProject = state.projects.find((project) => project.code === imageForm.projectCode);
  const imageAssets = state.assets.filter((asset) => asset.asset_type === "image");
  const imageTasks = state.tasks.filter((task) => imageWorkflows.some((workflow) => workflow.key === task.workflow_key));
  const imageAssetsByTaskId = imageAssets.reduce((map, asset) => {
    if (asset.source_task_id === null) return map;
    const current = map.get(asset.source_task_id) ?? [];
    current.push(asset);
    map.set(asset.source_task_id, current);
    return map;
  }, new Map<number, Asset[]>());
  const workspaceName = activeProject?.name ?? "默认创作";
  const selectedProvider = imageProviders.find((provider) => provider.provider_name === imageForm.requestedProvider);
  const selectedStyle = stylePresets.find((preset) => preset.id === imageForm.style);
  const selectedResolution = resolutionOptions.find((option) => option.id === imageForm.resolution);

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
  const hasHistory = filteredTasks.length > 0;
  const showCenteredComposer = !hasHistory;

  useEffect(() => {
    if (imageProviders.length === 0) return;
    if (!imageProviders.some((provider) => provider.provider_name === imageForm.requestedProvider)) {
      const preferredProvider =
        imageProviders.find((provider) => provider.provider_name === "modelscope_free_image")?.provider_name ??
        imageProviders[0].provider_name;

      setImageForm((current) => ({
        ...current,
        requestedProvider: preferredProvider
      }));
    }
  }, [imageProviders, imageForm.requestedProvider]);

  function handleProjectSelect(project: Project) {
    setImageForm((current) => {
      const suggestedTitle = `${project.name} 生图方案`;
      const shouldReplaceTitle =
        current.title.trim() === "" ||
        current.title === defaultImageForm.title ||
        current.title.endsWith("生图方案") ||
        current.title === `${workspaceName} 生图方案`;

      return {
        ...current,
        projectCode: project.code,
        title: shouldReplaceTitle ? suggestedTitle : current.title
      };
    });
  }

  function handleResetComposer() {
    setImageForm((current) => ({
      ...defaultImageForm,
      projectCode: current.projectCode,
      title: `${workspaceName} 生图方案`
    }));
  }

  function handleReuseTask(task: Task, asset?: Asset) {
    setImageForm((current) => {
      const nextProvider =
        imageProviders.find((provider) => provider.provider_name === task.requested_provider)?.provider_name ??
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      await api.createTask({
        title: imageForm.title.trim() || `${workspaceName} 生图方案`,
        workflow_key: imageForm.workflowKey,
        project_code: imageForm.projectCode,
        requested_provider: imageForm.requestedProvider,
        user_name: imageForm.userName,
        classification: imageForm.classification,
        payload: buildImagePayload(imageForm)
      });
      await loadData();
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
            <p>{activeProject?.summary ?? "从左侧切换创作项目；中间区域只显示这个项目的历史生图记录。"}</p>
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
              className={project.code === imageForm.projectCode ? "workspace-item active" : "workspace-item"}
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
              <select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as FeedFilterState["sort"] }))}>
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
                {imageProviders.map((provider) => (
                  <option key={provider.provider_name} value={provider.provider_name}>
                    {provider.provider_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="toolbar-field">
              <span>操作类型</span>
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

              return (
                <FeedCard
                  key={task.id}
                  task={task}
                  asset={linkedAsset}
                  galleryAssets={galleryAssets}
                  onReuse={() => handleReuseTask(task, linkedAsset ?? galleryAssets[0])}
                  onLike={() => (linkedAsset ? void handleGalleryAction("like", linkedAsset.id) : undefined)}
                  onShare={() => (linkedAsset ? void handleGalleryAction("share", linkedAsset.id) : undefined)}
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
              <span>{selectedWorkflow?.name ?? "图片生成"}</span>
              <span>{(selectedProvider?.model_name ?? imageForm.requestedProvider) || "等待模型"}</span>
              <span>{imageForm.aspectRatio} / {selectedResolution?.label ?? imageForm.resolution}</span>
              <span>{imageForm.imageCount}x</span>
            </div>
          </div>

          <label className="composer-textarea">
            <textarea
              rows={3}
              value={imageForm.prompt}
              onChange={(event) => setImageForm((current) => ({ ...current, prompt: event.target.value }))}
              placeholder="输入文字，描述你想生成的图片。先写主体和场景，需要时再从下方菜单补充模型、比例和更多设置。"
            />
          </label>

          <div className="composer-toolbar">
            <label className="composer-dropdown">
              <span>快捷模板</span>
              <select defaultValue="" onChange={(event) => {
                const nextTemplate = promptTemplates.find((template) => template.id === event.target.value);
                if (nextTemplate) {
                  setImageForm((current) => applyTemplateToForm(nextTemplate, current));
                }
              }}>
                <option value="">选择模板</option>
                {promptTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="composer-dropdown">
              <span>创作类型</span>
              <select
                value={imageForm.workflowKey}
                onChange={(event) => setImageForm((current) => ({ ...current, workflowKey: event.target.value }))}
              >
                {imageWorkflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.key}>
                    {workflow.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="composer-dropdown">
              <span>模型</span>
              <select
                value={imageForm.requestedProvider}
                onChange={(event) => setImageForm((current) => ({ ...current, requestedProvider: event.target.value }))}
              >
                {imageProviders.map((provider) => (
                  <option key={provider.provider_name} value={provider.provider_name}>
                    {provider.model_name} / {provider.provider_name}
                  </option>
                ))}
              </select>
            </label>

            <details className="composer-menu">
              <summary>{imageForm.aspectRatio} / {selectedResolution?.label ?? imageForm.resolution}</summary>
              <div className="composer-menu-panel">
                <label className="composer-menu-field">
                  <span>比例</span>
                  <select
                    value={imageForm.aspectRatio}
                    onChange={(event) => setImageForm((current) => ({ ...current, aspectRatio: event.target.value }))}
                  >
                    {aspectRatioOptions.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="composer-menu-field">
                  <span>张数</span>
                  <select
                    value={imageForm.imageCount}
                    onChange={(event) =>
                      setImageForm((current) => ({
                        ...current,
                        imageCount: clampImageCount(Number(event.target.value))
                      }))
                    }
                  >
                    {[1, 2, 3, 4].map((count) => (
                      <option key={count} value={count}>
                        {count}x
                      </option>
                    ))}
                  </select>
                </label>

                <label className="composer-menu-field">
                  <span>清晰度</span>
                  <select
                    value={imageForm.resolution}
                    onChange={(event) => setImageForm((current) => ({ ...current, resolution: event.target.value }))}
                  >
                    {resolutionOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="composer-menu-field">
                  <span>风格</span>
                  <select
                    value={imageForm.style}
                    onChange={(event) => setImageForm((current) => ({ ...current, style: event.target.value }))}
                  >
                    {stylePresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>

            <details className="composer-menu composer-menu-wide">
              <summary>更多设置</summary>
              <div className="composer-menu-panel composer-menu-panel-wide">
                <label className="composer-menu-field">
                  <span>项目</span>
                  <select
                    value={imageForm.projectCode}
                    onChange={(event) => {
                      const nextProject = state.projects.find((project) => project.code === event.target.value);
                      if (nextProject) {
                        handleProjectSelect(nextProject);
                      }
                    }}
                  >
                    {state.projects.map((project) => (
                      <option key={project.id} value={project.code}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="composer-menu-field">
                  <span>创作标题</span>
                  <input
                    value={imageForm.title}
                    onChange={(event) => setImageForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder={`${workspaceName} 生图方案`}
                  />
                </label>

                <label className="composer-menu-field">
                  <span>交付目标</span>
                  <input
                    value={imageForm.deliverable}
                    onChange={(event) => setImageForm((current) => ({ ...current, deliverable: event.target.value }))}
                    placeholder="例如：方案首页主视觉"
                  />
                </label>

                <label className="composer-menu-field">
                  <span>参考图</span>
                  <input
                    value={imageForm.referenceImage}
                    onChange={(event) => setImageForm((current) => ({ ...current, referenceImage: event.target.value }))}
                    placeholder="上传前先填路径 / ID"
                  />
                </label>

                <label className="composer-menu-field composer-menu-field-full">
                  <span>补充说明</span>
                  <textarea
                    rows={3}
                    value={imageForm.notes}
                    onChange={(event) => setImageForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="例如：强调真实尺度、入口识别度和前景人群活动。"
                  />
                </label>
              </div>
            </details>

            <div className="composer-quickmeta">
              <span>{selectedStyle?.label ?? imageForm.style}</span>
              <span>{state.health === "ok" ? "服务在线" : "服务异常"}</span>
            </div>

            <button type="submit" className="submit-button" disabled={submitting || imageProviders.length === 0}>
              {submitting ? "正在创建..." : "开始生成"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
