import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  api,
  type CanvasProjectSummary,
  type CanvasTemplateCreatePayload,
  type CanvasTemplateRecord,
} from "../../api";

type CanvasTemplateDraft = {
  title: string;
  description: string;
  category: string;
  is_featured: boolean;
  preview_image_path: string;
};

const defaultDraft: CanvasTemplateDraft = {
  title: "",
  description: "",
  category: "",
  is_featured: false,
  preview_image_path: "",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export type CanvasTemplatesPageProps = {
  templates: CanvasTemplateRecord[];
  error: string;
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

export default function CanvasTemplatesPage({
  templates,
  error,
  onRefresh,
  onSetError,
}: CanvasTemplatesPageProps) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<number | null>(templates[0]?.id ?? null);
  const [draft, setDraft] = useState<CanvasTemplateDraft>(defaultDraft);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [projects, setProjects] = useState<CanvasProjectSummary[]>([]);
  const [importProjectId, setImportProjectId] = useState<number | "">("");

  const selectedTemplate = templates.find((item) => item.id === selectedId) ?? null;
  const featuredCount = useMemo(() => templates.filter((item) => item.is_featured).length, [templates]);

  useEffect(() => {
    if (!selectedTemplate) {
      if (selectedId === null || templates.length === 0) {
        setDraft(defaultDraft);
      }
      return;
    }
    setDraft({
      title: selectedTemplate.title,
      description: selectedTemplate.description || "",
      category: selectedTemplate.category || "",
      is_featured: selectedTemplate.is_featured,
      preview_image_path: selectedTemplate.preview_image_path || "",
    });
  }, [selectedId, selectedTemplate?.id, selectedTemplate?.updated_at, templates.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.canvasProjects();
        if (!cancelled) setProjects(rows);
      } catch {
        if (!cancelled) setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleCreateNew() {
    setSelectedId(null);
    setDraft(defaultDraft);
    setImportProjectId("");
    onSetError("");
  }

  function openCanvasEditor(templateId: number) {
    navigate(`/admin/canvas-templates/${templateId}/edit`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) {
      onSetError("请填写模板标题。");
      return;
    }

    setSaving(true);
    try {
      const payload: CanvasTemplateCreatePayload = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        category: draft.category.trim(),
        is_featured: draft.is_featured,
        preview_image_path: draft.preview_image_path.trim(),
      };

      if (!selectedTemplate && importProjectId) {
        const project = await api.getCanvasProject(Number(importProjectId));
        payload.graph_json = project.graph_json;
      }

      const nextTemplate = selectedTemplate
        ? await api.updateAdminCanvasTemplate(selectedTemplate.id, payload)
        : await api.createAdminCanvasTemplate(payload);
      setSelectedId(nextTemplate.id);
      onSetError("");
      onRefresh();
      if (!selectedTemplate) {
        openCanvasEditor(nextTemplate.id);
      }
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "保存画布模板失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedTemplate) {
      onSetError("请先选择要删除的模板。");
      return;
    }
    if (!confirm(`确认删除画布模板「${selectedTemplate.title}」吗？`)) {
      return;
    }

    setDeleting(true);
    try {
      await api.deleteAdminCanvasTemplate(selectedTemplate.id);
      setSelectedId(null);
      setDraft(defaultDraft);
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "删除画布模板失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>画布模板库</h1>
          <p>维护元数据后，在无限画布里用与设计师相同的方式编排工作流。</p>
        </div>
        <div className="template-editor-actions">
          <button type="button" className="ghost-button" onClick={handleCreateNew}>
            新建模板
          </button>
          <button type="button" className="admin-primary-button" onClick={onRefresh}>
            刷新列表
          </button>
        </div>
      </header>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card admin-blue">
          <div>
            <span>模板总数</span>
            <strong>{templates.length}</strong>
            <small>设计师可在画布左侧浏览</small>
          </div>
          <i>CV</i>
        </article>
        <article className="admin-kpi-card admin-green">
          <div>
            <span>精选模板</span>
            <strong>{featuredCount}</strong>
            <small>列表优先展示</small>
          </div>
          <i>HOT</i>
        </article>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="admin-split-layout">
        <section className="admin-table-panel">
          <div className="agent-ops-section-head">
            <div>
              <h2>模板列表</h2>
              <p>左侧选模板，右侧改元数据；工作流请在画布中编辑。</p>
            </div>
          </div>
          {templates.length > 0 ? (
            <div className="template-list admin-template-list">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={selectedTemplate?.id === template.id ? "template-card is-active" : "template-card"}
                  onClick={() => setSelectedId(template.id)}
                >
                  <strong>{template.title}</strong>
                  <span>{template.category.trim() || "未分类"}</span>
                  <span>
                    {template.is_featured ? "精选 · " : ""}
                    更新 {formatDate(template.updated_at)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted-text">还没有画布模板，点击「新建模板」开始。</p>
          )}
        </section>

        <section className="admin-form-panel">
          <form className="admin-form" onSubmit={(event) => void handleSubmit(event)}>
            <div className="agent-ops-section-head">
              <div>
                <h2>{selectedTemplate ? "编辑元数据" : "新建模板"}</h2>
                <p>
                  {selectedTemplate
                    ? "保存元数据后，可打开画布编排节点与连线。"
                    : "创建后将进入无限画布编辑工作流（与设计师页面一致）。"}
                </p>
              </div>
            </div>

            <label>
              标题
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="例如：人像精修工作流"
              />
            </label>

            <label>
              分类
              <input
                value={draft.category}
                onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                placeholder="例如：人像 / 商品"
              />
            </label>

            <label>
              描述
              <textarea
                rows={3}
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="给设计师看的简短说明"
              />
            </label>

            <label>
              预览图 URL / 路径
              <input
                value={draft.preview_image_path}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, preview_image_path: event.target.value }))
                }
                placeholder="可选，封面图 storage path 或 URL"
              />
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.is_featured}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, is_featured: event.target.checked }))
                }
              />
              标记为精选
            </label>

            {!selectedTemplate ? (
              <label>
                初始工作流（可选）
                <select
                  value={importProjectId === "" ? "" : String(importProjectId)}
                  disabled={projects.length === 0}
                  onChange={(event) => {
                    const value = event.target.value;
                    setImportProjectId(value ? Number(value) : "");
                  }}
                >
                  <option value="">空白画布开始</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      从「{project.title}」复制
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="template-editor-actions">
              <button type="submit" className="admin-primary-button" disabled={saving}>
                {saving
                  ? "保存中…"
                  : selectedTemplate
                    ? "保存元数据"
                    : "创建并打开画布"}
              </button>
              {selectedTemplate ? (
                <>
                  <button
                    type="button"
                    className="admin-primary-button"
                    onClick={() => openCanvasEditor(selectedTemplate.id)}
                  >
                    在画布中编辑
                  </button>
                  <button
                    type="button"
                    className="ghost-button danger-button"
                    disabled={deleting}
                    onClick={() => void handleDelete()}
                  >
                    {deleting ? "删除中…" : "删除"}
                  </button>
                </>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
