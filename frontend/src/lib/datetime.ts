const CHINA_TIME_ZONE = "Asia/Shanghai";

/** Backend stores UTC but often serializes naive timestamps without a Z suffix. */
export function parseBackendDateTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const hasTimeZone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);
  const date = new Date(hasTimeZone ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatChinaDateTime(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const date = parseBackendDateTime(value);
  if (!date) return value ? String(value) : "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: CHINA_TIME_ZONE,
    ...options,
  }).format(date);
}

export function formatChinaMonthDayTime(value: string | null | undefined): string {
  return formatChinaDateTime(value, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
