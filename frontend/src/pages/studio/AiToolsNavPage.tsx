import { useMemo, useState } from "react";

import type { AiToolRecord } from "../../api";

function categoryLabel(category: string): string {
  return category.trim() || "未分类";
}

export type AiToolsNavPageProps = {
  tools: AiToolRecord[];
  loading?: boolean;
  error?: string;
};

export default function AiToolsNavPage({ tools, loading, error }: AiToolsNavPageProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const tool of tools) set.add(categoryLabel(tool.category));
    return Array.from(set).sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [tools]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return tools.filter((tool) => {
      if (activeCategory !== "all" && categoryLabel(tool.category) !== activeCategory) return false;
      if (!keyword) return true;
      const haystack = `${tool.name} ${tool.description} ${tool.category}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [activeCategory, search, tools]);

  function openTool(tool: AiToolRecord) {
    window.open(tool.url, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="qmdh-ai-tools-page">
      <header className="qmdh-ai-tools-head">
        <div>
          <h1>导航</h1>
          <p>精选各类优秀 AI 工具与产品，点击卡片即可打开官网。</p>
        </div>
        <label className="qmdh-ai-tools-search">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索名称或简介…"
            aria-label="搜索工具"
          />
        </label>
      </header>

      <div className="qmdh-ai-tools-filters">
        <button
          type="button"
          className={activeCategory === "all" ? "is-active" : ""}
          onClick={() => setActiveCategory("all")}
        >
          全部
        </button>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={activeCategory === category ? "is-active" : ""}
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      {error ? <div className="floating-error">{error}</div> : null}
      {loading ? <p className="qmdh-ai-tools-empty">加载中…</p> : null}

      {!loading && filtered.length === 0 ? (
        <p className="qmdh-ai-tools-empty">
          {tools.length === 0 ? "暂无工具，请联系管理员在后台添加。" : "当前筛选下没有匹配的工具。"}
        </p>
      ) : (
        <div className="qmdh-ai-tools-grid">
          {filtered.map((tool) => (
            <button
              key={tool.id}
              type="button"
              className="qmdh-ai-tool-card"
              onClick={() => openTool(tool)}
              title={`打开 ${tool.name}`}
            >
              <div className="qmdh-ai-tool-cover">
                {tool.cover_image_path ? (
                  <img src={tool.cover_image_path} alt="" />
                ) : (
                  <span>{tool.name.slice(0, 1)}</span>
                )}
                {tool.is_featured ? <em className="qmdh-ai-tool-badge">精选</em> : null}
              </div>
              <div className="qmdh-ai-tool-body">
                <strong>{tool.name}</strong>
                <small>{categoryLabel(tool.category)}</small>
                <p>{tool.description.trim() || "暂无简介"}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
