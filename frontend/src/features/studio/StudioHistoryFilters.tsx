import StudioHistoryFilterSelect from "./StudioHistoryFilterSelect";
import {
  buildStudioHistoryProviderOptions,
  STUDIO_HISTORY_SORT_OPTIONS,
  STUDIO_HISTORY_STATUS_OPTIONS,
} from "./studioHistoryFilterOptions";
import type { FeedFilterState, StudioHistoryFiltersProps } from "./studioHistoryPaneTypes";

export default function StudioHistoryFilters({
  availableProviders,
  filters,
  onChangeFilters,
  onScrollHistoryToBottom,
  onScrollHistoryToTop,
}: StudioHistoryFiltersProps) {
  return (
    <header className="canvas-topbar canvas-topbar-history">
      <div className="toolbar-row">
        <div className="history-scroll-actions" role="group" aria-label="历史列表滚动">
          <button type="button" className="ghost-button history-scroll-button" onClick={onScrollHistoryToTop}>
            到最上方
          </button>
          <button type="button" className="ghost-button history-scroll-button" onClick={onScrollHistoryToBottom}>
            到最下方
          </button>
        </div>

        <StudioHistoryFilterSelect
          label="时间"
          options={STUDIO_HISTORY_SORT_OPTIONS}
          value={filters.sort}
          onChange={(sort) => onChangeFilters({ ...filters, sort: sort as FeedFilterState["sort"] })}
        />

        <StudioHistoryFilterSelect
          label="生成类型"
          options={buildStudioHistoryProviderOptions(availableProviders)}
          value={filters.provider}
          onChange={(provider) => onChangeFilters({ ...filters, provider })}
        />

        <StudioHistoryFilterSelect
          label="操作状态"
          options={STUDIO_HISTORY_STATUS_OPTIONS}
          value={filters.status}
          onChange={(status) => onChangeFilters({ ...filters, status: status as FeedFilterState["status"] })}
        />
      </div>
    </header>
  );
}
