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
}: StudioHistoryFiltersProps) {
  return (
    <header className="canvas-topbar canvas-topbar-history">
      <div className="toolbar-row">
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
