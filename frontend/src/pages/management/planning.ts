export type Staff = { id: number; name: string; position: string; is_active: boolean; version: number; employment_type?: "internal" | "external" | "unknown"; employer?: string };
export function staffAffiliation(staff: Staff) {
  if (staff.employment_type === "internal") return staff.employer || "QMDH 内部";
  if (staff.employment_type === "external") return `外包${staff.employer ? ` · ${staff.employer}` : ""}`;
  return "归属待确认";
}
export function staffCounts(staff: Staff[]) {
  const active = staff.filter(s => s.is_active);
  return { active: active.length, internal: active.filter(s => s.employment_type === "internal").length,
    external: active.filter(s => s.employment_type === "external").length,
    unknown: active.filter(s => !s.employment_type || s.employment_type === "unknown").length };
}
export const TEAM_ROLES = [
  ["coordinator", "项目统筹"],
  ["design_manager", "设计经理"],
  ["deputy_manager", "设计副经理"],
  ["business_manager", "商务经理"],
  ["onsite", "驻场设计"],
  ["participants", "参与人员"],
] as const;
export type TeamKey = (typeof TEAM_ROLES)[number][0];
export type Stage = {
  id: string;
  name: string;
  start: string;
  end: string;
  assignees: number[];
  progress: number;
  allocation: number;
  milestone: boolean;
  notes: string;
  deliverable?: string;
  pauses?: { id: string; start: string; until: string | null; people: number[]; reason: string }[];
  updates?: { id: string; date: string; note: string }[];
};
export type PlanningProject = {
  id?: number;
  year?: number;
  unit?: string;
  updated_at?: string;
  updated_by?: number;
  name: string;
  color?: string | null;
  sequence: number;
  team: Record<TeamKey, number[]>;
  next_week_work: string;
  next_week_staff: number[];
  stage_work: string;
  deadline: string | null;
  grade: string;
  urgency: string;
  investment: string | null;
  design_fee: string | null;
  contract: string;
  contract_status?: "signed" | "unsigned" | "unknown";
  weekly_plan_mode?: "manual" | "schedule";
  collaboration_unit?: string;
  paid: string | null;
  invoiced_pending: string | null;
  mode: string;
  source: string;
  project_type: string;
  phase: string;
  notes: string;
  weekly_briefs?: { week_start: string; previous: string; following: string }[];
  stages: Stage[];
  archived: boolean;
  deleted?: boolean;
  version: number;
};
export type Report = {
  unit: string;
  year: number;
  compiler: string;
  data_as_of: string | null;
  version: number;
  updated_at: string | null;
};
export function newProject(sequence: number): PlanningProject {
  return {
    name: "",
    color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
    sequence,
    team: {
      coordinator: [],
      design_manager: [],
      deputy_manager: [],
      business_manager: [],
      onsite: [],
      participants: [],
    },
    next_week_work: "",
    next_week_staff: [],
    stage_work: "",
    deadline: null,
    grade: "",
    urgency: "常规",
    investment: null,
    design_fee: null,
    contract: "",
    contract_status: "unknown",
    weekly_plan_mode: "schedule",
    collaboration_unit: "",
    paid: null,
    invoiced_pending: null,
    mode: "",
    source: "",
    project_type: "",
    phase: "",
    notes: "",
    stages: [],
    archived: false,
    version: 0,
  };
}
export function projectPayload(project: PlanningProject) {
  const { id, year, unit, updated_at, updated_by, deleted, ...payload } = project;
  return payload;
}
const DAY = 86400000;
export function dayNumber(value: string) {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / DAY);
}
export function addDays(value: string, amount: number) {
  return new Date((dayNumber(value) + amount) * DAY).toISOString().slice(0, 10);
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const PROJECT_COLORS = ["#386bcc", "#16806b", "#9b5ab4", "#b16e22", "#b74f6e", "#527785"];
export const projectTint = (p: PlanningProject) => p.color || PROJECT_COLORS[Math.abs(p.id || 0) % PROJECT_COLORS.length];
export const isPaused = (stage: Stage, person: number, date: string) => (stage.pauses || []).some(p => p.start <= date && (!p.until || p.until > date) && (!p.people.length || p.people.includes(person)));
export function stageParticipants(stage: Stage, start: string, days: number) {
  return stage.assignees.filter(id => Array.from({ length: days }, (_, i) => addDays(start, i)).some(date => date >= stage.start && date <= stage.end && !isPaused(stage, id, date)));
}
export type GanttEntry = { project: PlanningProject; stage: Stage; left: number; width: number; windowStart?: string };
export function ganttEntries(projects: PlanningProject[], start: string, days: number): GanttEntry[] {
  const first = dayNumber(start),
    last = first + days - 1;
  return projects.flatMap((project) =>
    project.stages
      .filter((s) => dayNumber(s.end) >= first && dayNumber(s.start) <= last)
      .map((stage) => ({
        project,
        stage,
        windowStart: start,
        left: Math.max(0, dayNumber(stage.start) - first),
        width: Math.min(last, dayNumber(stage.end)) - Math.max(first, dayNumber(stage.start)) + 1,
      })),
  );
}
export function overloadedDays(entries: GanttEntry[], staffId: number, days: number) {
  const load = staffLoads(entries, staffId, days);
  return load.map((v, i) => (v > 100 ? i : -1)).filter((i) => i >= 0);
}
export const LEDGER_COLUMNS = [
  ["sequence", "序号"],
  ["name", "项目名称"],
  ...TEAM_ROLES,
  ["next_week_work", "下周主要工作内容"],
  ["next_week_staff", "下周主要使用人员"],
  ["stage_work", "阶段工作"],
  ["deadline", "完成时间节点"],
  ["grade", "项目等级"],
  ["urgency", "紧急程度"],
  ["investment", "工程投资（万）"],
  ["design_fee", "设计费用（万）"],
  ["contract", "合同签订"],
  ["contract_status", "签约状态"],
  ["paid", "设计回款（万）"],
  ["invoiced_pending", "请款中（已开发票，万）"],
  ["mode", "项目模式"],
  ["source", "项目来源"],
  ["project_type", "项目类型"],
  ["phase", "项目阶段"],
  ["collaboration_unit", "配合分院"],
  ["notes", "备注"],
  ["archived", "归档状态"],
] as const;
export function cell(project: PlanningProject, key: string, staff: Staff[], referenceDate = today()) {
  const names = (ids: number[]) => ids.map((id) => staff.find((s) => s.id === id)?.name ?? `人员 #${id}`).join("、");
  if (key in project.team) return names(project.team[key as TeamKey]);
  if (key === "archived") return project.archived ? "已归档" : "在管";
  if (key === "contract_status") return ({ signed: "已签订", unsigned: "未签订", unknown: "待确认" })[project.contract_status || "unknown"];
  if (project.weekly_plan_mode === "schedule" && (key === "next_week_work" || key === "next_week_staff")) {
    const plan = scheduledWeek(project, weekRange(addDays(referenceDate, 7)).start, 5);
    return key === "next_week_staff" ? names(plan.people) : plan.work;
  }
  if (key === "next_week_staff") return names(project.next_week_staff);
  return String(project[key as keyof PlanningProject] ?? "");
}
export function scheduledWeek(project: PlanningProject, start: string, days: number) {
  const end = addDays(start, days - 1);
  const stages = project.stages.filter(s => s.start <= end && s.end >= start);
  return { stages, people: [...new Set(stages.flatMap(s => stageParticipants(s, start, days)))],
    work: stages.map(s => `${s.name}（${s.start}—${s.end}）`).join("；") };
}
export function ledgerCsv(projects: PlanningProject[], staff: Staff[]) {
  const safe = (value: string) =>
    `"${(/^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`;
  return (
    "\ufeff" +
    [
      LEDGER_COLUMNS.map((c) => safe(c[1])).join(","),
      ...projects.map((p) => LEDGER_COLUMNS.map((c) => safe(cell(p, c[0], staff))).join(",")),
    ].join("\r\n")
  );
}

export function weekRange(value: string) {
  const weekday = new Date(`${value}T00:00:00Z`).getUTCDay();
  const start = addDays(value, -(weekday === 0 ? 6 : weekday - 1));
  return { start, end: addDays(start, 6) };
}
export function projectProgress(project: PlanningProject) {
  return project.stages.length
    ? Math.round(project.stages.reduce((sum, s) => sum + s.progress, 0) / project.stages.length)
    : 0;
}
export function staffLoads(entries: GanttEntry[], staffId: number, days: number) {
  const load = Array<number>(days).fill(0);
  for (const e of entries.filter((e) => e.stage.assignees.includes(staffId))) {
    if (e.stage.milestone) continue;
    for (let i = e.left; i < e.left + e.width; i++) if (!isPaused(e.stage, staffId, addDays(e.windowStart || e.stage.start, i))) load[i] += e.stage.allocation;
  }
  return load;
}
export function planningOverview(projects: PlanningProject[], staff: Staff[], current: string) {
  const active = projects.filter((p) => !p.archived),
    week = weekRange(current);
  const stages = active.flatMap((project) => project.stages.map((stage) => ({ project, stage })));
  const overdue = stages
    .filter((e) => e.stage.end < current && e.stage.progress < 100)
    .sort((a, b) => a.stage.end.localeCompare(b.stage.end));
  const due = stages
    .filter((e) => e.stage.end >= week.start && e.stage.end <= week.end && e.stage.progress < 100)
    .sort((a, b) => a.stage.end.localeCompare(b.stage.end));
  const entries = ganttEntries(active, week.start, 7);
  const loads = staff
    .map((person) => {
      const values = staffLoads(entries, person.id, 7);
      return { person, values, peak: Math.max(0, ...values), daysOver: values.filter((v) => v > 100).length };
    })
    .sort((a, b) => b.daysOver - a.daysOver || b.peak - a.peak || a.person.id - b.person.id);
  // Money remains exact decimal text, including totals exceeding JS integer cents.
  let cents = BigInt(0),
    known = 0;
  for (const p of active)
    if (p.invoiced_pending !== null) {
      const [whole, fraction = ""] = p.invoiced_pending.split(".");
      cents += BigInt(whole) * BigInt(100) + BigInt((fraction + "00").slice(0, 2));
      known++;
    }
  const invoiced = `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
  return { active, week, overdue, due, loads, invoiced, known, unscheduled: active.filter((p) => !p.stages.length) };
}
export type ProjectStatusFilter = "all" | "overdue" | "this-week" | "unscheduled";
export function matchesStatus(project: PlanningProject, status: ProjectStatusFilter, current: string) {
  if (status === "overdue")
    return (
      project.stages.some((s) => s.progress < 100 && s.end < current) ||
      Boolean(
        project.deadline && project.deadline < current && (!project.stages.length || projectProgress(project) < 100),
      )
    );
  if (status === "unscheduled") return project.stages.length === 0;
  if (status === "this-week") {
    const week = weekRange(current);
    return project.stages.some((s) => s.end >= week.start && s.end <= week.end && s.progress < 100);
  }
  return true;
}
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
export function dateInput(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function stageFromGantt(stage: Stage, task: { start_date: Date; end_date: Date; progress: number }): Stage {
  const start = dateInput(task.start_date);
  return {
    ...stage,
    start,
    end: stage.milestone ? start : addDays(dateInput(task.end_date), -1),
    progress: Math.round(Math.min(1, Math.max(0, task.progress)) * 100),
  };
}
export function ganttData(projects: PlanningProject[], staff: Staff[], start: string) {
  return projects.flatMap((project) => {
    const dates = project.stages.flatMap((s) => [s.start, s.end]).sort();
    const parent = {
      id: `p:${project.id}`,
      text: escapeHtml(project.name),
      type: "project",
      open: true,
      readonly: true,
      start_date: `${dates[0] || start} 00:00`,
      end_date: `${addDays(dates[dates.length - 1] || start, 1)} 00:00`,
      progress: projectProgress(project) / 100,
      projectId: project.id,
      people: `${new Set(project.stages.flatMap(s => s.assignees)).size} 人`,
      color: projectTint(project),
      dates: dates.length ? `${dates[0]} — ${dates[dates.length - 1]}` : "待排期",
      unscheduled: !project.stages.length,
    };
    return [
      parent,
      ...project.stages.map((stage) => ({
        id: `s:${project.id}:${stage.id}`,
        parent: parent.id,
        projectId: project.id,
        stageId: stage.id,
        text: escapeHtml(stage.name),
        color: projectTint(project),
        paused: !stage.milestone && stage.assignees.length > 0 && stage.assignees.every(id => isPaused(stage, id, today())),
        deliverable: escapeHtml(stage.deliverable || ""),
        type: stage.milestone ? "milestone" : "task",
        open: true,
        readonly: project.archived,
        start_date: `${stage.start} 00:00`,
        end_date: `${addDays(stage.end, 1)} 00:00`,
        progress: stage.progress / 100,
        people: stage.assignees.map((id) => escapeHtml(staff.find((p) => p.id === id)?.name || `#${id}`)).join("、"),
        dates: `${stage.start} — ${stage.end}`,
        unscheduled: false,
      })),
    ];
  });
}

export async function savePlanQueue(
  projects: PlanningProject[],
  persist: (project: PlanningProject) => Promise<PlanningProject>,
  acknowledged: (id: number) => void,
): Promise<unknown | null> {
  for (const project of projects) {
    try {
      await persist(project);
      acknowledged(project.id!);
    } catch (error) {
      return error;
    }
  }
  return null;
}
