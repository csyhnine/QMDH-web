import StudioFeedActionButton from "./StudioFeedActionButton";
import { buildStudioFeedActionItems } from "./studioFeedActionUtils";
import type { StudioFeedCardActionsProps } from "./studioFeedCardTypes";

export default function StudioFeedCardActions({
  asset,
  feedback,
  pendingAction,
  reuseDisabled,
  onBookmark,
  onDelete,
  onReuse,
  onShare,
}: StudioFeedCardActionsProps) {
  const actions = buildStudioFeedActionItems({
    asset,
    feedback,
    pendingAction,
    reuseDisabled,
    onBookmark,
    onDelete,
    onReuse,
    onShare,
  });

  return (
    <div className="feed-action-group">
      {actions.map((action) => (
        <StudioFeedActionButton
          key={action.action}
          action={action.action}
          disabled={action.disabled}
          extraClass={action.extraClass}
          feedback={feedback}
          label={action.label}
          pendingAction={pendingAction}
          onClick={action.onClick}
        />
      ))}
    </div>
  );
}
