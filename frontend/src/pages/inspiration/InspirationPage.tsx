import { useState } from "react";
import { api, type InspirationPost } from "../../api";

/* ─── Props ─── */

export type InspirationPageProps = {
  posts: InspirationPost[];
  onPostsChange: (posts: InspirationPost[]) => void;
  canManage: boolean;
};

/* ─── Component ─── */

export default function InspirationPage({ posts, onPostsChange, canManage }: InspirationPageProps) {
  const [category, setCategory] = useState("全部");
  const [lightbox, setLightbox] = useState<InspirationPost | null>(null);
  const [importDialog, setImportDialog] = useState<{
    open: boolean; url: string; loading: boolean; images: string[];
    selectedImage: string; title: string; category: string; tags: string;
    error: string; manualMode: boolean;
  }>({ open: false, url: "", loading: false, images: [], selectedImage: "", title: "", category: "建筑", tags: "", error: "", manualMode: false });
  const [editDialog, setEditDialog] = useState<{ postId: number; title: string; image_path: string; source_url: string } | null>(null);

  function loadPosts(cat: string) {
    api.inspiration(cat).then(onPostsChange).catch(() => {});
  }

  return (
    <section className="inspiration-page">
      <header className="inspiration-header">
        <div>
          <h1>灵感</h1>
          <p>探索参考案例、材质与构图，激发设计灵感</p>
        </div>
        <div className="inspiration-actions">
          {canManage ? (
            <button type="button" className="admin-primary-button" onClick={() => {
              setImportDialog({ open: true, url: "", loading: false, images: [], selectedImage: "", title: "", category: category !== "全部" ? category : "建筑", tags: "", error: "", manualMode: false });
            }}>+ 导入参考</button>
          ) : null}
        </div>
      </header>

      <nav className="inspiration-categories">
        {["全部", "建筑", "景观", "室内", "城市", "构图", "材质", "光影", "色彩"].map((cat) => (
          <button key={cat} type="button" className={category === cat ? "active" : ""} onClick={() => { setCategory(cat); loadPosts(cat); }}>{cat}</button>
        ))}
      </nav>

      <div className="inspiration-grid">
        {posts.length > 0 ? posts.map((post) => (
          <article key={post.id} className="inspiration-card">
            <div className="inspiration-card-image" onClick={() => setLightbox(post)} style={{ cursor: "pointer" }}>
              {post.image_path ? <img src={post.image_path} alt={post.title} loading="lazy" /> : <div className="inspiration-card-placeholder" />}
              {post.category !== "全部" ? <span className="inspiration-card-badge">{post.category}</span> : null}
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
                  <button type="button" className="ghost-button" onClick={() => { api.likeInspiration(post.id).then(() => loadPosts(category)); }}>♡ {post.like_count}</button>
                  {canManage ? <button type="button" className="ghost-button" title="编辑" onClick={() => setEditDialog({ postId: post.id, title: post.title, image_path: post.image_path, source_url: post.source_url })}>✎</button> : null}
                </span>
              </div>
            </div>
          </article>
        )) : (
          <div className="inspiration-empty"><p>暂无灵感内容。管理员可以导入外部参考，设计师可以分享生成成果。</p></div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox ? (
        <div className="media-lightbox" onClick={() => setLightbox(null)} onKeyDown={(e) => { if (e.key === "Escape") setLightbox(null); }} tabIndex={0} ref={(el) => el?.focus()}>
          <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="media-lightbox-close" onClick={() => setLightbox(null)}>×</button>
            <img src={lightbox.image_path} alt={lightbox.title} style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain" }} />
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
                const tags = importDialog.tags.split(",").map((t) => t.trim()).filter(Boolean);
                let sourceName = "";
                try { sourceName = new URL(importDialog.url).hostname.replace(/^www\./, ""); } catch {}
                await api.createInspiration({ title: importDialog.title.trim(), image_path: importDialog.selectedImage.trim(), category: importDialog.category, source_type: "external", source_name: sourceName, source_url: importDialog.url.trim(), tags });
                setImportDialog({ ...importDialog, open: false });
                loadPosts(category);
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
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div><label style={{ fontSize: "13px", color: "#666" }}>标题</label><input type="text" value={editDialog.title} onChange={(e) => setEditDialog({ ...editDialog, title: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} /></div>
              <div><label style={{ fontSize: "13px", color: "#666" }}>图片 URL</label><input type="text" value={editDialog.image_path} onChange={(e) => setEditDialog({ ...editDialog, image_path: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} /></div>
              <div><label style={{ fontSize: "13px", color: "#666" }}>原文链接</label><input type="text" value={editDialog.source_url} onChange={(e) => setEditDialog({ ...editDialog, source_url: e.target.value })} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", marginTop: "4px" }} /></div>
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button type="button" className="ghost-button" onClick={() => setEditDialog(null)}>取消</button>
              <button type="button" className="admin-primary-button" onClick={async () => {
                await api.updateInspiration(editDialog.postId, { title: editDialog.title, image_path: editDialog.image_path, source_url: editDialog.source_url });
                setEditDialog(null);
                loadPosts(category);
              }}>保存</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
