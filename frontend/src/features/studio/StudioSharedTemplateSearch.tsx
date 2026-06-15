import type { SharedTemplateBrowserState } from "./useSharedTemplateBrowser";

const SEARCH_ICON = "\u2315";
const SEARCH_PLACEHOLDER = "\u641c\u7d22";

type StudioSharedTemplateSearchProps = {
  browser: Pick<
    SharedTemplateBrowserState,
    "setTemplateSearch" | "templateSearch" | "templateSearchEngine" | "isTemplateSearching" | "templateSearchHitCount"
  >;
};

export default function StudioSharedTemplateSearch({ browser }: StudioSharedTemplateSearchProps) {
  const { setTemplateSearch, templateSearch, templateSearchEngine, isTemplateSearching, templateSearchHitCount } =
    browser;

  return (
    <div className="template-browser-search-wrap">
      <label className="template-browser-search">
        <span aria-hidden="true">{SEARCH_ICON}</span>
        <input
          value={templateSearch}
          onChange={(event) => setTemplateSearch(event.target.value)}
          placeholder={SEARCH_PLACEHOLDER}
        />
      </label>
      {templateSearch.trim() ? (
        <p className="template-browser-search-meta">
          {isTemplateSearching
            ? "搜索中..."
            : templateSearchHitCount !== null
              ? `${templateSearchHitCount} 条命中 · ${templateSearchEngine ?? "local"}`
              : `本地匹配 · ${templateSearchEngine ?? "postgres"}`}
        </p>
      ) : null}
    </div>
  );
}
