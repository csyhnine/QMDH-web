import type { Task } from "../../api";

export function taskFailureDetail(task: Task): string {
  if (task.status !== "failed") return "";
  const detail = task.result["error_detail"] ?? task.result["error_raw"] ?? task.result["error"];
  return detail ? String(detail) : "";
}

export function taskFailureHint(task: Task): string {
  if (task.status !== "failed") return "";
  const hint = task.result["error_hint"];
  return hint ? String(hint) : "";
}

export function taskFailureCode(task: Task): string {
  if (task.status !== "failed") return "";
  const code = task.result["error_code"];
  return code ? String(code) : "";
}

export function taskFailureStage(task: Task): string {
  if (task.status !== "failed") return "";
  const stage = task.result["error_stage"];
  return stage ? String(stage) : "";
}

export function formatFailureStage(stage: string): string {
  switch (stage) {
    case "image_generation_request":
      return "图片生成请求";
    case "generated_image_download":
      return "结果下载";
    case "reference_image_caption":
      return "参考图分析";
    case "async_result_poll":
      return "异步结果轮询";
    case "task_execution":
      return "任务执行";
    default:
      return stage || "任务执行";
  }
}
