import { formatStatus } from "./studioUtils";

type StudioFeedCardToplineProps = {
  displayTitle: string;
  status: string;
};

export default function StudioFeedCardTopline({
  displayTitle,
  status,
}: StudioFeedCardToplineProps) {
  return (
    <div className="feed-card-topline">
      <strong>{displayTitle}</strong>
      <span className={`status-pill status-${status}`}>{formatStatus(status)}</span>
    </div>
  );
}
