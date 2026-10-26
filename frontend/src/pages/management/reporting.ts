import { addDays, scheduledWeek, TEAM_ROLES, type PlanningProject, type Staff, type Report } from "./planning";

export type ReportingData = { unit: string; year: number; projects: PlanningProject[]; staff: Staff[]; report: Report };
export type SnapshotMeta = { id: number; unit: string; year: number; week_start: string; week_days: 5 | 7; created_at: string };
export type SnapshotDocument = ReportingData & { week_start: string; week_days: 5 | 7; calculation_version: number };
export const MONEY_FIELDS = [["investment", "工程投资"], ["design_fee", "设计费用"], ["paid", "设计回款"], ["invoiced_pending", "已开票请款中"]] as const;
export type MoneyKey = typeof MONEY_FIELDS[number][0];
export function cents(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}
export function decimal(value: bigint) { return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`; }
export function percent(numerator: bigint, denominator: bigint) {
  if (denominator === 0n) return null;
  const tenths = (numerator * 1000n + denominator / 2n) / denominator;
  return `${tenths / 10n}.${tenths % 10n}%`;
}
export function financialSummary(projects: PlanningProject[]) {
  const valid = projects.filter(p => !p.deleted);
  const totals = Object.fromEntries(MONEY_FIELDS.map(([key]) => {
    const known = valid.filter(p => p[key] != null && p[key] !== "");
    return [key, { amount: decimal(known.reduce((sum, p) => sum + cents(p[key]!), 0n)), known: known.length, missing: valid.length - known.length }];
  })) as Record<MoneyKey, { amount: string; known: number; missing: number }>;
  // Only matched fee/receipt pairs form the rate. Missing values never become zero.
  const paired = valid.filter(p => p.design_fee != null && p.design_fee !== "" && p.paid != null && p.paid !== "");
  const fee = paired.reduce((s, p) => s + cents(p.design_fee!), 0n), paid = paired.reduce((s, p) => s + cents(p.paid!), 0n);
  const signed = valid.filter(p => p.contract_status === "signed").length;
  const unsigned = valid.filter(p => p.contract_status === "unsigned").length;
  return { totals, total: valid.length, archived: valid.filter(p => p.archived).length, signed, unsigned,
    contractUnknown: valid.length - signed - unsigned,
    signingRate: percent(BigInt(signed), BigInt(signed + unsigned)),
    collectionRate: percent(paid, fee), collectionKnown: paired.length, collectionMissing: valid.length - paired.length };
}
export const CLASSIFICATIONS = [["grade", "项目等级"], ["source", "项目来源"], ["project_type", "项目类型"], ["phase", "项目阶段"], ["mode", "项目模式"], ["urgency", "紧急程度"]] as const;
export type Classification = typeof CLASSIFICATIONS[number][0];
export function normalizedGrade(value: string) {
  const text = (value || "").trim().toUpperCase().replace(/\s/g, "");
  const match = /^([ABCD])(?:级(?:项目)?)?$/.exec(text);
  return match ? `${match[1]}级` : text || "待填写";
}
export function classifiedSummary(projects: PlanningProject[], key: Classification) {
  const groups = new Map<string, PlanningProject[]>();
  for (const p of projects.filter(p => !p.deleted)) {
    const label = key === "grade" ? normalizedGrade(p.grade) : p[key].trim() || "待填写";
    groups.set(label, [...(groups.get(label) || []), p]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, "zh-CN")).map(([label, rows]) => ({ label, ...financialSummary(rows) }));
}
export function weeklyWorkload(data: ReportingData, start: string, days: number) {
  const projects = data.projects.filter(p => !p.archived && !p.deleted);
  const rows = data.staff.map(person => {
    const roles = Object.fromEntries(TEAM_ROLES.map(([key]) => [key, projects.filter(p => p.team[key].includes(person.id)).length])) as Record<typeof TEAM_ROLES[number][0], number>;
    const participating = projects.filter(p => scheduledWeek(p, start, days).people.includes(person.id));
    const cooperation = participating.filter(p => p.collaboration_unit && p.collaboration_unit !== data.unit);
    const own = participating.filter(p => !cooperation.includes(p));
    const grades = ["A级", "B级", "C级", "D级"].map(grade => own.filter(p => normalizedGrade(p.grade) === grade).length);
    const unclassified = own.length - grades.reduce((a, b) => a + b, 0);
    // Management roles are separate work items; generic team participation is informational only.
    const total = TEAM_ROLES.slice(0, 5).reduce((n, [key]) => n + roles[key], 0) + participating.length;
    return { person, roles, grades, unclassified, cooperation: cooperation.length, projectCount: participating.length,
      projects: participating.map(p => p.name), total, rank: null as number | null };
  }).filter(row => row.person.is_active || row.total > 0);
  // Internal/external/unverified rankings are independent. Ties use competition ranking.
  for (const row of rows) if (row.total > 0) row.rank = 1 + rows.filter(other => (other.person.employment_type || "unknown") === (row.person.employment_type || "unknown") && other.total > row.total).length;
  rows.sort((a, b) => b.total - a.total || a.person.id - b.person.id);
  return { rows, end: addDays(start, days - 1), unscheduled: projects.filter(p => !p.stages.length).length,
    manual: projects.filter(p => p.weekly_plan_mode !== "schedule" && (p.next_week_work || p.next_week_staff.length)).length };
}
