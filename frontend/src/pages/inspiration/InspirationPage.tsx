import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type InspirationPost } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useServerSearch } from "../../lib/search/useServerSearch";
import {
  hasInspirationComparePreview,
  InspirationMainMediaPreview,
  inspirationFinalMediaCaption,
  isVideoInspirationPost,
} from "./inspirationMediaUtils";
import { copyInspirationPrompt, getInspirationPromptText } from "./inspirationPromptUtils";
import { useInspirationList } from "./useInspirationList";
import { useInspirationDialogs } from "./useInspirationDialogs";

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

export type InspirationPageProps = {
  canContribute: boolean;
  canManageLibrary?: boolean;
  mode?: "studio" | "admin";
};


export default function InspirationPage({
  canContribute,
  canManageLibrary = false,
  mode = "studio",
}: InspirationPageProps) {
  const navigate = useNavigate();
  const { isGuest, currentUser } = useAuth();
  const scopeKey = JSON.stringify([currentUser?.id, currentUser?.name, isGuest, mode]);
  const { posts, category, actionError, isRefreshing, selectedPostIds,
    loadPosts, selectCategory, setActionError, setSelectedPostIds,
  } = useInspirationList(scopeKey);
  const { importDialog, editDialog, openImport, openEdit, closeImport, closeEdit,
    setImportField, setEditField, uploadImport, uploadEdit, extract, saveImport, saveEdit,
    newImport, resumeImport, checkImportResult, recoverableImports,
  } = useInspirationDialogs(scopeKey, loadPosts);
  const [sourceFilter, setSourceFilter] = useState<(typeof SOURCE_FILTERS)[number]["key"]>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [lightbox, setLightbox] = useState<InspirationPost | null>(null);
  const [copiedPromptPostId, setCopiedPromptPostId] = useState<number | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<number | null>(null);
  const [bulkCategory, setBulkCategory] = useState("建筑");
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [bulkTagsText, setBulkTagsText] = useState("");
  const [bulkTagMode, setBulkTagMode] = useState<(typeof TAG_BATCH_MODES)[number]["key"]>("append");
  const [isBatchTagging, setIsBatchTagging] = useState(false);
  const [isSyncingSearch, setIsSyncingSearch] = useState(false);
  const [searchSyncSummary, setSearchSyncSummary] = useState("");
  const importUploadInputRef = useRef<HTMLInputElement | null>(null);
  const editUploadInputRef = useRef<HTMLInputElement | null>(null);
  const importedCount = posts.filter((post) => post.source_type === "external").length;
  const sharedCount = posts.filter((post) => post.source_type === "user").length;
  const seedCount = posts.filter((post) => post.source_type !== "external" && post.source_type !== "user").length;
  const {
    trimmedQuery: inspirationSearchQuery,
    matchIds: inspirationSearchMatchIds,
    engine: inspirationSearchEngine,
    isSearching: isInspirationSearching,
    usingServerSearch: usingInspirationServerSearch,
  } = useServerSearch("inspiration", searchQuery);
  const normalizedQuery = inspirationSearchQuery.toLowerCase();
  const visiblePosts = posts.filter((post) => {
    if (sourceFilter === "external" && post.source_type !== "external") return false;
    if (sourceFilter === "user" && post.source_type !== "user") return false;
    if (sourceFilter === "seed" && (post.source_type === "external" || post.source_type === "user")) return false;
    if (usingInspirationServerSearch && inspirationSearchMatchIds) {
      return inspirationSearchMatchIds.includes(post.id);
    }
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

  function handleImportFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void uploadImport(file);
  }

  function handleEditFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void uploadEdit(file);
  }

  function handleImportDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void uploadImport(file);
  }

  function handleEditDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void uploadEdit(file);
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

  async function handleCopyPrompt(post: InspirationPost) {
    setActionError("");
    try {
      const copied = await copyInspirationPrompt(post);
      if (!copied) {
        setActionError("没有可复制的提示词");
        return;
      }
      setCopiedPromptPostId(post.id);
      window.setTimeout(() => {
        setCopiedPromptPostId((current) => (current === post.id ? null : current));
      }, 2000);
    } catch {
      setActionError("复制失败，请手动选择提示词文本复制");
    }
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
      await loadPosts();
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
      setSelectedPostIds((current) => current === selectedPostIds ? [] : current);
      await loadPosts();
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
      setSelectedPostIds((current) => current === selectedPostIds ? [] : current);
      await loadPosts();
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
      await loadPosts();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "批量修改标签失败");
    } finally {
      setIsBatchTagging(false);
    }
  }

  async function handleSearchSync() {
    setIsSyncingSearch(true);
    setActionError("");
    setSearchSyncSummary("");
    try {
      const result = await api.searchSync();
      setSearchSyncSummary(
        `已同步 ${result.inspiration_documents} 条灵感、${result.template_documents} 条模板（${result.engine}）`
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "同步搜索索引失败");
    } finally {
      setIsSyncingSearch(false);
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
            <button type="button" className="ghost-button" disabled={isRefreshing} onClick={() => void loadPosts()}>
              {isRefreshing ? "刷新中..." : "刷新"}
            </button>
          ) : null}
          {mode === "admin" ? (
            <button
              type="button"
              className="ghost-button"
              disabled={isSyncingSearch}
              onClick={() => void handleSearchSync()}
            >
              {isSyncingSearch ? "同步索引中..." : "同步搜索索引"}
            </button>
          ) : null}
          {canContribute ? (
            <button type="button" className="admin-primary-button" onClick={() => {
              setActionError("");
              openImport(category !== "全部" ? category : "建筑");
            }}>+ 导入参考</button>
          ) : null}
        </div>
      </header>

      {actionError ? <div className="floating-error inspiration-feedback">{actionError}</div> : null}
      {searchSyncSummary ? <div className="inspiration-search-sync-summary">{searchSyncSummary}</div> : null}

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
              {inspirationSearchQuery ? (
                <>
                  {" "}
                  ·{" "}
                  {isInspirationSearching
                    ? "搜索中..."
                    : usingInspirationServerSearch
                      ? `${inspirationSearchMatchIds?.length ?? 0} 条命中 · ${inspirationSearchEngine ?? "postgres"}`
                      : `本地匹配 · ${inspirationSearchEngine ?? "postgres"}`}
                </>
              ) : null}
            </span>
          </div>
        </>
      ) : null}

      <nav className="inspiration-categories">
        {CATEGORIES.map((cat) => (
          <button key={cat} type="button" className={category === cat ? "active" : ""} onClick={() => selectCategory(cat)}>{cat}</button>
        ))}
      </nav>

      {mode === "studio" ? (
        <div className="inspiration-search-row">
          <input
            type="search"
            aria-label="搜索灵感"
            placeholder="搜索标题、标签、来源或分享人"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {inspirationSearchQuery ? (
            <span className="inspiration-search-meta">
              {isInspirationSearching
                ? "搜索中..."
                : usingInspirationServerSearch
                  ? `${inspirationSearchMatchIds?.length ?? 0} 条命中 · ${inspirationSearchEngine ?? "postgres"}`
                  : `本地匹配 · ${inspirationSearchEngine ?? "postgres"}`}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="inspiration-grid">
        {visiblePosts.length > 0 ? visiblePosts.map((post) => (
          <article key={post.id} className="inspiration-card">
            <div className="inspiration-card-image" onClick={() => setLightbox(post)} style={{ cursor: "pointer" }}>
              {hasInspirationComparePreview(post) ? (
                <div className="inspiration-card-compare">
                  <figure className="inspiration-card-compare-figure">
                    <img src={post.source_image_path} alt={`${post.title} 原图`} loading="lazy" />
                    <figcaption>{isVideoInspirationPost(post) ? "参考图" : "原图"}</figcaption>
                  </figure>
                  <figure className="inspiration-card-compare-figure">
                    <InspirationMainMediaPreview post={post} alt={`${post.title} ${inspirationFinalMediaCaption(post)}`} />
                    <figcaption>{inspirationFinalMediaCaption(post)}</figcaption>
                  </figure>
                </div>
              ) : post.image_path ? (
                <InspirationMainMediaPreview post={post} alt={post.title} />
              ) : (
                <div className="inspiration-card-placeholder" />
              )}
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
              {getInspirationPromptText(post) ? (
                <p className="inspiration-card-prompt-hint">含提示词 · 点击查看并复制</p>
              ) : null}
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
                    disabled={isGuest}
                    onClick={async () => {
                      if (isGuest) {
                        setActionError("访客模式无法点赞，请先登录。");
                        return;
                      }
                      setActionError("");
                      try {
                        await api.likeInspiration(post.id);
                        await loadPosts();
                      } catch (err) {
                        setActionError(err instanceof Error ? err.message : "点赞失败");
                      }
                    }}
                  >
                    ♡ {post.like_count}
                  </button>
                  {canContribute ? <button type="button" className="ghost-button" title="编辑" onClick={() => openEdit(post)}>✎</button> : null}
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
        <div
          className="media-lightbox"
          onClick={() => {
            setLightbox(null);
            setCopiedPromptPostId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setLightbox(null);
              setCopiedPromptPostId(null);
            }
          }}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          <div className="inspiration-lightbox-panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="media-lightbox-close inspiration-lightbox-close" onClick={() => {
              setLightbox(null);
              setCopiedPromptPostId(null);
            }}>
              ×
            </button>
            <div className="inspiration-lightbox-media">
              {hasInspirationComparePreview(lightbox) ? (
                <div className="inspiration-lightbox-compare">
                  <figure className="inspiration-lightbox-figure">
                    <img src={lightbox.source_image_path} alt={`${lightbox.title} 原图`} />
                    <figcaption>{isVideoInspirationPost(lightbox) ? "参考图" : "原图"}</figcaption>
                  </figure>
                  <figure className="inspiration-lightbox-figure">
                    {isVideoInspirationPost(lightbox) ? (
                      <video src={lightbox.image_path} controls playsInline preload="metadata" />
                    ) : (
                      <img src={lightbox.image_path} alt={`${lightbox.title} 最终图`} />
                    )}
                    <figcaption>{inspirationFinalMediaCaption(lightbox)}</figcaption>
                  </figure>
                </div>
              ) : isVideoInspirationPost(lightbox) ? (
                <video src={lightbox.image_path} controls playsInline preload="metadata" className="inspiration-lightbox-single-media" />
              ) : (
                <img src={lightbox.image_path} alt={lightbox.title} className="inspiration-lightbox-single-media" />
              )}
            </div>
            <div className="inspiration-lightbox-meta">
              <div className="inspiration-lightbox-headline">
                <h3>{lightbox.title}</h3>
                <div className="inspiration-lightbox-submeta">
                  {lightbox.source_type === "user" ? <span>由 {lightbox.user_name || "设计师"} 分享</span> : null}
                  {lightbox.model_name ? <span>模型：{lightbox.model_name}</span> : null}
                  {lightbox.source_url ? (
                    <a href={lightbox.source_url} target="_blank" rel="noopener noreferrer">
                      查看原文 →
                    </a>
                  ) : null}
                </div>
              </div>
              {getInspirationPromptText(lightbox) ? (
                <div className="inspiration-prompt-block">
                  <div className="inspiration-prompt-head">
                    <strong>提示词</strong>
                    <button
                      type="button"
                      className="inspiration-copy-prompt-btn"
                      onClick={() => void handleCopyPrompt(lightbox)}
                    >
                      {copiedPromptPostId === lightbox.id ? "已复制" : "复制提示词"}
                    </button>
                  </div>
                  <pre className="inspiration-prompt-text">{getInspirationPromptText(lightbox)}</pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Import Dialog */}
      {importDialog.open ? (
        <div className="media-lightbox" onClick={closeImport}>
          <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "680px", width: "90vw", maxHeight: "85vh", overflow: "auto", color: "#333" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>导入灵感参考</h2>
            {importDialog.createState === "unknown" ? <p role="status">导入结果待确认，可能已创建。请先刷新列表核对，本次不会重复提交。</p> : null}
            {importDialog.createState === "accepted" ? <p role="status">已导入记录 #{importDialog.createdId}。如需另建条目，请新建另一条导入。</p> : null}
            {importDialog.createState !== "idle" ? (
              <button type="button" className="ghost-button" onClick={() => void checkImportResult()}>刷新列表核对</button>
            ) : null}
            <button type="button" className="ghost-button" onClick={() => newImport(category !== "全部" ? category : "建筑")}>新建另一条导入</button>
            {recoverableImports.map((item) => (
              <button key={item.id} type="button" className="ghost-button" onClick={() => resumeImport(item.id)}>
                继续导入 {item.id} · {item.title || "未命名"} · {item.state === "pending" ? "处理中" : item.state === "unknown" ? "待确认" : item.state === "accepted" ? "已创建" : "未创建"}
              </button>
            ))}
            <input ref={importUploadInputRef} type="file" accept="image/*" hidden onChange={handleImportFileInputChange} />
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <input type="text" placeholder="粘贴文章链接" value={importDialog.url} onChange={(e) => setImportField("url", e.target.value)} style={{ flex: 1, padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px" }} />
              <button type="button" className="admin-primary-button" disabled={importDialog.loading || !importDialog.url.trim()} onClick={() => void extract()}>{importDialog.loading ? "提取中..." : "提取图片"}</button>
            </div>
            {importDialog.error ? <p style={{ color: "#e53e3e", fontSize: "13px", margin: "0 0 12px" }}>{importDialog.error}</p> : null}
            {importDialog.uploadError ? <p className="inspiration-upload-error">{importDialog.uploadError}</p> : null}
            {importDialog.notice ? <p role="status">{importDialog.notice}</p> : null}
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
                    <div key={img} onClick={() => setImportField("selectedImage", img)} style={{ border: importDialog.selectedImage === img ? "3px solid #3b82f6" : "2px solid #eee", borderRadius: "8px", overflow: "hidden", cursor: "pointer", aspectRatio: "4/3" }}>
                      <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {importDialog.manualMode ? (
              <div style={{ marginBottom: "12px" }}>
                <input type="text" placeholder="手动输入图片 URL" value={importDialog.selectedImage} onChange={(e) => setImportField("selectedImage", e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px" }} />
              </div>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div><label style={{ fontSize: "13px", color: "#666" }}>标题</label><input type="text" value={importDialog.title} onChange={(e) => setImportField("title", e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} /></div>
              <div><label style={{ fontSize: "13px", color: "#666" }}>分类</label><select value={importDialog.category} onChange={(e) => setImportField("category", e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }}>{["建筑", "景观", "室内", "城市", "构图", "材质", "光影", "色彩"].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: "16px" }}><label style={{ fontSize: "13px", color: "#666" }}>标签（逗号分隔）</label><input type="text" value={importDialog.tags} onChange={(e) => setImportField("tags", e.target.value)} placeholder="如：住宅, 日本, 混凝土" style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} /></div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button type="button" className="ghost-button" onClick={closeImport}>取消</button>
              <button type="button" className="admin-primary-button" disabled={!importDialog.title.trim() || !importDialog.selectedImage.trim() || importDialog.uploadingFile || importDialog.loading || importDialog.saving || importDialog.createState === "accepted"} onClick={() => void saveImport()}>{importDialog.createState === "unknown" ? "结果待确认" : importDialog.createState === "accepted" ? "已导入" : importDialog.saving ? "导入中..." : "确认导入"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit Dialog */}
      {editDialog ? (
        <div className="media-lightbox" onClick={closeEdit}>
          <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "480px", width: "90vw", color: "#333" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>编辑灵感</h2>
            {editDialog.error ? <p className="inspiration-upload-error">{editDialog.error}</p> : null}
            {editDialog.notice ? <p role="status">{editDialog.notice}</p> : null}
            <input ref={editUploadInputRef} type="file" accept="image/*" hidden onChange={handleEditFileInputChange} />
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div><label style={{ fontSize: "13px", color: "#666" }}>标题</label><input type="text" value={editDialog.title} onChange={(e) => setEditField("title", e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} /></div>
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
              <div><label style={{ fontSize: "13px", color: "#666" }}>图片 URL</label><input type="text" value={editDialog.image_path} onChange={(e) => setEditField("image_path", e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} /></div>
              <div><label style={{ fontSize: "13px", color: "#666" }}>原文链接</label><input type="text" value={editDialog.source_url} onChange={(e) => setEditField("source_url", e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} /></div>
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button type="button" className="ghost-button" onClick={closeEdit}>取消</button>
              <button type="button" className="admin-primary-button" disabled={editDialog.uploadingFile || editDialog.saving} onClick={() => void saveEdit()}>{editDialog.saving ? "保存中..." : "保存"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
