import type { Task } from "../../api";
import { clampImageCount } from "./studioAssetUtils";

export function inferVirtualTaskPercent(task: Task, nowMs: number): number {
  if (task.status === "completed") return 100;
  if (task.status === "failed") return 96;

  const createdAtMs = new Date(task.created_at).getTime();
  const elapsedSeconds = Math.max(0, (nowMs - createdAtMs) / 1000);

  if (task.status === "pending") {
    return Math.min(68, 12 + Math.floor(elapsedSeconds * 1.2));
  }
  if (task.status === "running") {
    return Math.min(95, 70 + Math.floor(elapsedSeconds * 0.35));
  }
  return 0;
}

export function inferRequestedImageCount(task: Task): number {
  const requestedCount = Number(task.result["requested_image_count"] ?? task.result["output_count"] ?? 1);
  if (Number.isNaN(requestedCount)) return 1;
  return clampImageCount(requestedCount);
}

export function taskResultString(task: Task, key: string): string {
  const value = task.result[key];
  return typeof value === "string" ? value : "";
}
