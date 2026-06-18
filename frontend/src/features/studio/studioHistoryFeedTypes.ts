import type { RefObject } from "react";

import type { Asset, Task } from "../../api";
import type { HistoryActionFeedback, HistoryActionKey } from "./studioTypes";

export type StudioHistoryFeedProps = {
  tasks: Task[];
  imageAssetsByTaskId: Map<number, Asset[]>;
  latestTask: Task | null;
  latestTaskRef: RefObject<HTMLElement | null>;
  providerDisplayNameMap: Map<string, string>;
  showDebugDetails: boolean;
  submitting: boolean;
  regeneratingTaskId: number | null;
  pendingActionByTaskId: Record<number, HistoryActionKey | null>;
  feedbackByTaskId: Record<number, HistoryActionFeedback | undefined>;
  onRegenerateTask: (task: Task, asset?: Asset) => void;
  onUpscaleAsset: (task: Task, asset: Asset) => void;
  upscaleEnabled: boolean;
  upscalingAssetKey: string | null;
  onBookmarkAsset: (taskId: number, assetId: number) => void;
  onShareAsset: (task: Task, asset: Asset) => void;
  onDeleteTask: (task: Task) => void;
  onPreviewAsset: (task: Task, asset: Asset) => void;
  onApplyTaskToComposer: (task: Task, asset?: Asset) => void;
};

export type StudioHistoryFeedItemProps = Omit<StudioHistoryFeedProps, "tasks"> & {
  task: Task;
};
