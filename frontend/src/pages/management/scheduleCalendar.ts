import { addDays, dayNumber, weekRange } from "./planning";

export type SchedulePeriod = "week" | "month" | "quarter" | "year";
const iso = (date: Date) => date.toISOString().slice(0, 10);
export function scheduleRange(anchor: string, period: SchedulePeriod) {
  const date = new Date(`${anchor}T00:00:00Z`),
    year = date.getUTCFullYear(),
    month = date.getUTCMonth();
  if (period === "week") return { ...weekRange(anchor), days: 7 };
  const firstMonth = period === "year" ? 0 : period === "quarter" ? Math.floor(month / 3) * 3 : month;
  const length = period === "year" ? 12 : period === "quarter" ? 3 : 1;
  const start = iso(new Date(Date.UTC(year, firstMonth, 1)));
  const end = iso(new Date(Date.UTC(year, firstMonth + length, 0)));
  return { start, end, days: dayNumber(end) - dayNumber(start) + 1 };
}
export function moveSchedulePeriod(anchor: string, period: SchedulePeriod, direction: number) {
  const { start } = scheduleRange(anchor, period);
  if (period === "week") return addDays(start, direction * 7);
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction * (period === "year" ? 12 : period === "quarter" ? 3 : 1));
  return iso(date);
}
