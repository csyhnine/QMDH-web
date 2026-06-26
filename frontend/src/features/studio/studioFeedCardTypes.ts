import type { RefObject } from "react";

import type { Asset, Task } from "../../api";
import type { HistoryActionFeedback, HistoryActionKey } from "./studioTypes";
import type { UpscaleOptions } from "./studioUpscaleOptions";

export type StudioFeedCardProps = {
  task: Task;
  providerDisplayName: string;
  asset?: Asset;
  galleryAssets: Asset[];
  showDebugDetails?: boolean;
  onReuse: () => void;
  reuseDisabled?: boolean;
  onBookmark: () => void;
  onShare: () => void;
  onDelete: () => void;
  onAssetPreview?: (asset: Asset) => void;
  onUpscaleAsset?: (asset: Asset, options: UpscaleOptions) => void;
  upscaleDisabled?: boolean;
  upscaleEnabled?: boolean;
  upscalingAssetKey?: string | null;
  anchorRef?: RefObject<HTMLElement | null>;
  pendingAction?: HistoryActionKey | null;
  feedback?: HistoryActionFeedback | null;
};

export type StudioFeedReferenceBadgeProps = {
  imageCount: number;
  imageLabel: string;
  primaryImage: string;
};

export type StudioFeedCardHeaderProps = {
  displayTitle: string;
  hasLongSummary: boolean;
  hasReferenceImage: boolean;
  isInGallery: boolean;
  providerDisplayName: string;
  referenceImageCount: number;
  showDebugDetails?: boolean;
  summary: string;
  summaryPreview: string;
  task: Task;
};

export type StudioFeedCardFooterProps = Pick<
  StudioFeedCardProps,
  | "asset"
  | "feedback"
  | "pendingAction"
  | "reuseDisabled"
  | "onBookmark"
  | "onDelete"
  | "onReuse"
  | "onShare"
> & {
  createdAt: string;
  providerDisplayName: string;
  task: Task;
};

export type StudioFeedCardResultProps = Pick<
  StudioFeedCardProps,
  "galleryAssets" | "onAssetPreview" | "onReuse" | "onUpscaleAsset" | "task" | "upscaleDisabled" | "upscaleEnabled" | "upscalingAssetKey"
> & {
  showRunningState: boolean;
  virtualProgress: number;
};

export type StudioFeedCardLayoutProps = {
  footerProps: StudioFeedCardFooterProps;
  headerProps: StudioFeedCardHeaderProps;
  referenceBadgeProps: StudioFeedReferenceBadgeProps;
  resultProps: StudioFeedCardResultProps;
};

export type StudioFeedCardActionsProps = Pick<
  StudioFeedCardFooterProps,
  | "asset"
  | "feedback"
  | "pendingAction"
  | "reuseDisabled"
  | "onBookmark"
  | "onDelete"
  | "onReuse"
  | "onShare"
>;

export type StudioFeedActionItem = {
  action: HistoryActionKey;
  disabled: boolean;
  extraClass?: string;
  label: string;
  onClick: () => void;
};
