export function buildBusinessDateWindow(
  days: number,
  now: Date = new Date(),
): { startDate: string; endDate: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((item) => item.type === type)!.value);
  const endDate = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  const startDate = new Date(endDate);
  startDate.setUTCDate(endDate.getUTCDate() - (days - 1));
  const format = (date: Date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return { startDate: format(startDate), endDate: format(endDate) };
}
