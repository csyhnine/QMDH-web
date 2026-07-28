import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { api, type AiToolCreatePayload, type AiToolRecord } from "../../api";
import { formatUploadSize, MAX_REFERENCE_UPLOAD_BYTES, validateReferenceImageSize } from "../../utils/uploads";

type AiToolDraft = {
  name: string;
  description: string;
  url: string;
  category: string;
  cover_image_path: string;
  is_featured: boolean;
  sort_order: number;
  is_active: boolean;
};

const defaultDraft: AiToolDraft = {
  name: "",
  description: "",
  url: "https://",
  category: "",
  cover_image_path: "",
  is_featured: false,
  sort_order: 0,
  is_active: true,
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function categoryLabel(category: string): string {
  return category.trim() || "未分类";
}

export type AiToolsAdminPageProps = {
  tools: AiToolRecord[];
  error: string;
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

export default function AiToolsAdminPage({ tools, error, onRefresh, onSetError }: AiToolsAdminPageProps) {
  const [selectedId, setSelectedId] = useState<number | null>(tools[0]?.id ?? null);
  const [draft, setDraft] = useState<AiToolDraft>(defaultDraft);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const selected = tools.find((item) => item.id === selectedId) ?? null;
  const activeCount = useMemo(() => tools.filter((item) => item.is_active).length, [tools]);
  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(tools.map((item) => item.category.trim()).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right, "zh-CN")
      ),
    [tools]
  );

  useEffect(() => {
    if (!selected) {
      if (selectedId === null || tools.length === 0) setDraft(defaultDraft);
      return;
    }
    setDraft({
      name: selected.name,
      description: selected.description || "",
      url: selected.url,
      category: selected.category || "",
      cover_image_path: selected.cover_image_path || "",
      is_featured: selected.is_featured,
      sort_order: selected.sort_order,
      is_active: selected.is_active,
    });
  }, [selected, selectedId, tools.length]);

  function handleCreateNew() {
    setSelectedId(null);
    setDraft(defaultDraft);
    onSetError("");
  }

  async function uploadCover(file: File) {
    const sizeError = validateReferenceImageSize(file);
    if (sizeError) {
      onSetError(sizeError);
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("封面读取失败"));
        reader.readAsDataURL(file);
      });
      const uploaded = await api.uploadReferenceImage({
        file_name: file.name,
        data_url: dataUrl,
      });
      setDraft((current) => ({ ...current, cover_image_path: uploaded.storage_path }));
      onSetError("");
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "上传封面失败");
    } finally {
      setUploading(false);
    }
  }

  async function handleCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadCover(file);
    event.target.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) {
      onSetError("请填写工具名称。");
      return;
    }
    if (!draft.url.trim().startsWith("http://") && !draft.url.trim().startsWith("https://")) {
      onSetError("链接须以 http:// 或 https:// 开头。");
      return;
    }

    setSaving(true);
    try {
      const payload: AiToolCreatePayload = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        url: draft.url.trim(),
        category: draft.category.trim(),
        cover_image_path: draft.cover_image_path.trim(),
        is_featured: draft.is_featured,
        sort_order: Number(draft.sort_order) || 0,
        is_active: draft.is_active,
      };
      const next = selected
        ? await api.updateAdminAiTool(selected.id, payload)
        : await api.createAdminAiTool(payload);
      setSelectedId(next.id);
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "保存工具失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selected) {
      onSetError("请先选择要删除的工具。");
      return;
    }
    if (!confirm(`确认删除工具「${selected.name}」吗？`)) return;
    setDeleting(true);
    try {
      await api.deleteAdminAiTool(selected.id);
      setSelectedId(null);
      setDraft(defaultDraft);
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "删除工具失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>工具导航</h1>
          <p>维护工作室「导航」页展示的 AI 工具与产品外链。</p>
        </div>
        <div className="template-editor-actions">
          <button type="button" className="ghost-button" onClick={handleCreateNew}>
            新建工具
          </button>
          <button type="button" className="admin-primary-button" onClick={onRefresh}>
            刷新列表
          </button>
        </div>
      </header>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card admin-blue">
          <div>
            <span>工具总数</span>
            <strong>{tools.length}</strong>
            <small>未删除条目</small>
          </div>
          <i>TL</i>
        </article>
        <article className="admin-kpi-card admin-green">
          <div>
            <span>已启用</span>
            <strong>{activeCount}</strong>
            <small>设计师导航页可见</small>
          </div>
          <i>ON</i>
        </article>
      </div>

      <div className="admin-split-layout">
        <section className="admin-table-panel">
          <div className="agent-ops-section-head">
            <div>
              <h2>工具列表</h2>
              <p>左侧选择工具，右侧编辑信息与封面。</p>
            </div>
          </div>
          {tools.length > 0 ? (
            <div className="template-list admin-template-list">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className={selected?.id === tool.id ? "template-card is-active" : "template-card"}
                  onClick={() => setSelectedId(tool.id)}
                >
                  <strong>
                    {tool.is_featured ? "★ " : ""}
                    {tool.name}
                  </strong>
                  <span>{tool.url}</span>
                  <small className="admin-template-meta">
                    {categoryLabel(tool.category)} · {tool.is_active ? "启用" : "停用"} · 排序 {tool.sort_order}
                  </small>
                  <small className="admin-template-meta">最近更新 {formatDate(tool.updated_at)}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="template-empty">还没有工具。新建一条后，设计师可在「导航」页看到。</div>
          )}
        </section>

        <aside className="admin-detail-panel">
          <form className="admin-side-form" onSubmit={(event) => void handleSubmit(event)}>
            <div className="admin-detail-head">
              <h2>{selected ? "编辑工具" : "新建工具"}</h2>
              <p>{selected ? `最近更新 ${formatDate(selected.updated_at)}` : "保存后立刻出现在工作室导航页（若已启用）。"}</p>
            </div>

            <div className="template-editor">
              <label className="composer-menu-field">
                <span>名称</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="例如：Midjourney"
                />
              </label>

              <label className="composer-menu-field">
                <span>官网链接</span>
                <input
                  value={draft.url}
                  onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))}
                  placeholder="https://..."
                />
              </label>

              <label className="composer-menu-field">
                <span>简介</span>
                <textarea
                  className="feedback-textarea"
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="一句话介绍该工具"
                />
              </label>

              <div className="template-editor-row">
                <label className="composer-menu-field">
                  <span>分类</span>
                  <input
                    list="admin-ai-tool-category-options"
                    value={draft.category}
                    onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                    placeholder="例如：图像 / 视频 / 写作"
                  />
                  <datalist id="admin-ai-tool-category-options">
                    {categoryOptions.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </label>
                <label className="composer-menu-field">
                  <span>排序</span>
                  <input
                    type="number"
                    value={draft.sort_order}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, sort_order: Number(event.target.value) || 0 }))
                    }
                  />
                </label>
              </div>

              <div className="template-editor-row">
                <label className="composer-menu-field">
                  <span>精选</span>
                  <label className="model-toggle">
                    <input
                      type="checkbox"
                      checked={draft.is_featured}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, is_featured: event.target.checked }))
                      }
                    />
                    <span>优先展示</span>
                  </label>
                </label>
                <label className="composer-menu-field">
                  <span>启用</span>
                  <label className="model-toggle">
                    <input
                      type="checkbox"
                      checked={draft.is_active}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, is_active: event.target.checked }))
                      }
                    />
                    <span>设计师可见</span>
                  </label>
                </label>
              </div>

              <div className="template-preview-editor">
                <div className="template-preview-editor-head">
                  <div>
                    <strong>封面图</strong>
                    <span>{`支持 PNG / JPG / WEBP，单张不超过 ${formatUploadSize(MAX_REFERENCE_UPLOAD_BYTES)}。`}</span>
                  </div>
                  <div className="template-editor-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={uploading}
                      onClick={() => coverInputRef.current?.click()}
                    >
                      {uploading ? "上传中..." : draft.cover_image_path ? "更换封面" : "上传封面"}
                    </button>
                    {draft.cover_image_path ? (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setDraft((current) => ({ ...current, cover_image_path: "" }))}
                      >
                        清空
                      </button>
                    ) : null}
                  </div>
                </div>
                <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={(event) => void handleCoverChange(event)} />
                {draft.cover_image_path ? (
                  <div className="qmdh-ai-tool-admin-cover">
                    <img src={draft.cover_image_path} alt="封面预览" />
                  </div>
                ) : (
                  <p className="qmdh-ai-tools-empty">尚未上传封面，卡片将显示名称首字。</p>
                )}
              </div>
            </div>

            {error ? <div className="floating-error">{error}</div> : null}

            <div className="template-editor-actions">
              <button type="submit" className="submit-button" disabled={saving || uploading}>
                {saving ? "保存中..." : selected ? "保存修改" : "创建工具"}
              </button>
              {selected ? (
                <button type="button" className="ghost-button" disabled={deleting} onClick={() => void handleDelete()}>
                  {deleting ? "删除中..." : "删除工具"}
                </button>
              ) : null}
            </div>
          </form>
        </aside>
      </div>
    </section>
  );
}
