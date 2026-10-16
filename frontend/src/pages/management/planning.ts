export type Staff = { id: number; name: string; position: string; is_active: boolean; version: number };
export const TEAM_ROLES = [
  ["coordinator", "项目统筹"], ["design_manager", "设计经理"], ["deputy_manager", "设计副经理"],
  ["business_manager", "商务经理"], ["onsite", "驻场设计"], ["participants", "参与人员"],
] as const;
export type TeamKey = typeof TEAM_ROLES[number][0];
export type Stage = { id: string; name: string; start: string; end: string; assignees: number[]; progress: number; allocation: number; milestone: boolean; notes: string };
export type PlanningProject = {
  id?: number; year?: number; unit?: string; updated_at?: string; updated_by?: number;
  name: string; sequence: number; team: Record<TeamKey, number[]>; next_week_work: string; next_week_staff: number[];
  stage_work: string; deadline: string | null; grade: string; urgency: string;
  investment: string | null; design_fee: string | null; contract: string; paid: string | null; invoiced_pending: string | null;
  mode: string; source: string; project_type: string; phase: string; notes: string; stages: Stage[]; archived: boolean; version: number;
};
export type Report = { unit: string; year: number; compiler: string; data_as_of: string | null; version: number; updated_at: string | null };
export function newProject(sequence: number): PlanningProject {
  return { name: "", sequence, team: { coordinator: [], design_manager: [], deputy_manager: [], business_manager: [], onsite: [], participants: [] },
    next_week_work: "", next_week_staff: [], stage_work: "", deadline: null, grade: "", urgency: "常规", investment: null, design_fee: null,
    contract: "", paid: null, invoiced_pending: null, mode: "", source: "", project_type: "", phase: "", notes: "", stages: [], archived: false, version: 0 };
}
export function projectPayload(project: PlanningProject) {
  const { id, year, unit, updated_at, updated_by, ...payload } = project;
  return payload;
}
const DAY = 86400000;
export function dayNumber(value: string) { return Math.floor(Date.parse(`${value}T00:00:00Z`) / DAY); }
export function addDays(value: string, amount: number) { return new Date((dayNumber(value) + amount) * DAY).toISOString().slice(0, 10); }
export function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
export type GanttEntry = { project: PlanningProject; stage: Stage; left: number; width: number };
export function ganttEntries(projects: PlanningProject[], start: string, days: number): GanttEntry[] {
  const first = dayNumber(start), last = first + days - 1;
  return projects.flatMap(project => project.stages.filter(s => dayNumber(s.end) >= first && dayNumber(s.start) <= last).map(stage => ({
    project, stage, left: Math.max(0, dayNumber(stage.start) - first),
    width: Math.min(last, dayNumber(stage.end)) - Math.max(first, dayNumber(stage.start)) + 1,
  })));
}
export function overloadedDays(entries: GanttEntry[], staffId: number, days: number) {
  const load = Array<number>(days).fill(0);
  entries.filter(e => e.stage.assignees.includes(staffId)).forEach(e => {
    for (let i = e.left; i < e.left + e.width; i++) load[i] += e.stage.allocation;
  });
  return load.map((v, i) => v > 100 ? i : -1).filter(i => i >= 0);
}
export const LEDGER_COLUMNS = [
  ["sequence", "序号"], ["name", "项目名称"], ...TEAM_ROLES,
  ["next_week_work", "下周主要工作内容"], ["next_week_staff", "下周主要使用人员"], ["stage_work", "阶段工作"],
  ["deadline", "完成时间节点"], ["grade", "项目等级"], ["urgency", "紧急程度"], ["investment", "工程投资（万）"],
  ["design_fee", "设计费用（万）"], ["contract", "合同签订"], ["paid", "设计回款（万）"],
  ["invoiced_pending", "请款中（已开发票，万）"], ["mode", "项目模式"], ["source", "项目来源"],
  ["project_type", "项目类型"], ["phase", "项目阶段"], ["notes", "备注"],
] as const;
export function cell(project: PlanningProject, key: string, staff: Staff[]) {
  const names = (ids: number[]) => ids.map(id => staff.find(s => s.id === id)?.name ?? `人员 #${id}`).join("、");
  if (key in project.team) return names(project.team[key as TeamKey]);
  if (key === "next_week_staff") return names(project.next_week_staff);
  return String(project[key as keyof PlanningProject] ?? "");
}
export function ledgerCsv(projects: PlanningProject[], staff: Staff[]) {
  const safe = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`;
  return "\ufeff" + [LEDGER_COLUMNS.map(c => safe(c[1])).join(","), ...projects.map(p => LEDGER_COLUMNS.map(c => safe(cell(p, c[0], staff))).join(","))].join("\r\n");
}
