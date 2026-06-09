import type { Task } from "../../api";
import {
  formatFailureStage,
  taskFailureCode,
  taskFailureDetail,
  taskFailureHint,
  taskFailureStage,
} from "./studioUtils";

const ERROR_CODE_LABEL = "\u00b7 \u9519\u8bef\u7801\uff1a";
const ERROR_DETAIL_LABEL = "\u9519\u8bef\u4fe1\u606f\uff1a";
const FAILURE_STAGE_LABEL = "\u5931\u8d25\u9636\u6bb5\uff1a";
const MODEL_LABEL = "\u00b7 \u6a21\u578b\uff1a";
const TASK_ID_LABEL = "\u4efb\u52a1 ID\uff1a";
const VIEW_FAILURE_REASON = "\u67e5\u770b\u5931\u8d25\u539f\u56e0";
const SUGGESTION_LABEL = "\u5efa\u8bae\uff1a";

type StudioFeedCardFailureDetailsProps = {
  showDebugDetails?: boolean;
  task: Task;
};

export default function StudioFeedCardFailureDetails({
  showDebugDetails,
  task,
}: StudioFeedCardFailureDetailsProps) {
  const failureDetail = taskFailureDetail(task);
  const failureHint = taskFailureHint(task);
  const failureCode = taskFailureCode(task);
  const failureStage = taskFailureStage(task);
  const showFailureDetails = task.status === "failed" && Boolean(failureDetail || failureHint || failureCode);

  if (!showFailureDetails) return null;

  return (
    <details className="feed-card-summary-details feed-card-error-details">
      <summary>{VIEW_FAILURE_REASON}</summary>
      {failureStage ? <p>{FAILURE_STAGE_LABEL}{formatFailureStage(failureStage)}</p> : null}
      {failureDetail ? <p>{ERROR_DETAIL_LABEL}{failureDetail}</p> : null}
      {failureHint ? <p>{SUGGESTION_LABEL}{failureHint}</p> : null}
      <p>
        {TASK_ID_LABEL}{task.id}
        {failureCode ? ` ${ERROR_CODE_LABEL}${failureCode}` : ""}
        {showDebugDetails ? ` ${MODEL_LABEL}${task.requested_provider}` : ""}
      </p>
    </details>
  );
}
