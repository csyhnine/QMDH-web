import { feedActionClass } from "./studioFeedActionUtils";
import type { HistoryActionFeedback, HistoryActionKey } from "./studioTypes";

type StudioFeedActionButtonProps = {
  action: HistoryActionKey;
  disabled: boolean;
  feedback?: HistoryActionFeedback | null;
  label: string;
  pendingAction?: HistoryActionKey | null;
  extraClass?: string;
  onClick: () => void;
};

export default function StudioFeedActionButton({
  action,
  disabled,
  feedback,
  label,
  pendingAction,
  extraClass = "",
  onClick,
}: StudioFeedActionButtonProps) {
  return (
    <button
      type="button"
      className={feedActionClass(pendingAction, feedback, action, extraClass)}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
