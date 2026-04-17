import { type FormEvent, useEffect, useState } from "react";

import { api, type Asset, type Project, type Provider, type Task, type Workflow } from "./api";

type PageKey = "home" | "image" | "video" | "workflow" | "gallery";

type LoadState = {
  health: string;
  projects: Project[];
  providers: Provider[];
  workflows: Workflow[];
  tasks: Task[];
  assets: Asset[];
  error: string;
};

type FormState = {
  title: string;
  workflow_key: string;
  project_code: string;
  requested_provider: string;
  user_name: string;
  classification: string;
  payloadText: string;
};

const initialState: LoadState = {
  health: "loading",
  projects: [],
  providers: [],
  workflows: [],
  tasks: [],
  assets: [],
  error: ""
};

const pageLabels: Record<PageKey, string> = {
  home: "首页",
  image: "图像生成",
  video: "视频生成",
  workflow: "工作流",
  gallery: "图库中心"
};

const defaultImageForm: FormState = {
  title: "滨水更新效果图任务",
  workflow_key: "image-generate",
  project_code: "QMDH-001",
  requested_provider: "jimeng",
  user_name: "reviewer",
  classification: "B",
  payloadText: JSON.stringify(
    {
      style: "modern",
      prompt_supplement: "riverfront mixed-use block"
    },
    null,
    2
  )
};

