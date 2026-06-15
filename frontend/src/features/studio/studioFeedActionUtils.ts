import type { Asset } from "../../api";
import type { StudioFeedActionItem, StudioFeedCardActionsProps } from "./studioFeedCardTypes";
import type { HistoryActionFeedback, HistoryActionKey } from "./studioTypes";

const BOOKMARK_PENDING_LABEL = "\u6807\u8bb0\u4e2d...";
const BOOKMARKED_LABEL = "\u2605 \u5df2\u6807\u8bb0";
const BOOKMARK_LABEL = "\u2606 \u6807\u8bb0";
const DELETE_LABEL = "\u5220\u9664";
const DELETE_PENDING_LABEL = "\u5220\u9664\u4e2d...";
const REUSE_LABEL = "\u518d\u6b21\u751f\u6210";
const REUSE_PENDING_LABEL = "\u63d0\u4ea4\u4e2d...";
const SHARE_PENDING_LABEL = "\u5206\u4eab\u4e2d...";

export function feedActionClass(
  pendingAction: HistoryActionKey | null | undefined,
  feedback: HistoryActionFeedback | null | undefined,
  action: HistoryActionKey,
  extraClass = ""
): string {
  return [
    "ghost-button",
    extraClass,
    "feed-action-button",
    pendingAction === action ? "is-pending" : "",
    feedback?.action === action && feedback.tone === "success" ? "is-success" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function reuseActionLabel(pendingAction: HistoryActionKey | null | undefined): string {
  return pendingAction === "reuse" ? REUSE_PENDING_LABEL : REUSE_LABEL;
}

export function bookmarkActionLabel(
  asset: Asset | undefined,
  pendingAction: HistoryActionKey | null | undefined
): string {
  if (pendingAction === "bookmark") return BOOKMARK_PENDING_LABEL;
  return asset?.is_bookmarked ? BOOKMARKED_LABEL : BOOKMARK_LABEL;
}

export function shareActionLabel(
  asset: Asset | undefined,
  pendingAction: HistoryActionKey | null | undefined
): string {
  const shareCount = asset?.share_count ?? 0;
  if (pendingAction === "share") return SHARE_PENDING_LABEL;
  return asset?.is_shared_to_inspiration
    ? `\u5df2\u5206\u4eab ${shareCount}`
    : `\u5206\u4eab ${shareCount}`;
}

export function deleteActionLabel(pendingAction: HistoryActionKey | null | undefined): string {
  return pendingAction === "delete" ? DELETE_PENDING_LABEL : DELETE_LABEL;
}

export function buildStudioFeedActionItems({
  asset,
  pendingAction,
  reuseDisabled,
  onBookmark,
  onDelete,
  onReuse,
  onShare,
}: StudioFeedCardActionsProps): StudioFeedActionItem[] {
  return [
    {
      action: "reuse",
      disabled: Boolean(reuseDisabled) || pendingAction !== null,
      label: reuseActionLabel(pendingAction),
      onClick: onReuse,
    },
    {
      action: "bookmark",
      disabled: !asset || pendingAction !== null,
      extraClass: asset?.is_bookmarked ? "bookmarked" : "",
      label: bookmarkActionLabel(asset, pendingAction),
      onClick: onBookmark,
    },
    {
      action: "share",
      disabled: !asset || pendingAction !== null,
      label: shareActionLabel(asset, pendingAction),
      onClick: onShare,
    },
    {
      action: "delete",
      disabled: pendingAction !== null,
      extraClass: "danger-text",
      label: deleteActionLabel(pendingAction),
      onClick: onDelete,
    },
  ];
}
