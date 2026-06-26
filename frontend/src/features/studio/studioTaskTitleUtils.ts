import type { Asset, Task } from "../../api";
import { truncateText } from "./studioFormatUtils";

export function deriveTaskTitleFromPrompt(
  prompt: string,
  fallback = "未命名任务",
  maxLength = 36
): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return truncateText(normalized, maxLength);
}

export function taskSummary(task: Task, asset?: Asset): string {
  if (task.status === "failed" && task.result["error_summary"]) {
    return String(task.result["error_summary"]);
  }
  return asset?.prompt_text ??
    (task.result["summary"]
      ? String(task.result["summary"])
      : task.result["error"]
        ? String(task.result["error"])
        : "等待结果返回。");
}

export function taskDisplayTitle(task: Task, asset?: Asset): string {
  const promptSource =
    asset?.prompt_text ??
    (typeof task.result["prompt"] === "string" ? String(task.result["prompt"]) : "");

  if (promptSource.trim()) {
    return deriveTaskTitleFromPrompt(promptSource, String(task.title || "").trim() || "未命名任务");
  }

  const rawTitle = String(task.title || "").trim();
  if (rawTitle && !/模板/.test(rawTitle)) {
    return rawTitle;
  }

  const summary = taskSummary(task, asset);
  return deriveTaskTitleFromPrompt(summary, rawTitle || "未命名任务");
}
