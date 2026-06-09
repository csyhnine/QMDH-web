import type { Provider } from "../../api";
import type { StudioHistoryFilterOption } from "./studioHistoryPaneTypes";

export const STUDIO_HISTORY_SORT_OPTIONS: StudioHistoryFilterOption[] = [
  { label: "最近优先", value: "latest" },
  { label: "最早优先", value: "oldest" },
];

export const STUDIO_HISTORY_STATUS_OPTIONS: StudioHistoryFilterOption[] = [
  { label: "全部状态", value: "all" },
  { label: "运行中", value: "running" },
  { label: "已完成", value: "completed" },
];

export function buildStudioHistoryProviderOptions(
  availableProviders: Provider[],
): StudioHistoryFilterOption[] {
  return [
    { label: "全部模型", value: "all" },
    ...availableProviders.map((provider) => ({
      label: provider.provider_name,
      value: provider.provider_name,
    })),
  ];
}
