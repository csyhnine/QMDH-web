import type { Task } from "../../api";
import { formatChinaMonthDayTime } from "../../lib/datetime";
import { studioResolutionLabel } from "./studioConstants";
import { taskResultString } from "./studioTaskProgressUtils";
export function formatFeedCardResolutionLabel(task: Task): string {
  const imageSize = taskResultString(task, "image_size").trim();
  if (imageSize) return imageSize;
  const resolution = taskResultString(task, "resolution");
  if (resolution) return studioResolutionLabel(resolution);
  return "";
}

export function formatFeedCardPixelSize(task: Task): string {
  const width = Number(task.result["output_width"]);
  const height = Number(task.result["output_height"]);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return `${Math.round(width)}×${Math.round(height)}`;
  }
  return taskResultString(task, "aspect_ratio_resolved") || taskResultString(task, "aspect_ratio");
}

export function formatDate(value: string | null): string {
  return formatChinaMonthDayTime(value);
}

export function formatDuration(ms: number): string {
  if (!ms) return "排队中";
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} 分钟`;
  return `${Math.max(1, Math.round(ms / 1000))} 秒`;
}

export function formatStatus(status: string | null): string {
  const mapping: Record<string, string> = {
    pending: "待执行",
    running: "执行中",
    completed: "已完成",
    failed: "执行失败",
    loading: "加载中",
    ok: "在线",
    error: "异常",
  };
  return mapping[status ?? ""] ?? (status ?? "未记录");
}

export function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

export function briefProviderLabel(value: string): string {
  const normalized = value
    .replace(/^google_/i, "")
    .replace(/^modelscope_/i, "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return value;
  return truncateText(normalized, 24);
}
