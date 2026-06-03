import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type InspirationPost } from "../../api";
import { validateReferenceImageSize } from "../../utils/uploads";

/* ─── Props ─── */

const CATEGORIES = ["全部", "建筑", "景观", "室内", "城市", "构图", "材质", "光影", "色彩"] as const;
const SOURCE_FILTERS = [
  { key: "all", label: "全部来源" },
  { key: "external", label: "外部导入" },
  { key: "user", label: "设计师分享" },
  { key: "seed", label: "默认 Seed" },
] as const;
const TAG_BATCH_MODES = [
  { key: "append", label: "追加标签" },
  { key: "replace", label: "替换标签" },
  { key: "remove", label: "移除标签" },
] as const;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

export type InspirationPageProps = {
  posts: InspirationPost[];
  onPostsChange: (posts: InspirationPost[]) => void;
  canContribute: boolean;
  canManageLibrary?: boolean;
  mode?: "studio" | "admin";
};

function hasComparePreview(post: InspirationPost): boolean {
  return post.source_type === "user" && Boolean(post.source_image_path) && Boolean(post.image_path);
}

/* ─── Component ─── */

export default function InspirationPage({
  posts,
  onPostsChange,
  canContribute,
  canManageLibrary = false,
  mode = "studio",
}: InspirationPageProps) {
  const navigate = useNavigate();
  const [category, setCategory] = useState("全部");
  const [sourceFilter, setSourceFilter] = useState<(typeof SOURCE_FILTERS)[number]["key"]>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [lightbox, setLightbox] = useState<InspirationPost | null>(null);
  const [actionError, setActionError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<number | null>(null);
  const [selectedPostIds, setSelectedPostIds] = useState<number[]>([]);
  const [bulkCategory, setBulkCategory] = useState("建筑");
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [bulkTagsText, setBulkTagsText] = useState("");
  const [bulkTagMode, setBulkTagMode] = useState<(typeof TAG_BATCH_MODES)[number]["key"]>("append");
  const [isBatchTagging, setIsBatchTagging] = useState(false);
  const importUploadInputRef = useRef<HTMLInputElement | null>(null);
  const editUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [importDialog, setImportDialog] = useState<{
    open: boolean; url: string; loading: boolean; images: string[];
    selectedImage: string; title: string; category: string; tags: string;
    error: string; manualMode: boolean; uploadingFile?: boolean;
  }>({ open: false, url: "", loading: false, images: [], selectedImage: "", title: "", category: "建筑", tags: "", error: "", manualMode: false });
  const [editDialog, setEditDialog] = useState<{ postId: number; title: string; image_path: string; source_url: string; uploadingFile?: boolean; uploadError?: string } | null>(null);
  const importedCount = posts.filter((post) => post.source_type === "external").length;
  const sharedCount = posts.filter((post) => post.source_type === "user").length;
  const seedCount = posts.filter((post) => post.source_type !== "external" && post.source_type !== "user").length;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visiblePosts = posts.filter((post) => {
    if (sourceFilter === "external" && post.source_type !== "external") return false;
    if (sourceFilter === "user" && post.source_type !== "user") return false;
    if (sourceFilter === "seed" && (post.source_type === "external" || post.source_type === "user")) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      post.title,
      post.source_name,
      post.source_url,
      post.user_name,
      ...post.tags,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  const visiblePostIds = visiblePosts.map((post) => post.id);
  const selectedPosts = posts.filter((post) => selectedPostIds.includes(post.id));
  const selectedVisibleCount = visiblePostIds.filter((id) => selectedPostIds.includes(id)).length;
  const allVisibleSelected = visiblePostIds.length > 0 && selectedVisibleCount === visiblePostIds.length;

  function parseTagInput(value: string): string[] {
    return Array.from(
      new Set(
        value
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      )
    );
  }

  async function uploadImageFile(file: File): Promise<string> {
    if (!file.type.startsWith("image/")) {
      throw new Error("请选择图片文件");
    }
    const dataUrl = await readFileAsDataUrl(file);
    const uploaded = await api.uploadReferenceImage({
      file_name: file.name,
      data_url: dataUrl,
    });
    return uploaded.storage_path;
  }

  async function handleImportFileUpload(file: File) {
    setImportDialog((current) => ({ ...current, error: "", uploadingFile: true }));
    try {
      const sizeError = validateReferenceImageSize(file);
      if (sizeError) {
        throw new Error(sizeError);
      }
      const storagePath = await uploadImageFile(file);
      setImportDialog((current) => ({
        ...current,
        selectedImage: storagePath,
        manualMode: true,
        error: "",
        uploadingFile: false,
      }));
    } catch (err) {
      setImportDialog((current) => ({
        ...current,
        error: err instanceof Error ? err.message : "上传图片失败",
        uploadingFile: false,
      }));
    }
  }

  async function handleEditFileUpload(file: File) {
    setEditDialog((current) => (current ? { ...current, uploadError: "", uploadingFile: true } : current));
    try {
      const sizeError = validateReferenceImageSize(file);
      if (sizeError) {
        throw new Error(sizeError);
      }
      const storagePath = await uploadImageFile(file);
      setEditDialog((current) =>
        current
          ? {
              ...current,
              image_path: storagePath,
              uploadError: "",
              uploadingFile: false,
            }
          : current
      );
    } catch (err) {
      setEditDialog((current) =>
        current
          ? {
              ...current,
              uploadError: err instanceof Error ? err.message : "上传图片失败",
              uploadingFile: false,
            }
          : current
      );
    }
  }

  function handleImportFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void handleImportFileUpload(file);
  }

  function handleEditFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void handleEditFileUpload(file);
  }

  function handleImportDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void handleImportFileUpload(file);
  }

  function handleEditDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void handleEditFileUpload(file);
  }

  async function loadPosts(cat: string) {
    setIsRefreshing(true);
    setActionError("");
    try {
      onPostsChange(await api.inspiration(cat));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "加载灵感库失败");
    } finally {
      setIsRefreshing(false);
    }
  }

  function togglePostSelection(postId: number) {
    setSelectedPostIds((current) =>
      current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId]
    );
  }

  function toggleVisibleSelection() {
    setSelectedPostIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visiblePostIds.includes(id));
      }
      return Array.from(new Set([...current, ...visiblePostIds]));
    });
  }

  async function handleDelete(post: InspirationPost) {
    if (!confirm(`确认删除灵感条目“${post.title}”吗？此操作不可撤销。`)) {
      return;
    }
    setDeletingPostId(post.id);
    setActionError("");
    try {
      await api.deleteInspiration(post.id);
      setSelectedPostIds((current) => current.filter((id) => id !== post.id));
      await loadPosts(category);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "删除灵感失败");
    } finally {
      setDeletingPostId(null);
    }
  }

  async function handleBatchCategoryUpdate() {
    if (selectedPostIds.length === 0) {
      setActionError("请先选择要批量修改的灵感条目");
      return;
    }
    setIsBatchUpdating(true);
    setActionError("");
    try {
      await Promise.all(
        selectedPostIds.map((postId) => api.updateInspiration(postId, { category: bulkCategory }))
      );
      setSelectedPostIds([]);
      await loadPosts(category);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "批量修改分类失败");
    } finally {
      setIsBatchUpdating(false);
    }
  }

  async function handleBatchDelete() {
    if (selectedPostIds.length === 0) {
      setActionError("请先选择要删除的灵感条目");
      return;
    }
    if (!confirm(`确认批量删除 ${selectedPostIds.length} 条灵感内容吗？此操作不可撤销。`)) {
      return;
    }
    setIsBatchDeleting(true);
    setActionError("");
    try {
      await Promise.all(selectedPostIds.map((postId) => api.deleteInspiration(postId)));
      setSelectedPostIds([]);
      await loadPosts(category);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "批量删除灵感失败");
    } finally {
      setIsBatchDeleting(false);
    }
  }

  async function handleBatchTagsUpdate() {
    if (selectedPostIds.length === 0) {
      setActionError("请先选择要批量修改标签的灵感条目");
      return;
    }
    const nextTags = parseTagInput(bulkTagsText);
    if (nextTags.length === 0) {
      setActionError("请输入至少一个标签，多个标签请用逗号分隔");
      return;
    }
    setIsBatchTagging(true);
    setActionError("");
    try {
      await Promise.all(
        selectedPosts.map((post) => {
          const currentTags = Array.from(new Set(post.tags.map((tag) => tag.trim()).filter(Boolean)));
          let finalTags = currentTags;
          if (bulkTagMode === "append") {
            finalTags = Array.from(new Set([...currentTags, ...nextTags]));
          } else if (bulkTagMode === "replace") {
            finalTags = nextTags;
          } else if (bulkTagMode === "remove") {
            finalTags = currentTags.filter((tag) => !nextTags.includes(tag));
          }
          return api.updateInspiration(post.id, { tags: finalTags });
        })
      );
      setBulkTagsText("");
      await loadPosts(category);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "批量修改标签失败");
    } finally {
      setIsBatchTagging(false);
    }
  }

  return (
    <section className="inspiration-page">
      <header className="inspiration-header">
        <div>
          <h1>{mode === "admin" ? "灵感库管理" : "灵感"}</h1>
          <p>{mode === "admin" ? "集中管理外部参考、默认 seed 与设计师分享内容。" : "探索参考案例、材质与构图，激发设计灵感"}</p>
        </div>
        <div className="inspiration-actions">
          {mode === "studio" && canManageLibrary ? (
            <button type="button" className="ghost-button" onClick={() => navigate("/admin/inspiration")}>
              管理灵感库
            </button>
          ) : null}
          {mode === "admin" ? (
            <button type="button" className="ghost-button" disabled={isRefreshing} onClick={() => void loadPosts(category)}>
              {isRefreshing ? "刷新中..." : "刷新"}
            </button>
          ) : null}
          {canContribute ? (
            <button type="button" className="admin-primary-button" onClick={() => {
              setActionError("");
              setImportDialog({ open: true, url: "", loading: false, images: [], selectedImage: "", title: "", category: category !== "全部" ? category : "建筑", tags: "", error: "", manualMode: false, uploadingFile: false });
            }}>+ 导入参考</button>
          ) : null}
        </div>
      </header>

      {actionError ? <div className="floating-error inspiration-feedback">{actionError}</div> : null}

      {mode === "admin" ? (
        <>
          <div className="admin-kpi-grid inspiration-kpi-grid">
            <article className="admin-kpi-card">
              <div>
                <span>当前分类</span>
                <strong>{posts.length}</strong>
                <small>{category === "全部" ? "全部分类条目总数" : `${category} 分类条目总数`}</small>
              </div>
              <i>库</i>
            </article>
            <article className="admin-kpi-card admin-green">
              <div>
                <span>外部导入</span>
                <strong>{importedCount}</strong>
                <small>管理员从外部参考导入的条目</small>
              </div>
              <i>引</i>
            </article>
            <article className="admin-kpi-card admin-purple">
              <div>
                <span>设计师分享</span>
                <strong>{sharedCount}</strong>
                <small>由设计师从生成结果分享而来</small>
              </div>
              <i>享</i>
            </article>
            <article className="admin-kpi-card admin-gray">
              <div>
                <span>默认 Seed</span>
                <strong>{seedCount}</strong>
                <small>当前分类下的内置默认灵感条目</small>
              </div>
              <i>种</i>
            </article>
          </div>

          <div className="admin-toolbar inspiration-admin-toolbar">
            <input
              type="text"
              aria-label="搜索灵感条目"
              placeholder="搜索标题、标签、来源或分享人"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              aria-label="筛选来源"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as (typeof SOURCE_FILTERS)[number]["key"])}
            >
              {SOURCE_FILTERS.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
            <button type="button" className="ghost-button" onClick={toggleVisibleSelection}>
              {allVisibleSelected ? "取消全选当前结果" : "全选当前结果"}
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={selectedPostIds.length === 0}
              onClick={() => setSelectedPostIds([])}
            >
              清空已选
            </button>
            <select
              aria-label="批量分类"
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
            >
              {CATEGORIES.filter((item) => item !== "全部").map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <button
              type="button"
              className="ghost-button"
              disabled={selectedPostIds.length === 0 || isBatchUpdating}
              onClick={() => void handleBatchCategoryUpdate()}
            >
              {isBatchUpdating ? "批量修改中..." : "批量改分类"}
            </button>
            <select
              aria-label="批量标签模式"
              value={bulkTagMode}
              onChange={(e) => setBulkTagMode(e.target.value as (typeof TAG_BATCH_MODES)[number]["key"])}
            >
              {TAG_BATCH_MODES.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
            <input
              type="text"
              aria-label="批量标签输入"
              placeholder="标签用逗号分隔"
              value={bulkTagsText}
              onChange={(e) => setBulkTagsText(e.target.value)}
            />
            <button
              type="button"
              className="ghost-button"
              disabled={selectedPostIds.length === 0 || isBatchTagging}
              onClick={() => void handleBatchTagsUpdate()}
            >
              {isBatchTagging ? "批量标签处理中..." : "批量改标签"}
            </button>
            <button
              type="button"
              className="ghost-button danger-text"
              disabled={selectedPostIds.length === 0 || isBatchDeleting}
              onClick={() => void handleBatchDelete()}
            >
              {isBatchDeleting ? "批量删除中..." : "批量删除"}
            </button>
            <span className="inspiration-toolbar-summary">
              当前显示 {visiblePosts.length} / {posts.length} 条，当前结果已选 {selectedVisibleCount} 条，总已选 {selectedPostIds.length} 条
            </span>
          </div>
        </>
      ) : null}

      <nav className="inspiration-categories">
        {CATEGORIES.map((cat) => (
          <button key={cat} type="button" className={category === cat ? "active" : ""} onClick={() => { setCategory(cat); void loadPosts(cat); }}>{cat}</button>
        ))}
      </nav>

      <div className="inspiration-grid">
        {visiblePosts.length > 0 ? visiblePosts.map((post) => (
          <article key={post.id} className="inspiration-card">
            <div className="inspiration-card-image" onClick={() => setLightbox(post)} style={{ cursor: "pointer" }}>
              {hasComparePreview(post) ? (
                <div className="inspiration-card-compare">
                  <figure className="inspiration-card-compare-figure">
                    <img src={post.source_image_path} alt={`${post.title} 原图`} loading="lazy" />
                    <figcaption>原图</figcaption>
                  </figure>
                  <figure className="inspiration-card-compare-figure">
                    <img src={post.image_path} alt={`${post.title} 最终图`} loading="lazy" />
                    <figcaption>最终图</figcaption>
                  </figure>
                </div>
              ) : post.image_path ? <img src={post.image_path} alt={post.title} loading="lazy" /> : <div className="inspiration-card-placeholder" />}
              {post.category !== "全部" ? <span className="inspiration-card-badge">{post.category}</span> : null}
              {mode === "admin" ? (
                <label
                  className="inspiration-card-select"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedPostIds.includes(post.id)}
                    onChange={() => togglePostSelection(post.id)}
                  />
                  <span>选择</span>
                </label>
              ) : null}
            </div>
            <div className="inspiration-card-body">
              <h3>{post.title}</h3>
              {post.tags.length > 0 ? (
                <div className="inspiration-card-tags">{post.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div>
              ) : null}
              <div className="inspiration-card-meta">
                <span className="inspiration-source">
                  {post.source_url ? (
                    <a href={post.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                      来自 {(() => { try { return new URL(post.source_url).hostname.replace(/^www\./, ""); } catch { return post.source_name || "外部"; } })()}
                    </a>
                  ) : post.source_type === "user" ? `由 ${post.user_name || "设计师"} 分享` : `来自 ${post.source_name || "外部"}`}
                </span>
                <span className="inspiration-stats">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={async () => {
                      setActionError("");
                      try {
                        await api.likeInspiration(post.id);
                        await loadPosts(category);
                      } catch (err) {
                        setActionError(err instanceof Error ? err.message : "点赞失败");
                      }
                    }}
                  >
                    ♡ {post.like_count}
                  </button>
                  {canContribute ? <button type="button" className="ghost-button" title="编辑" onClick={() => setEditDialog({ postId: post.id, title: post.title, image_path: post.image_path, source_url: post.source_url, uploadingFile: false, uploadError: "" })}>✎</button> : null}
                  {mode === "admin" ? (
                    <button
                      type="button"
                      className="ghost-button danger-text"
                      disabled={deletingPostId === post.id}
                      onClick={() => void handleDelete(post)}
                    >
                      {deletingPostId === post.id ? "删除中..." : "删除"}
                    </button>
                  ) : null}
                </span>
              </div>
            </div>
          </article>
        )) : (
          <div className="inspiration-empty">
            <p>{posts.length > 0 ? "当前筛选条件下没有匹配的灵感条目。" : "暂无灵感内容。管理员可以导入外部参考，设计师可以分享生成成果。"}</p>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox ? (
        <div className="media-lightbox" onClick={() => setLightbox(null)} onKeyDown={(e) => { if (e.key === "Escape") setLightbox(null); }} tabIndex={0} ref={(el) => el?.focus()}>
          <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="media-lightbox-close" onClick={() => setLightbox(null)}>×</button>
            {hasComparePreview(lightbox) ? (
              <div className="inspiration-lightbox-compare">
                <figure className="inspiration-lightbox-figure">
                  <img src={lightbox.source_image_path} alt={`${lightbox.title} 原图`} style={{ maxWidth: "42vw", maxHeight: "72vh", objectFit: "contain" }} />
                  <figcaption>原图</figcaption>
                </figure>
                <figure className="inspiration-lightbox-figure">
                  <img src={lightbox.image_path} alt={`${lightbox.title} 最终图`} style={{ maxWidth: "42vw", maxHeight: "72vh", objectFit: "contain" }} />
                  <figcaption>最终图</figcaption>
                </figure>
              </div>
            ) : (
              <img src={lightbox.image_path} alt={lightbox.title} style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain" }} />
            )}
            <div style={{ textAlign: "center", marginTop: "12px", color: "#fff" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "18px" }}>{lightbox.title}</h3>
              {lightbox.source_url ? <a href={lightbox.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "#8bb4ff", fontSize: "14px" }}>查看原文 →</a> : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Import Dialog */}
      {importDialog.open ? (
        <div className="media-lightbox" onClick={() => setImportDialog({ ...importDialog, open: false })}>
          <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "680px", width: "90vw", maxHeight: "85vh", overflow: "auto", color: "#333" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>导入灵感参考</h2>
            <input ref={importUploadInputRef} type="file" accept="image/*" hidden onChange={handleImportFileInputChange} />
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <input type="text" placeholder="粘贴文章链接" value={importDialog.url} onChange={(e) => setImportDialog({ ...importDialog, url: e.target.value, error: "" })} style={{ flex: 1, padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px" }} />
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
            <div className="inspiration-upload-panel" style={{ marginBottom: "16px" }}>
              <button
                type="button"
                className={`inspiration-upload-dropzone${importDialog.selectedImage ? " has-image" : ""}`}
                onClick={() => importUploadInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleImportDrop}
              >
                {importDialog.selectedImage ? (
                  <>
                    <img src={importDialog.selectedImage} alt="" className="inspiration-upload-preview" />
                    <span className="inspiration-upload-overlay">点击或拖拽替换本地封面图</span>
                  </>
                ) : (
                  <>
                    <span className="inspiration-upload-title">拖拽图片到这里，或点击上传本地封面图</span>
                    <span className="inspiration-upload-hint">上传后会自动保存到服务器媒体目录，不需要再去宝塔面板手动传图</span>
                  </>
                )}
              </button>
              <div className="inspiration-upload-actions">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={Boolean(importDialog.uploadingFile)}
                  onClick={() => importUploadInputRef.current?.click()}
                >
                  {importDialog.uploadingFile ? "上传中..." : "上传本地图片"}
                </button>
                <span className="inspiration-upload-hint">也可以继续使用下方图片 URL，兼容外部图片链接</span>
              </div>
            </div>
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
              <div><label style={{ fontSize: "13px", color: "#666" }}>标题</label><input type="text" value={importDialog.title} onChange={(e) => setImportDialog({ ...importDialog, title: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} /></div>
              <div><label style={{ fontSize: "13px", color: "#666" }}>分类</label><select value={importDialog.category} onChange={(e) => setImportDialog({ ...importDialog, category: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }}>{["建筑", "景观", "室内", "城市", "构图", "材质", "光影", "色彩"].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: "16px" }}><label style={{ fontSize: "13px", color: "#666" }}>标签（逗号分隔）</label><input type="text" value={importDialog.tags} onChange={(e) => setImportDialog({ ...importDialog, tags: e.target.value })} placeholder="如：住宅, 日本, 混凝土" style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} /></div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button type="button" className="ghost-button" onClick={() => setImportDialog({ ...importDialog, open: false })}>取消</button>
              <button type="button" className="admin-primary-button" disabled={!importDialog.title.trim() || !importDialog.selectedImage.trim()} onClick={async () => {
                try {
                  const tags = importDialog.tags.split(",").map((t) => t.trim()).filter(Boolean);
                  let sourceName = "";
                  try { sourceName = new URL(importDialog.url).hostname.replace(/^www\./, ""); } catch {}
                  await api.createInspiration({ title: importDialog.title.trim(), image_path: importDialog.selectedImage.trim(), category: importDialog.category, source_type: "external", source_name: sourceName, source_url: importDialog.url.trim(), tags });
                  setImportDialog({ ...importDialog, open: false });
                  await loadPosts(category);
                } catch (err) {
                  setImportDialog({ ...importDialog, error: err instanceof Error ? err.message : "导入灵感失败" });
                }
              }}>确认导入</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit Dialog */}
      {editDialog ? (
        <div className="media-lightbox" onClick={() => setEditDialog(null)}>
          <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "480px", width: "90vw", color: "#333" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>编辑灵感</h2>
            <input ref={editUploadInputRef} type="file" accept="image/*" hidden onChange={handleEditFileInputChange} />
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div><label style={{ fontSize: "13px", color: "#666" }}>标题</label><input type="text" value={editDialog.title} onChange={(e) => setEditDialog({ ...editDialog, title: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} /></div>
              <div className="inspiration-upload-panel">
                <button
                  type="button"
                  className={`inspiration-upload-dropzone${editDialog.image_path ? " has-image" : ""}`}
                  onClick={() => editUploadInputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleEditDrop}
                >
                  {editDialog.image_path ? (
                    <>
                      <img src={editDialog.image_path} alt="" className="inspiration-upload-preview" />
                      <span className="inspiration-upload-overlay">点击或拖拽替换封面图</span>
                    </>
                  ) : (
                    <>
                      <span className="inspiration-upload-title">上传或拖拽管理封面图</span>
                      <span className="inspiration-upload-hint">上传成功后会自动回填图片地址</span>
                    </>
                  )}
                </button>
                <div className="inspiration-upload-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={Boolean(editDialog.uploadingFile)}
                    onClick={() => editUploadInputRef.current?.click()}
                  >
                    {editDialog.uploadingFile ? "上传中..." : "选择本地图片"}
                  </button>
                  <span className="inspiration-upload-hint">如果需要，也可以继续手动维护下面的图片 URL</span>
                </div>
                {editDialog.uploadError ? <p className="inspiration-upload-error">{editDialog.uploadError}</p> : null}
              </div>
              <div><label style={{ fontSize: "13px", color: "#666" }}>图片 URL</label><input type="text" value={editDialog.image_path} onChange={(e) => setEditDialog({ ...editDialog, image_path: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} /></div>
              <div><label style={{ fontSize: "13px", color: "#666" }}>原文链接</label><input type="text" value={editDialog.source_url} onChange={(e) => setEditDialog({ ...editDialog, source_url: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} /></div>
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button type="button" className="ghost-button" onClick={() => setEditDialog(null)}>取消</button>
              <button type="button" className="admin-primary-button" onClick={async () => {
                try {
                  await api.updateInspiration(editDialog.postId, { title: editDialog.title, image_path: editDialog.image_path, source_url: editDialog.source_url });
                  setEditDialog(null);
                  await loadPosts(category);
                } catch (err) {
                  setActionError(err instanceof Error ? err.message : "更新灵感失败");
                }
              }}>保存</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
