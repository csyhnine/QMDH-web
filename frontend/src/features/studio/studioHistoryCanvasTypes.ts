import type { RefObject } from "react";

import type { Asset, Provider, Task } from "../../api";
import type { FeedFilterState, HistoryNotice } from "./studioHistoryPaneTypes";
import type { HistoryActionFeedback, HistoryActionKey } from "./studioTypes";
import type { UpscaleOptions } from "./studioUpscaleOptions";

export type StudioHistoryCanvasProps = {
  availableProviders: Provider[];
  error: string;
  filters: FeedFilterState;
  hasFilteredHistory: boolean;
  hasProjectHistory: boolean;
  historyActionPendingByTaskId: Record<number, HistoryActionKey | null>;
  historyFeedbackByTaskId: Record<number, HistoryActionFeedback | undefined>;
  historyNotice: HistoryNotice | null;
  imageAssetsByTaskId: Map<number, Asset[]>;
  isStudioDockLayout: boolean;
  latestTask: Task | null;
  latestTaskRef: RefObject<HTMLElement | null>;
  providerDisplayNameMap: Map<string, string>;
  regeneratingTaskId: number | null;
  showDebugDetails: boolean;
  studioScrollPaneRef: RefObject<HTMLDivElement | null>;
  submitting: boolean;
  tasks: Task[];
  upscaleEnabled: boolean;
  upscalingAssetKey: string | null;
  workspaceName: string;
  onApplyTaskToComposer: (task: Task, asset?: Asset) => void;
  onBookmarkAsset: (taskId: number, assetId: number) => void;
  onChangeFilters: (next: FeedFilterState) => void;
  onDeleteTask: (task: Task) => void;
  onPreviewAsset: (task: Task, asset: Asset) => void;
  onRegenerateTask: (task: Task, asset?: Asset) => void;
  onShareAsset: (task: Task, asset: Asset) => void;
  onUpscaleAsset: (task: Task, asset: Asset, options: UpscaleOptions) => void;
};

export type StudioHistoryScrollProps = Pick<
  StudioHistoryCanvasProps,
  "isStudioDockLayout" | "studioScrollPaneRef"
>;
