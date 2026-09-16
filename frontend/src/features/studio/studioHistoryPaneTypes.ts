import type { ReactNode } from "react";

import type { Provider } from "../../api";

export type FeedFilterState = {
  sort: "latest" | "oldest";
  status: "all" | "running" | "completed";
  provider: string;
};

export type HistoryNotice = {
  tone: "success" | "error" | "info";
  message: string;
};

export type StudioHistoryPaneProps = {
  availableProviders: Provider[];
  error: string;
  notice?: HistoryNotice | null;
  filters: FeedFilterState;
  hasFilteredHistory: boolean;
  hasProjectHistory: boolean;
  workspaceName: string;
  onChangeFilters: (next: FeedFilterState) => void;
  children: ReactNode;
};

export type StudioHistoryFiltersProps = Pick<
  StudioHistoryPaneProps,
  "availableProviders" | "filters" | "onChangeFilters"
>;

export type StudioHistoryFilterOption = {
  label: string;
  value: string;
};

export type StudioHistoryFilterSelectProps = {
  label: string;
  options: StudioHistoryFilterOption[];
  value: string;
  onChange: (value: string) => void;
};

export type StudioHistoryEmptyStateProps = {
  type: "filtered" | "project";
  workspaceName: string;
};
