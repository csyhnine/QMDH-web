import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, type LibraryItem } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { formatChinaMonthDayTime } from "../../lib/datetime";

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
  { key: "cad", label: "解析" },
  { key: "gif", label: "GIF 压缩" },
] as const;

const KIND_LABELS: Record<string, string> = {
  image: "图片",
  video: "视频",
  cad: "解析",
  gif: "GIF 压缩",
};

export default function AssetLibraryPage() {
  const navigate = useNavigate();
  const { isGuest, currentUser } = useAuth();
  const [kind, setKind] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [preview, setPreview] = useState<LibraryItem | null>(null);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [jumpPage, setJumpPage] = useState("1");
  const pageSize = 30;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (isGuest) return;
    let cancelled = false;
    api
      .assetLibrary(kind, page, { q: appliedKeyword, since, until })
      .then((payload) => {
        if (cancelled) return;
        setItems(payload.items);
        setTotal(payload.total);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "无法加载资产库");
      });
    return () => {
      cancelled = true;
    };
  }, [isGuest, kind, page, appliedKeyword, since, until]);

  function applySearch(event: FormEvent) {
    event.preventDefault();
    setAppliedKeyword(keyword.trim());
    setPage(1);
    setJumpPage("1");
    setPreview(null);
  }

  function resetFilters() {
    setKeyword("");
    setAppliedKeyword("");
    setSince("");
    setUntil("");
    setPage(1);
    setJumpPage("1");
    setPreview(null);
  }

  function goToPage(next: number) {
    const target = Math.min(pageCount, Math.max(1, next));
    setPreview(null);
    setPage(target);
    setJumpPage(String(target));
  }

  return (
    <section className="feedback-page cad-extract-page">
      <header className="feedback-page-copy">
        <h1>资产库</h1>
        <p>
          {currentUser ? `当前账号 ${currentUser.display_name || currentUser.name} 的图片、视频、图纸解析和 GIF 压缩结果。` : "登录后查看自己的资产。"}
          不显示其他账号的成果。
        </p>
      </header>
      <div className="admin-section-tabs" role="tablist" aria-label="资产类型">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={kind === item.key}
            className={kind === item.key ? "is-active" : undefined}
            onClick={() => {
              setKind(item.key);
              setPage(1);
              setPreview(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <form className="asset-library-filters" onSubmit={applySearch}>
        <label>
          关键词
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="文件名或提示词" />
        </label>
        <label>
          从
          <input type="date" value={since} onChange={(event) => { setSince(event.target.value); setPage(1); }} />
        </label>
        <label>
          到
          <input type="date" value={until} onChange={(event) => { setUntil(event.target.value); setPage(1); }} />
        </label>
        <button type="submit">搜索</button>
        <button type="button" onClick={resetFilters}>
          重置
        </button>
      </form>
      {isGuest ? <p className="cad-empty-inline">访客不能查看资产库。</p> : null}
      {error ? <div className="floating-error">{error}</div> : null}
      {!isGuest && items.length === 0 && !error ? <p className="cad-empty-inline">这个分类下还没有成果。</p> : null}
      <div className="asset-library-grid">
        {items.map((item) => (
          <article key={item.id} className="asset-library-card">
            <button type="button" className="asset-library-open" onClick={() => setPreview(item)}>
              {item.kind === "video" && item.preview_path ? (
                <video src={item.preview_path} muted />
              ) : item.preview_path ? (
                <img src={item.preview_path} alt="" />
              ) : (
                <span className="asset-library-fallback">{KIND_LABELS[item.kind] ?? item.kind}</span>
              )}
            </button>
            <strong>{item.title}</strong>
            <small>
              {KIND_LABELS[item.kind] ?? item.kind}
              {item.created_at ? ` · ${formatChinaMonthDayTime(item.created_at)}` : ""}
            </small>
            <button type="button" className="asset-library-jump" onClick={() => navigate(item.history_href)}>
              当时记录
            </button>
          </article>
        ))}
      </div>
      <div className="asset-library-pager">
        <button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
          上一页
        </button>
        <span>
          每页 {pageSize} 条 · {page} / {pageCount}
        </span>
        <button type="button" disabled={page >= pageCount} onClick={() => goToPage(page + 1)}>
          下一页
        </button>
        <label>
          跳到
          <input
            inputMode="numeric"
            value={jumpPage}
            onChange={(event) => setJumpPage(event.target.value.replace(/[^\d]/g, ""))}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            const next = Number(jumpPage);
            if (Number.isFinite(next)) goToPage(next);
          }}
        >
          跳转
        </button>
      </div>
      {preview ? (
        <div className="asset-library-lightbox" role="dialog" aria-modal="true" aria-label={preview.title}>
          <button type="button" className="asset-library-lightbox-backdrop" aria-label="关闭预览" onClick={() => setPreview(null)} />
          <div className="asset-library-lightbox-body">
            {preview.kind === "video" && preview.preview_path ? (
              <video src={preview.preview_path} controls autoPlay />
            ) : preview.preview_path ? (
              <img src={preview.preview_path} alt={preview.title} />
            ) : (
              <p>{preview.title}</p>
            )}
            <strong>{preview.title}</strong>
          </div>
        </div>
      ) : null}
    </section>
  );
}
