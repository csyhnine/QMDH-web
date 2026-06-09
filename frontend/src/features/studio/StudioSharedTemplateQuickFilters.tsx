import type { TemplateQuickFilter } from "./studioTemplateBrowserUtils";
import type { SharedTemplateBrowserState } from "./useSharedTemplateBrowser";

type TemplateQuickFilterItem = {
  key: TemplateQuickFilter;
  label: string;
};

const QUICK_FILTERS: TemplateQuickFilterItem[] = [
  { key: "all", label: "\u5168\u90e8" },
  { key: "featured", label: "\u70ed\u5ea6" },
  { key: "recent", label: "\u6700\u65b0" },
];

type StudioSharedTemplateQuickFiltersProps = {
  browser: SharedTemplateBrowserState;
};

export default function StudioSharedTemplateQuickFilters({
  browser,
}: StudioSharedTemplateQuickFiltersProps) {
  return (
    <>
      {QUICK_FILTERS.map((filter) => (
        <button
          key={filter.key}
          type="button"
          className={isQuickFilterActive(browser, filter.key) ? "template-nav-item is-active" : "template-nav-item"}
          onClick={() => browser.activateQuickFilter(filter.key)}
        >
          <span>{filter.label}</span>
        </button>
      ))}
    </>
  );
}

function isQuickFilterActive(browser: SharedTemplateBrowserState, filter: TemplateQuickFilter) {
  if (filter === "all") {
    return browser.activeTemplateCategory === "all" && browser.templateQuickFilter === "all";
  }
  return browser.templateQuickFilter === filter;
}