const defaultVideoForm: FormState = {
  title: "入口广场漫游视频任务",
  workflow_key: "video-generate",
  project_code: "QMDH-001",
  requested_provider: "runway",
  user_name: "reviewer",
  classification: "B",
  payloadText: JSON.stringify(
    {
      storyboard: "入口广场到中庭空间",
      motion_prompt: "slow cinematic push-in",
      source_images: ["cover-01", "cover-02"]
    },
    null,
    2
  )
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
  if (!ms) return "等待执行";
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} 分钟`;
  return `${Math.max(1, Math.round(ms / 1000))} 秒`;
}

function formatCapability(capability: string): string {
  const mapping: Record<string, string> = {
    "image.generate": "图像生成",
    "image.edit": "图像编辑",
    "video.generate": "视频生成",
    "document.generate": "文档生成",
    "text.generate": "文本生成"
  };
  return mapping[capability] ?? capability;
}

function formatStatus(status: string | null): string {
  const mapping: Record<string, string> = {
    pending: "待执行",
    running: "执行中",
    completed: "已完成",
    failed: "执行失败",
    loading: "加载中",
    ok: "正常",
    error: "异常",
    planned: "未开始",
    in_progress: "进行中",
    paused: "已暂停"
  };
  return mapping[status ?? ""] ?? (status ?? "未记录");
}

function SectionHeader(props: { title: string; description: string }) {
  return (
    <header className="section-header">
      <p className="section-kicker">QMDH PLATFORM</p>
      <h2>{props.title}</h2>
      <p>{props.description}</p>
    </header>
  );
}

function EmptyState(props: { title: string; body: string }) {
  return (
    <article className="empty-state">
      <h3>{props.title}</h3>
      <p>{props.body}</p>
    </article>
  );
}

function TaskCard(props: { task: Task }) {
  return (
    <article className="content-card">
      <div className="content-meta">
        <span>{formatDate(props.task.created_at)}</span>
        <span className={`status status-${props.task.status}`}>{formatStatus(props.task.status)}</span>
      </div>
      <h3>{props.task.title}</h3>
      <p>
        {props.task.workflow_name} / {props.task.project_code} / {props.task.requested_provider}
      </p>
      <small>{formatDuration(props.task.latency_ms)}</small>
    </article>
  );
}

function WorkflowCard(props: { workflow: Workflow }) {
  return (
    <article className="content-card workflow-card">
      <div className="content-meta">
        <span>{props.workflow.priority}</span>
        <span>{formatCapability(props.workflow.provider_capability)}</span>
      </div>
      <h3>{props.workflow.name}</h3>
      <p>{props.workflow.description}</p>
      <small>{props.workflow.key}</small>
    </article>
  );
}

function ProjectCard(props: { project: Project }) {
  return (
    <article className="content-card project-card">
      <div className="content-meta">
        <span>{props.project.code}</span>
        <span>{props.project.current_phase ?? "未分阶段"}</span>
      </div>
      <h3>{props.project.name}</h3>
      <p>{props.project.summary ?? "已建立项目阶段记录，等待补充更详细进展。"}</p>
      <small>
        阶段状态：{formatStatus(props.project.phase_status)} / 最近更新：{formatDate(props.project.last_updated)}
      </small>
      {props.project.next_action ? <small>下一步：{props.project.next_action}</small> : null}
    </article>
  );
}

function ModuleIntroCard(props: {
  title: string;
  body: string;
  footer: string;
  onOpen: () => void;
}) {
  return (
    <article className="module-card">
      <div className="module-card-body">
        <p className="module-card-kicker">模块</p>
        <h3>{props.title}</h3>
        <p>{props.body}</p>
      </div>
      <div className="module-card-footer">
        <small>{props.footer}</small>
        <button type="button" onClick={props.onOpen}>
          进入模块
        </button>
      </div>
    </article>
  );
}

export default function App() {
  const [state, setState] = useState<LoadState>(initialState);
  const [currentPage, setCurrentPage] = useState<PageKey>("home");
  const [imageForm, setImageForm] = useState<FormState>(defaultImageForm);
  const [videoForm, setVideoForm] = useState<FormState>(defaultVideoForm);
  const [submittingPage, setSubmittingPage] = useState<"" | "image" | "video">("");

  async function loadData() {
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
        error: ""
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        health: "error",
        error: error instanceof Error ? error.message : "加载失败"
      }));
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadData();
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const imageWorkflows = state.workflows.filter((workflow) => workflow.category === "image");
  const videoWorkflows = state.workflows.filter((workflow) => workflow.category === "video");
  const documentWorkflows = state.workflows.filter((workflow) => workflow.category === "document");
  const promptWorkflows = state.workflows.filter((workflow) => workflow.category === "prompt");

  const imageSelectedWorkflow = imageWorkflows.find((workflow) => workflow.key === imageForm.workflow_key);
  const videoSelectedWorkflow = videoWorkflows.find((workflow) => workflow.key === videoForm.workflow_key);

  const imageProviders = state.providers.filter((provider) =>
    imageSelectedWorkflow ? provider.capabilities.includes(imageSelectedWorkflow.provider_capability) : false
  );
  const videoProviders = state.providers.filter((provider) =>
    videoSelectedWorkflow ? provider.capabilities.includes(videoSelectedWorkflow.provider_capability) : false
  );

  const imageAssets = state.assets.filter((asset) => asset.asset_type === "image");
  const videoAssets = state.assets.filter((asset) => asset.asset_type === "video");
  const featuredAssets = [...imageAssets].sort((left, right) => right.like_count - left.like_count).slice(0, 6);
  const recentImageTasks = state.tasks
    .filter((task) => imageWorkflows.some((workflow) => workflow.key === task.workflow_key))
    .slice(0, 6);
  const recentVideoTasks = state.tasks
    .filter((task) => videoWorkflows.some((workflow) => workflow.key === task.workflow_key))
    .slice(0, 6);

  useEffect(() => {
    if (imageProviders.length > 0 && !imageProviders.some((item) => item.provider_name === imageForm.requested_provider)) {
      setImageForm((current) => ({ ...current, requested_provider: imageProviders[0].provider_name }));
    }
  }, [imageProviders, imageForm.requested_provider]);

  useEffect(() => {
    if (videoProviders.length > 0 && !videoProviders.some((item) => item.provider_name === videoForm.requested_provider)) {
      setVideoForm((current) => ({ ...current, requested_provider: videoProviders[0].provider_name }));
    }
  }, [videoProviders, videoForm.requested_provider]);

  async function submitTask(page: "image" | "video", form: FormState) {
    setSubmittingPage(page);
    try {
      const payload = JSON.parse(form.payloadText) as Record<string, unknown>;
      await api.createTask({
        title: form.title,
        workflow_key: form.workflow_key,
        project_code: form.project_code,
        requested_provider: form.requested_provider,
        user_name: form.user_name,
        classification: form.classification,
        payload
      });
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交任务失败";
      setState((current) => ({ ...current, error: message }));
    } finally {
      setSubmittingPage("");
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
      const message = error instanceof Error ? error.message : "图库操作失败";
      setState((current) => ({ ...current, error: message }));
    }
  }

  function renderHome() {
    return (
      <main className="page-layout">
        <section className="hero-panel">
          <div className="hero-copy">
            <p className="hero-label">平台首页</p>
            <h2>把不同 AI 平台的能力拆成清晰模块。</h2>
            <p>
              首页只负责介绍平台与模块入口，不展示后台审计与成本。模块负责执行任务，项目状态区负责同步每个项目当前阶段。
            </p>
          </div>
          <div className="hero-side">
            <div className="hero-stat">
              <strong>{imageWorkflows.length}</strong>
              <span>图像工作流</span>
            </div>
            <div className="hero-stat">
              <strong>{videoWorkflows.length}</strong>
              <span>视频工作流</span>
            </div>
            <div className="hero-stat">
              <strong>{state.projects.length}</strong>
              <span>项目状态卡</span>
            </div>
          </div>
        </section>

        <section className="module-grid">
          <ModuleIntroCard
            title="图像生成模块"
            body="统一发起效果图生成、局部重绘与视觉风格探索任务，适合概念图、方案图和竞赛图像产出。"
            footer={`${imageWorkflows.length} 条图像工作流 / ${imageAssets.length} 个图像资产`}
            onOpen={() => setCurrentPage("image")}
          />
          <ModuleIntroCard
            title="视频生成模块"
            body="围绕镜头脚本、图像素材和漫游节奏创建视频任务，适合入口动画、空间漫游和演示片段。"
            footer={`${videoWorkflows.length} 条视频工作流 / ${videoAssets.length} 个视频资产`}
            onOpen={() => setCurrentPage("video")}
          />
          <ModuleIntroCard
            title="工作流模块"
            body="集中查看平台能力目录，明确每条工作流适用场景、能力类型和兼容模型，帮助统一执行口径。"
            footer={`${state.workflows.length} 条工作流 / ${state.providers.length} 个模型供应商`}
            onOpen={() => setCurrentPage("workflow")}
          />
          <ModuleIntroCard
            title="图库中心"
            body="沉淀高质量图片、对应提示词和标签，支持点赞与分享，帮助团队快速复用已验证的画面语言。"
            footer={`${featuredAssets.reduce((sum, asset) => sum + asset.like_count, 0)} 次点赞 / 可直接复用提示词`}
            onOpen={() => setCurrentPage("gallery")}
          />
        </section>

        <section className="content-section">
          <SectionHeader title="项目进展" description="项目阶段状态来自本地状态文件，不和数据库任务记录混在一起。" />
          <div className="content-grid">
            {state.projects.length > 0 ? (
              state.projects.map((project) => <ProjectCard key={project.code} project={project} />)
            ) : (
              <EmptyState title="暂无项目状态" body="项目状态文件建立后，这里会自动展示每个项目的当前阶段和下一步动作。" />
            )}
          </div>
        </section>

        <section className="two-column home-bottom">
          <article className="module-info">
            <h3>平台边界</h3>
            <ul>
              <li>前台只展示设计生产相关模块，不展示后台审计与成本。</li>
              <li>项目阶段状态来自本地文档体系，方便审核和追踪里程碑。</li>
              <li>图像与视频任务按工作流自动匹配兼容模型供应商。</li>
              <li>图库中心沉淀优质作品与提示词，适合团队内部复用。</li>
            </ul>
          </article>

          <article className="module-info">
            <h3>最近平台动态</h3>
            <div className="content-grid compact-grid">
              {state.tasks.slice(0, 3).map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </article>
        </section>
      </main>
    );
  }

  function renderModuleForm(
    page: "image" | "video",
    title: string,
    description: string,
    form: FormState,
    setForm: (value: FormState) => void,
    workflows: Workflow[],
    providers: Provider[],
    tasks: Task[],
    sideItems: string[]
  ) {
    const selectedWorkflow = workflows.find((workflow) => workflow.key === form.workflow_key);

    return (
      <main className="page-layout">
        <SectionHeader title={title} description={description} />

        <div className="two-column">
          <form
            className="module-form"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void submitTask(page, form);
            }}
          >
            <label>
              <span>任务标题</span>
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>

            <label>
              <span>工作流</span>
              <select
                value={form.workflow_key}
                onChange={(event) => setForm({ ...form, workflow_key: event.target.value })}
              >
                {workflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.key}>
                    {workflow.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>项目</span>
              <select
                value={form.project_code}
                onChange={(event) => setForm({ ...form, project_code: event.target.value })}
              >
                {state.projects.map((project) => (
                  <option key={project.id} value={project.code}>
                    {project.code} / {project.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>模型供应商</span>
              <select
                value={form.requested_provider}
                onChange={(event) => setForm({ ...form, requested_provider: event.target.value })}
              >
                {providers.map((provider) => (
                  <option key={provider.provider_name} value={provider.provider_name}>
                    {provider.provider_name} / {provider.model_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>数据级别</span>
              <select
                value={form.classification}
                onChange={(event) => setForm({ ...form, classification: event.target.value })}
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </label>

            <label>
              <span>执行人</span>
              <input value={form.user_name} onChange={(event) => setForm({ ...form, user_name: event.target.value })} />
            </label>

            <label className="full-span">
              <span>任务参数</span>
              <textarea
                rows={8}
                value={form.payloadText}
                onChange={(event) => setForm({ ...form, payloadText: event.target.value })}
              />
            </label>

            <button type="submit" disabled={submittingPage === page || providers.length === 0}>
              {submittingPage === page ? "正在提交..." : `发起${title}`}
            </button>
          </form>

          <aside className="module-info">
            <h3>{selectedWorkflow?.name ?? title}</h3>
            <p>{selectedWorkflow?.description ?? "选择工作流后查看详细说明。"}</p>
            <ul>
              <li>能力类型：{formatCapability(selectedWorkflow?.provider_capability ?? "")}</li>
              <li>兼容供应商：{providers.length}</li>
              <li>当前项目级别：{state.projects.find((item) => item.code === form.project_code)?.classification ?? "未知"}</li>
              {sideItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>
        </div>

        <section className="content-section">
          <SectionHeader title={`最近${title}`} description="这里展示当前模块最近触发的任务记录。" />
          <div className="content-grid">
            {tasks.length > 0 ? (
              tasks.map((task) => <TaskCard key={task.id} task={task} />)
            ) : (
              <EmptyState title="暂无记录" body="先发起一个任务，这里会自动刷新显示最新结果。" />
            )}
          </div>
        </section>
      </main>
    );
  }

  function renderWorkflowPage() {
    return (
      <main className="page-layout">
        <SectionHeader title="工作流模块" description="这里集中展示平台现有工作流，帮助设计人员理解每条能力的适用场景与兼容模型。" />

        <div className="workflow-layout">
          <div className="content-grid">
            {state.workflows.map((workflow) => (
              <WorkflowCard key={workflow.id} workflow={workflow} />
            ))}
          </div>

          <aside className="module-info">
            <h3>模块说明</h3>
            <ul>
              <li>图像工作流：{imageWorkflows.length} 条，适合效果图与局部改图。</li>
              <li>视频工作流：{videoWorkflows.length} 条，适合漫游和演示短片。</li>
              <li>文档工作流：{documentWorkflows.length} 条，适合报告和汇报页输出。</li>
              <li>提示词工作流：{promptWorkflows.length} 条，适合从优质图片反推可复用提示词。</li>
            </ul>

            <div className="provider-list">
              {state.providers.map((provider) => (
                <article key={provider.provider_name} className="provider-item">
                  <h4>{provider.provider_name}</h4>
                  <p>{provider.model_name}</p>
                  <small>{provider.capabilities.map(formatCapability).join(" / ")}</small>
                </article>
              ))}
            </div>
          </aside>
        </div>
      </main>
    );
  }

  function renderGalleryPage() {
    return (
      <main className="page-layout">
        <SectionHeader title="图库中心" description="优秀图片、提示词和标签在这里沉淀，支持点赞与分享，方便团队内部复用。" />

        <div className="gallery-grid">
          {featuredAssets.length > 0 ? (
            featuredAssets.map((asset) => (
              <article key={asset.id} className="gallery-card">
                <div className="gallery-image" aria-hidden="true">
                  <div className="gallery-placeholder">{asset.asset_type === "image" ? "图像示意" : "视频封面"}</div>
                </div>
                <div className="gallery-content">
                  <div className="content-meta">
                    <span>{formatDate(asset.created_at)}</span>
                    <span>{asset.asset_type === "image" ? "图片资产" : "视频资产"}</span>
                  </div>
                  <h3>{asset.name}</h3>
                  <p className="gallery-prompt">{asset.prompt_text ?? "暂无提示词说明。"}</p>
                  <div className="tag-row">
                    {asset.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="gallery-actions">
                    <button type="button" onClick={() => void handleGalleryAction("like", asset.id)}>
                      点赞 {asset.like_count}
                    </button>
                    <button type="button" onClick={() => void handleGalleryAction("share", asset.id)}>
                      分享 {asset.share_count}
                    </button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="图库还没有内容" body="等图像任务沉淀出优质结果后，这里会自动成为团队的共享素材库。" />
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-block">
          <p className="brand-mark">QMDH 设计院内部 AI 平台</p>
          <h1>模块化创作门户</h1>
          <p className="brand-summary">首页介绍模块，模块页面负责执行任务，项目状态区负责同步阶段进度。</p>
        </div>
        <div className={`health-badge health-${state.health}`}>系统状态：{formatStatus(state.health)}</div>
      </header>

      <nav className="nav-tabs" aria-label="主导航">
        {Object.entries(pageLabels).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={currentPage === key ? "nav-tab active" : "nav-tab"}
            onClick={() => setCurrentPage(key as PageKey)}
          >
            {label}
          </button>
        ))}
      </nav>

      {state.error ? <div className="error-banner">{state.error}</div> : null}

      {currentPage === "home" ? renderHome() : null}
      {currentPage === "image"
        ? renderModuleForm(
            "image",
            "图像生成模块",
            "统一发起效果图、概念图和局部改图任务，自动匹配兼容供应商。",
            imageForm,
            setImageForm,
            imageWorkflows,
            imageProviders,
            recentImageTasks,
            ["适合概念图、竞赛图、效果图和局部改图。", "页面每 5 秒同步一次任务状态。"]
          )
        : null}
      {currentPage === "video"
        ? renderModuleForm(
            "video",
            "视频生成模块",
            "围绕镜头说明、图像素材和节奏控制来组织视频任务，不展示后台审计信息。",
            videoForm,
            setVideoForm,
            videoWorkflows,
            videoProviders,
            recentVideoTasks,
            [`当前视频资产：${videoAssets.length} 个。`, "适合漫游片、演示片和封面动画。"]
          )
        : null}
      {currentPage === "workflow" ? renderWorkflowPage() : null}
      {currentPage === "gallery" ? renderGalleryPage() : null}
    </div>
  );
}
