import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { api, type PromptTemplateCreatePayload, type PromptTemplateRecord } from "../../api";
import { validateReferenceImageSize } from "../../utils/uploads";

type PromptTemplateDraft = PromptTemplateCreatePayload;
type UploadField = "source_image_path" | "preview_image_path";

const defaultDraft: PromptTemplateDraft = {
  category: "",
  subcategory: "",
  is_featured: false,
  label: "",
  title: "",
  prompt: "",
  style: "modern",
  aspect_ratio: "16:9",
  resolution: "4k",
  deliverable: "",
  notes: "",
  source_image_path: "",
  preview_image_path: "",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function categoryPath(template: Pick<PromptTemplateRecord, "category" | "subcategory">): string {
  const primary = template.category.trim();
  const secondary = template.subcategory.trim();
  if (primary && secondary) return `${primary} / ${secondary}`;
  return primary || secondary || "未分类";
}

function imageCoverageLabel(template: Pick<PromptTemplateRecord, "source_image_path" | "preview_image_path">): string {
  if (template.source_image_path && template.preview_image_path) return "已配置原图 + 最终图";
  if (template.preview_image_path) return "仅配置最终图";
  if (template.source_image_path) return "仅配置原图";
  return "未配置展示图";
}

export type PromptTemplatesPageProps = {
  templates: PromptTemplateRecord[];
  error: string;
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

export default function PromptTemplatesPage({ templates, error, onRefresh, onSetError }: PromptTemplatesPageProps) {
  const [selectedId, setSelectedId] = useState<number | null>(templates[0]?.id ?? null);
  const [draft, setDraft] = useState<PromptTemplateDraft>(defaultDraft);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingField, setUploadingField] = useState<UploadField | null>(null);
  const sourceInputRef = useRef<HTMLInputElement | null>(null);
  const resultInputRef = useRef<HTMLInputElement | null>(null);

  const selectedTemplate = templates.find((item) => item.id === selectedId) ?? null;
  const featuredCount = useMemo(() => templates.filter((item) => item.is_featured).length, [templates]);
  const withDualImagesCount = useMemo(
    () => templates.filter((item) => item.source_image_path && item.preview_image_path).length,
    [templates]
  );
  const recentApplyCount = useMemo(
    () => templates.reduce((total, item) => total + item.recent_apply_count, 0),
    [templates]
  );

  useEffect(() => {
    if (!selectedTemplate) {
      if (selectedId === null || templates.length === 0) {
        setDraft(defaultDraft);
      }
      return;
    }
    setDraft({
      category: selectedTemplate.category || "",
      subcategory: selectedTemplate.subcategory || "",
      is_featured: selectedTemplate.is_featured,
      label: selectedTemplate.label,
      title: selectedTemplate.title,
      prompt: selectedTemplate.prompt,
      style: selectedTemplate.style,
      aspect_ratio: selectedTemplate.aspect_ratio,
      resolution: selectedTemplate.resolution,
      deliverable: selectedTemplate.deliverable,
      notes: selectedTemplate.notes,
      source_image_path: selectedTemplate.source_image_path || "",
      preview_image_path: selectedTemplate.preview_image_path || "",
    });
  }, [selectedId, selectedTemplate?.id, selectedTemplate?.updated_at, templates.length]);

  function handleCreateNew() {
    setSelectedId(null);
    setDraft(defaultDraft);
    onSetError("");
  }

  async function handleImageUpload(field: UploadField, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const sizeError = validateReferenceImageSize(file);
    if (sizeError) {
      onSetError(sizeError);
      event.target.value = "";
      return;
    }

    setUploadingField(field);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取模板展示图失败"));
        reader.readAsDataURL(file);
      });

      const uploaded = await api.uploadReferenceImage({
        file_name: file.name,
        data_url: dataUrl,
      });

      setDraft((current) => ({ ...current, [field]: uploaded.storage_path }));
      onSetError("");
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "上传模板展示图失败");
    } finally {
      setUploadingField(null);
      event.target.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.label.trim() || !draft.title.trim() || !draft.prompt.trim()) {
      onSetError("请先填写模板名称、标题和完整提示词。");
      return;
    }

    setSaving(true);
    try {
      const payload: PromptTemplateCreatePayload = {
        category: draft.category.trim(),
        subcategory: draft.subcategory.trim(),
        is_featured: draft.is_featured,
        label: draft.label.trim(),
        title: draft.title.trim(),
        prompt: draft.prompt.trim(),
        style: draft.style.trim() || "modern",
        aspect_ratio: draft.aspect_ratio.trim() || "16:9",
        resolution: draft.resolution.trim() || "4k",
        deliverable: draft.deliverable.trim(),
        notes: draft.notes.trim(),
        source_image_path: draft.source_image_path.trim(),
        preview_image_path: draft.preview_image_path.trim(),
      };
      const nextTemplate = selectedTemplate
        ? await api.updateAdminPromptTemplate(selectedTemplate.id, payload)
        : await api.createAdminPromptTemplate(payload);
      setSelectedId(nextTemplate.id);
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "保存模板提示词失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedTemplate) {
      onSetError("请先选择要删除的模板。");
      return;
    }
    if (!confirm(`确认删除共享模板“${selectedTemplate.label}”吗？`)) {
      return;
    }

    setDeleting(true);
    try {
      await api.deleteAdminPromptTemplate(selectedTemplate.id);
      setSelectedId(null);
      setDraft(defaultDraft);
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "删除模板提示词失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>模板提示词管理</h1>
          <p>维护设计师共用模板的分类层级、原图、最终图与热门推荐状态。</p>
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
            <span>共享模板总数</span>
            <strong>{templates.length}</strong>
            <small>所有设计师都能看到</small>
          </div>
          <i>TP</i>
        </article>
        <article className="admin-kpi-card admin-green">
          <div>
            <span>热门模板</span>
            <strong>{featuredCount}</strong>
            <small>会进入设计师端“热度”筛选</small>
          </div>
          <i>HOT</i>
        </article>
        <article className="admin-kpi-card admin-orange">
          <div>
            <span>双图齐全</span>
            <strong>{withDualImagesCount}</strong>
            <small>同时配置了原图和最终图</small>
          </div>
          <i>IMG</i>
        </article>
        <article className="admin-kpi-card admin-purple">
          <div>
            <span>近 30 天应用</span>
            <strong>{recentApplyCount}</strong>
            <small>设计师真实套用次数</small>
          </div>
          <i>USE</i>
        </article>
      </div>

      <div className="admin-split-layout">
        <section className="admin-table-panel">
          <div className="agent-ops-section-head">
            <div>
              <h2>共享模板列表</h2>
              <p>左侧选模板，右侧维护分类、推荐状态和展示图。</p>
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
                  <strong>{template.label}</strong>
                  <span>{template.title}</span>
                  <small className="admin-template-meta">
                    {categoryPath(template)} · {template.is_featured ? "热门" : "普通"} · {imageCoverageLabel(template)}
                  </small>
                  <small className="admin-template-meta">
                    {`热度分 ${template.popularity_score.toFixed(1)} · 应用 ${template.recent_apply_count} · 成功提交 ${template.recent_submit_success_count}`}
                  </small>
                  <small className="admin-template-meta">最近更新 {formatDate(template.updated_at)}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="template-empty">还没有共享模板。先新建一条，设计师工作台才会出现新的模板项。</div>
          )}
        </section>

        <aside className="admin-detail-panel">
          <form className="admin-side-form" onSubmit={handleSubmit}>
            <div className="admin-detail-head">
              <h2>{selectedTemplate ? "编辑共享模板" : "新建共享模板"}</h2>
              <p>
                {selectedTemplate
                  ? `创建人：${selectedTemplate.user_name}，最近更新 ${formatDate(selectedTemplate.updated_at)}，热度分 ${selectedTemplate.popularity_score.toFixed(1)}`
                  : "保存后会立即出现在设计师工作台的共享模板库里。"}
              </p>
            </div>

            <div className="template-editor">
              <div className="template-editor-row">
                <label className="composer-menu-field">
                  <span>模板名称</span>
                  <input
                    value={draft.label}
                    onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
                    placeholder="例如：建筑分镜"
                  />
                </label>
                <label className="composer-menu-field">
                  <span>标题</span>
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="例如：建筑立面分镜模板"
                  />
                </label>
              </div>

              <div className="template-editor-row template-editor-row-3">
                <label className="composer-menu-field">
                  <span>一级分类</span>
                  <input
                    value={draft.category}
                    onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                    placeholder="例如：效果渲染"
                  />
                </label>
                <label className="composer-menu-field">
                  <span>二级分类</span>
                  <input
                    value={draft.subcategory}
                    onChange={(event) => setDraft((current) => ({ ...current, subcategory: event.target.value }))}
                    placeholder="例如：建筑渲染"
                  />
                </label>
                <label className="composer-menu-field">
                  <span>热度推荐</span>
                  <label className="model-toggle">
                    <input
                      type="checkbox"
                      checked={draft.is_featured}
                      onChange={(event) => setDraft((current) => ({ ...current, is_featured: event.target.checked }))}
                    />
                    <span>加入“热度”筛选</span>
                  </label>
                </label>
              </div>

              <label className="composer-menu-field">
                <span>完整提示词</span>
                <textarea
                  className="feedback-textarea"
                  value={draft.prompt}
                  onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))}
                  placeholder="请输入完整模板提示词。"
                />
              </label>

              <div className="template-editor-row">
                <label className="composer-menu-field">
                  <span>风格</span>
                  <input
                    value={draft.style}
                    onChange={(event) => setDraft((current) => ({ ...current, style: event.target.value }))}
                    placeholder="modern / editorial / minimal"
                  />
                </label>
                <label className="composer-menu-field">
                  <span>比例</span>
                  <input
                    value={draft.aspect_ratio}
                    onChange={(event) => setDraft((current) => ({ ...current, aspect_ratio: event.target.value }))}
                    placeholder="16:9"
                  />
                </label>
              </div>

              <div className="template-editor-row">
                <label className="composer-menu-field">
                  <span>分辨率</span>
                  <input
                    value={draft.resolution}
                    onChange={(event) => setDraft((current) => ({ ...current, resolution: event.target.value }))}
                    placeholder="4k"
                  />
                </label>
                <label className="composer-menu-field">
                  <span>交付说明</span>
                  <input
                    value={draft.deliverable}
                    onChange={(event) => setDraft((current) => ({ ...current, deliverable: event.target.value }))}
                    placeholder="例如：汇报图 / 分镜图 / 景观专用"
                  />
                </label>
              </div>

              <label className="composer-menu-field">
                <span>补充备注</span>
                <textarea
                  className="feedback-textarea"
                  value={draft.notes}
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="说明这个模板适合什么场景，哪些内容必须保留。"
                />
              </label>

              <div className="template-preview-editor">
                <div className="template-preview-editor-head">
                  <div>
                    <strong>模板展示图</strong>
                    <span>支持分别上传原图和最终图，设计师端会以对照方式展示。</span>
                  </div>
                </div>

                <div className="template-preview-upload-grid">
                  <article className="template-preview-upload-card">
                    <div className="template-preview-upload-head">
                      <strong>原图</strong>
                      <div className="template-editor-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => sourceInputRef.current?.click()}
                          disabled={uploadingField !== null}
                        >
                          {uploadingField === "source_image_path" ? "上传中..." : draft.source_image_path ? "更换原图" : "上传原图"}
                        </button>
                        {draft.source_image_path ? (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => setDraft((current) => ({ ...current, source_image_path: "" }))}
                          >
                            清空
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <input
                      ref={sourceInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(event) => void handleImageUpload("source_image_path", event)}
                    />
                    {draft.source_image_path ? (
                      <div className="template-preview-image-card">
                        <img src={draft.source_image_path} alt={`${draft.label || "模板"} 原图`} />
                      </div>
                    ) : (
                      <div className="template-empty">还没有上传原图。</div>
                    )}
                  </article>

                  <article className="template-preview-upload-card">
                    <div className="template-preview-upload-head">
                      <strong>最终图</strong>
                      <div className="template-editor-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => resultInputRef.current?.click()}
                          disabled={uploadingField !== null}
                        >
                          {uploadingField === "preview_image_path" ? "上传中..." : draft.preview_image_path ? "更换最终图" : "上传最终图"}
                        </button>
                        {draft.preview_image_path ? (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => setDraft((current) => ({ ...current, preview_image_path: "" }))}
                          >
                            清空
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <input
                      ref={resultInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(event) => void handleImageUpload("preview_image_path", event)}
                    />
                    {draft.preview_image_path ? (
                      <div className="template-preview-image-card">
                        <img src={draft.preview_image_path} alt={`${draft.label || "模板"} 最终图`} />
                      </div>
                    ) : (
                      <div className="template-empty">还没有上传最终图。</div>
                    )}
                  </article>
                </div>
              </div>
            </div>

            {error ? <div className="floating-error">{error}</div> : null}

            <div className="template-editor-actions">
              <button type="submit" className="submit-button" disabled={saving || uploadingField !== null}>
                {saving ? "保存中..." : selectedTemplate ? "保存修改" : "创建模板"}
              </button>
              {selectedTemplate ? (
                <button type="button" className="ghost-button" disabled={deleting} onClick={() => void handleDelete()}>
                  {deleting ? "删除中..." : "删除模板"}
                </button>
              ) : null}
            </div>
          </form>
        </aside>
      </div>
    </section>
  );
}
