import { useEffect, useState } from "react";

import type { CanvasNodeStatus } from "./canvasTypes";
import {
  formatTaskElapsedMs,
  inferCanvasNodeProgress,
  isCanvasNodeTaskBusy,
} from "./canvasTaskProgressUtils";

type CanvasNodeTaskProgressProps = {
  status: CanvasNodeStatus;
  taskStartedAt?: number;
  taskDurationMs?: number;
  compact?: boolean;
};

export default function CanvasNodeTaskProgress({
  status,
  taskStartedAt,
  taskDurationMs,
  compact = false,
}: CanvasNodeTaskProgressProps) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const busy = isCanvasNodeTaskBusy(status);
  const showProgress = busy || (status === "completed" && typeof taskDurationMs === "number");

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 900);
    return () => window.clearInterval(timer);
  }, [busy]);

  if (!showProgress) return null;

  const progress = inferCanvasNodeProgress(status, taskStartedAt, nowTick);
  const elapsedMs =
    typeof taskDurationMs === "number"
      ? taskDurationMs
      : taskStartedAt
        ? Math.max(0, nowTick - taskStartedAt)
        : 0;
  const elapsedLabel = formatTaskElapsedMs(elapsedMs);
  const statusHint =
    status === "submitting"
      ? "提交中"
      : status === "awaiting_result"
        ? "等待较久"
        : status === "running"
          ? "生成中"
          : status === "pending"
            ? "排队中"
            : "已完成";

  return (
    <div className={`qmdh-canvas-node-progress${compact ? " is-compact" : ""}`}>
      <div className="qmdh-canvas-node-progress-head">
        <strong>{busy ? `${progress}%` : "100%"}</strong>
        <span>
          {statusHint}
          {elapsedMs > 0 ? ` · ${elapsedLabel}` : ""}
        </span>
      </div>
      <div className="qmdh-canvas-node-progress-track" aria-hidden="true">
        <b style={{ width: `${busy ? progress : 100}%` }} />
      </div>
    </div>
  );
}
