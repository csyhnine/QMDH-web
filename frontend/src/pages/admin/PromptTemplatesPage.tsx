import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";

import { api, type PromptTemplateCreatePayload, type PromptTemplateRecord } from "../../api";
import { validateReferenceImageSize } from "../../utils/uploads";

type PromptTemplateDraft = PromptTemplateCreatePayload;

const defaultDraft: PromptTemplateDraft = {
  label: "",
  title: "",
  prompt: "",
  style: "modern",
  aspect_ratio: "16:9",
  resolution: "4k",
  deliverable: "",
  notes: "",
  preview_image_path: "",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
  const [uploadingPreview, setUploadingPreview] = useState(false);
  const previewInputRef = useRef<HTMLInputElement | null>(null);

  const selectedTemplate = templates.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedTemplate) {
      if (selectedId === null || templates.length === 0) {
        setDraft(defaultDraft);
      }
      return;
    }
    setDraft({
      label: selectedTemplate.label,
      title: selectedTemplate.title,
      prompt: selectedTemplate.prompt,
      style: selectedTemplate.style,
      aspect_ratio: selectedTemplate.aspect_ratio,
      resolution: selectedTemplate.resolution,
      deliverable: selectedTemplate.deliverable,
      notes: selectedTemplate.notes,
      preview_image_path: selectedTemplate.preview_image_path || "",
    });
  }, [selectedId, selectedTemplate?.id, selectedTemplate?.updated_at, templates.length]);

  function handleCreateNew() {
    setSelectedId(null);
    setDraft(defaultDraft);
    onSetError("");
  }

  async function handlePreviewUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const sizeError = validateReferenceImageSize(file);
    if (sizeError) {
      onSetError(sizeError);
      event.target.value = "";
      return;
    }

    setUploadingPreview(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取预览图失败"));
        reader.readAsDataURL(file);
      });

      const uploaded = await api.uploadReferenceImage({
        file_name: file.name,
        data_url: dataUrl,
      });

      setDraft((current) => ({ ...current, preview_image_path: uploaded.storage_path }));
      onSetError("");
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "上传模板预览图失败");
    } finally {
      setUploadingPreview(false);
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
        label: draft.label.trim(),
        title: draft.title.trim(),
        prompt: draft.prompt.trim(),
        style: draft.style.trim() || "modern",
        aspect_ratio: draft.aspect_ratio.trim() || "16:9",
        resolution: draft.resolution.trim() || "4k",
        deliverable: draft.deliverable.trim(),
        notes: draft.notes.trim(),
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
          <p>统一维护设计师工作台里全员可见的共享模板，并为每个模板补一张 hover 预览参考图。</p>
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
            <span>当前选中</span>
            <strong>{selectedTemplate ? 1 : 0}</strong>
            <small>{selectedTemplate ? selectedTemplate.label : "新建草稿"}</small>
          </div>
          <i>ED</i>
        </article>
      </div>

      <div className="admin-split-layout">
        <section className="admin-table-panel">
          <div className="agent-ops-section-head">
            <div>
              <h2>共享模板列表</h2>
              <p>左侧选模板，右侧编辑。设计师页会按这个列表实时显示共享模板卡片和 hover 预览。</p>
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
                    {template.preview_image_path ? "已配置预览图" : "未配置预览图"} · 最近更新 {formatDate(template.updated_at)}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <div className="template-empty">还没有共享模板。先新建一条，设计师工作台才会出现“模板提示词”卡片。</div>
          )}
        </section>

        <aside className="admin-detail-panel">
          <form className="admin-side-form" onSubmit={handleSubmit}>
            <div className="admin-detail-head">
              <h2>{selectedTemplate ? "编辑共享模板" : "新建共享模板"}</h2>
              <p>{selectedTemplate ? `创建人：${selectedTemplate.user_name}，最近更新 ${formatDate(selectedTemplate.updated_at)}` : "新建后会立即出现在设计师工作台的共享模板组中。"}</p>
            </div>

            <div className="template-editor">
              <div className="template-editor-row">
                <label className="composer-menu-field">
                  <span>模板名称</span>
                  <input
                    value={draft.label}
                    onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
                    placeholder="例如：建筑氛围增强"
                  />
                </label>
                <label className="composer-menu-field">
                  <span>标题</span>
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="例如：建筑效果图氛围增强模板"
                  />
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
                    placeholder="例如：竞赛汇报图 / 景观专用"
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
                    <strong>Hover 预览图</strong>
                    <span>鼠标悬停到模板卡片时，会显示这张参考图。</span>
                  </div>
                  <div className="template-editor-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => previewInputRef.current?.click()}
                      disabled={uploadingPreview}
                    >
                      {uploadingPreview ? "上传中..." : draft.preview_image_path ? "更换预览图" : "上传预览图"}
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
                  ref={previewInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handlePreviewUpload}
                />
                {draft.preview_image_path ? (
                  <div className="template-preview-image-card">
                    <img src={draft.preview_image_path} alt={`${draft.label || "模板"} 预览图`} />
                  </div>
                ) : (
                  <div className="template-empty">还没有上传预览图。现在也可以先只保存文字模板，hover 时会显示文本预览卡。</div>
                )}
              </div>
            </div>

            {error ? <div className="floating-error">{error}</div> : null}

            <div className="template-editor-actions">
              <button type="submit" className="submit-button" disabled={saving || uploadingPreview}>
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
