export type ChatStreamError = {
  code?: string;
  summary?: string;
  detail?: string;
  status_code?: number;
};

export function formatStreamError(error: string | ChatStreamError) {
  if (typeof error === "string") {
    return `提示：${error}`;
  }

  const summary = (error.summary || "对话失败，请稍后重试。").trim();
  const detail = (error.detail || "").trim();
  const code = (error.code || "").trim();
  const lines = [summary];
  if (detail && detail !== summary) {
    lines.push(`排查线索：${detail}`);
  }
  if (code) {
    lines.push(`错误码：${code}`);
  }
  return lines.join("\n");
}
