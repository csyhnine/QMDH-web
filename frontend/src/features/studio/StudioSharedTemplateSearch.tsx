import type { SharedTemplateBrowserState } from "./useSharedTemplateBrowser";

const SEARCH_ICON = "\u2315";
const SEARCH_PLACEHOLDER = "\u641c\u7d22";

type StudioSharedTemplateSearchProps = {
  setTemplateSearch: SharedTemplateBrowserState["setTemplateSearch"];
  templateSearch: SharedTemplateBrowserState["templateSearch"];
};

export default function StudioSharedTemplateSearch({
  setTemplateSearch,
  templateSearch,
}: StudioSharedTemplateSearchProps) {
  return (
    <label className="template-browser-search">
      <span aria-hidden="true">{SEARCH_ICON}</span>
      <input
        value={templateSearch}
        onChange={(event) => setTemplateSearch(event.target.value)}
        placeholder={SEARCH_PLACEHOLDER}
      />
    </label>
  );
}
