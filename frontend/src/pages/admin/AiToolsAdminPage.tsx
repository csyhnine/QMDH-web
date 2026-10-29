import { type ChangeEvent, type FormEvent, useMemo, useRef } from "react";
import { useContentEditor } from "./useContentEditor";
import { useContentUploads } from "./useContentUploads";

import { api, type AiToolCreatePayload, type AiToolRecord } from "../../api";
import { formatUploadSize, MAX_REFERENCE_UPLOAD_BYTES } from "../../utils/uploads";

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
  onRefresh: () => void | Promise<void>;
  onSetError: (error: string) => void;
};

export default function AiToolsAdminPage({ tools, error, onRefresh }: AiToolsAdminPageProps) {
  const editor = useContentEditor<AiToolDraft, AiToolRecord>(tools, (row) => row ? {
    name: row.name, description: row.description || "", url: row.url, category: row.category || "",
    cover_image_path: row.cover_image_path || "", is_featured: row.is_featured,
    sort_order: row.sort_order, is_active: row.is_active,
  } : defaultDraft, onRefresh, "工具");
  const { selectedId, draft, saving, deleting } = editor;
  const uploads = useContentUploads({ fields: ["cover_image_path"] as const,
    labels: { cover_image_path: "封面" }, sourceLabel: draft.name || "未命名工具",
    capture: editor.captureField, isCurrent: editor.isCurrentEditor, readError: "封面读取失败", uploadError: "上传封面失败" });
  const uploading = uploads.hasPending();
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const selected = editor.model.record;
  const activeCount = useMemo(() => tools.filter((item) => item.is_active).length, [tools]);
  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(tools.map((item) => item.category.trim()).filter(Boolean))).sort((left, right) =>
        left.localeCompare(right, "zh-CN")
      ),
    [tools]
  );

  function handleCreateNew() {
    editor.select(null);
  }

  async function handleCoverChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await uploads.start("cover_image_path", file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploads.hasPending()) { editor.report("请等待当前封面上传完成，或先清空该字段。"); return; }
    return editor.run(async (operation) => {
      try {
        const values = operation.values;
        if (!values.name.trim()) { editor.report("请填写工具名称。", operation); return; }
        if (!values.url.trim().startsWith("http://") && !values.url.trim().startsWith("https://")) {
          editor.report("链接须以 http:// 或 https:// 开头。", operation); return;
        }
        const payload: AiToolCreatePayload = {
          name: values.name.trim(), description: values.description.trim(), url: values.url.trim(),
          category: values.category.trim(), cover_image_path: values.cover_image_path.trim(),
          is_featured: values.is_featured, sort_order: Number(values.sort_order) || 0, is_active: values.is_active,
        };
        const next = operation.id !== null
          ? await api.updateAdminAiTool(operation.id, payload)
          : await api.createAdminAiTool(payload);
        editor.saved(operation, next);
        await editor.refreshAfter(operation);
      } catch (err) { editor.report(err instanceof Error ? err.message : "保存工具失败", operation); }
    });
  }

  async function handleDelete() {
    if (selectedId === null || !selected) { editor.report("请先选择要删除的工具。"); return; }
    if (!confirm(`确认删除工具「${selected.name}」吗？`)) return;
    return editor.run(async (operation) => {
      try {
        await api.deleteAdminAiTool(operation.id!);
        editor.deleted(operation);
        await editor.refreshAfter(operation);
      } catch (err) { editor.report(err instanceof Error ? err.message : "删除工具失败", operation); }
    }, "delete");
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
          <button type="button" className="admin-primary-button" onClick={() => void editor.refreshList()}>
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
                  className={selectedId === tool.id ? "template-card is-active" : "template-card"}
                  onClick={() => editor.select(tool)}
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
              <h2>{selectedId !== null ? "编辑工具" : "新建工具"}</h2>
              <p>{selected ? `最近更新 ${formatDate(selected.updated_at)}` : "保存后立刻出现在工作室导航页（若已启用）。"}</p>
            </div>

            <div className="template-editor">
              <label className="composer-menu-field">
                <span>名称</span>
                <input
                  value={draft.name}
                  onChange={(event) => editor.setField("name", event.target.value)}
                  placeholder="例如：Midjourney"
                />
              </label>

              <label className="composer-menu-field">
                <span>官网链接</span>
                <input
                  value={draft.url}
                  onChange={(event) => editor.setField("url", event.target.value)}
                  placeholder="https://..."
                />
              </label>

              <label className="composer-menu-field">
                <span>简介</span>
                <textarea
                  className="feedback-textarea"
                  value={draft.description}
                  onChange={(event) => editor.setField("description", event.target.value)}
                  placeholder="一句话介绍该工具"
                />
              </label>

              <div className="template-editor-row">
                <label className="composer-menu-field">
                  <span>分类</span>
                  <input
                    list="admin-ai-tool-category-options"
                    value={draft.category}
                    onChange={(event) => editor.setField("category", event.target.value)}
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
                      editor.setField("sort_order", Number(event.target.value) || 0)
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
                        editor.setField("is_featured", event.target.checked)
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
                        editor.setField("is_active", event.target.checked)
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
                      aria-busy={uploading}
                      onClick={() => coverInputRef.current?.click()}
                    >
                      {uploading ? "重新选择封面" : draft.cover_image_path ? "更换封面" : "上传封面"}
                    </button>
                    {draft.cover_image_path || uploading || uploads.hasSelection("cover_image_path") ? (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => uploads.clear("cover_image_path")}
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
            {uploads.errors.map(item => <div key={item.field} className="floating-error">{item.message}</div>)}
            {uploads.available.map(item => <div key={item.id} className="content-upload-recovery" role="status">
              <p>{`已上传，尚未应用：${item.sourceLabel} · ${item.fieldLabel} · ${item.fileName}`}</p>
              <button type="button" disabled={!item.canRecover()} onClick={() => uploads.recover(item.id)}>恢复这张图片</button>
              <small>仅可恢复到原条目或原新建草稿。</small>
            </div>)}
            {editor.error ? <div className="floating-error">{editor.error}</div> : null}
            {editor.model.notice ? <div className="floating-notice" role="status">{editor.model.notice}</div> : null}
            {editor.model.missing ? <p role="status">原工具已从列表中移除，当前草稿已保留，请核对后新建。</p> : null}
            {editor.model.conflicts.size ? <div role="status">
              <p>服务器同字段已更新，当前草稿已保留。加载服务器版本会替换当前草稿。</p>
              <button type="button" onClick={editor.loadRemote}>加载服务器版本</button>
            </div> : null}

            <div className="template-editor-actions">
              <button type="submit" className="submit-button" disabled={editor.busy || editor.model.missing || editor.model.unconfirmed || uploading}>
                {saving ? "保存中..." : selected ? "保存修改" : "创建工具"}
              </button>
              {selected ? (
                <button type="button" className="ghost-button" disabled={editor.busy || editor.model.missing || editor.model.unconfirmed} onClick={() => void handleDelete()}>
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
