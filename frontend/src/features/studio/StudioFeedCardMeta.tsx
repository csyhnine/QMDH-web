import type { Task } from "../../api";
import { formatDuration } from "./studioUtils";

const GALLERY_LABEL = "\u5df2\u5165\u56fe\u5e93";
const REFERENCE_IMAGE_LABEL = "\u53c2\u8003\u56fe";
const SHEET_LABEL = "\u5f20";

type StudioFeedCardMetaProps = {
  hasReferenceImage: boolean;
  isInGallery: boolean;
  providerDisplayName: string;
  referenceImageCount: number;
  showDebugDetails?: boolean;
  task: Task;
};

export default function StudioFeedCardMeta({
  hasReferenceImage,
  isInGallery,
  providerDisplayName,
  referenceImageCount,
  showDebugDetails,
  task,
}: StudioFeedCardMetaProps) {
  return (
    <div className="feed-card-meta">
      {showDebugDetails ? <span>{task.project_code}</span> : null}
      <span>{providerDisplayName}</span>
      <span>{formatDuration(task.latency_ms)}</span>
      {hasReferenceImage ? <span>{REFERENCE_IMAGE_LABEL} {referenceImageCount} {SHEET_LABEL}</span> : null}
      {isInGallery ? <span>{GALLERY_LABEL}</span> : null}
    </div>
  );
}
