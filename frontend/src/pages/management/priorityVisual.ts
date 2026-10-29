export function escapeChartText(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
export function projectGrade(value: unknown): string {
  const match = String(value ?? "").trim().toUpperCase().match(/^([ABCD])(?:级)?$/);
  return match?.[1] || "";
}
export function priorityClass(value: unknown): string {
  return ({ 重要: "mp-priority-important", 紧急: "mp-priority-urgent", 特急: "mp-priority-critical" } as Record<string, string>)[String(value)] || "";
}
export function priorityBadge(grade: unknown, urgency: unknown): string {
  const g = projectGrade(grade), p = priorityClass(urgency);
  return `${g ? `<span class="mp-grade-badge" title="项目等级 ${g}">${g}</span> ` : ""}${p ? `<span class="mp-priority-label ${p}">${p === "mp-priority-critical" ? "⚠ " : ""}${escapeChartText(urgency)}</span> ` : ""}`;
}
