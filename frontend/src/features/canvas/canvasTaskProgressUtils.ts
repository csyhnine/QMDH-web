import type { Task } from "../../api";
import { inferVirtualTaskPercent } from "../studio/studioTaskProgressUtils";
import type { CanvasNodeStatus } from "./canvasTypes";

export function formatTaskElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes <= 0) return `${seconds}秒`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function inferCanvasNodeProgress(
  status: CanvasNodeStatus,
  startedAtMs: number | undefined,
  nowMs: number
): number {
  if (status === "completed") return 100;
  if (status === "failed") return 96;
  if (status === "submitting") return 8;
  if (!startedAtMs) {
    return status === "awaiting_result" ? 90 : 0;
  }

  const mappedStatus =
    status === "running" ? "running" : status === "awaiting_result" ? "pending" : "pending";
  const synthetic = {
    status: mappedStatus,
    created_at: new Date(startedAtMs).toISOString(),
  } as Task;
  const percent = inferVirtualTaskPercent(synthetic, nowMs);
  return status === "awaiting_result" ? Math.max(percent, 88) : percent;
}

export function isCanvasNodeTaskBusy(status: CanvasNodeStatus): boolean {
  return (
    status === "submitting" ||
    status === "pending" ||
    status === "running" ||
    status === "awaiting_result"
  );
}
