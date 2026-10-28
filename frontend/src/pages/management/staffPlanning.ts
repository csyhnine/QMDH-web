import { addDays, dayNumber, type PlanningProject, type Staff, type Stage, type TeamKey } from "./planning";

export type PeopleChange =
  | { kind: "assign" | "remove"; stageId: string; personId: number }
  | { kind: "role"; role: TeamKey; personId: number; remove?: boolean }
  | { kind: "dates"; stageId: string; start: string; end: string }
  | { kind: "resize"; stageId: string; edge: "start" | "end"; offset: number }
  | { kind: "move"; stageId: string; fromPerson: number; personId: number; offset: number };

function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(dayNumber(value)) &&
    new Date(dayNumber(value) * 86400000).toISOString().slice(0, 10) === value
  );
}

/** Resize one inclusive endpoint; never move the opposite endpoint or the people. */
export function resizeWorkEndpoint(stage: Stage, edge: "start" | "end", offset: number): Stage {
  if (stage.milestone || !Number.isInteger(offset)) throw Error("请选择工作的起止端点调整日期。");
  const date = addDays(stage[edge], offset),
    lower = edge === "start" ? addDays(stage.end, -3660) : stage.start,
    upper = edge === "start" ? stage.end : addDays(stage.start, 3660),
    value = date < lower ? lower : date > upper ? upper : date;
  return { ...stage, [edge]: value };
}

/** Apply only the explicitly selected assignment; preserve versions and other project fields. */
export function changePeoplePlan(project: PlanningProject, staff: Staff[], change: PeopleChange): PlanningProject {
  if (project.archived) throw new Error("归档项目只读，请先恢复项目。");
  if ("personId" in change && change.kind !== "remove" && !(change.kind === "role" && change.remove)) {
    if (!staff.some((p) => p.id === change.personId && p.is_active)) throw new Error("请选择在用人员。");
  }
  if (change.kind === "role") {
    const ids = project.team[change.role];
    if (!ids) throw new Error("项目分工不存在。");
    const next = change.remove ? ids.filter((id) => id !== change.personId) : [...new Set([...ids, change.personId])];
    return { ...project, team: { ...project.team, [change.role]: next } };
  }
  const stage = project.stages.find((s) => s.id === change.stageId);
  if (!stage) throw new Error("阶段已不存在，请保留调整后刷新项目。");
  let next = { ...stage };
  if (change.kind === "resize") next = resizeWorkEndpoint(stage, change.edge, change.offset);
  if (change.kind === "assign") next.assignees = [...new Set([...stage.assignees, change.personId])];
  if (change.kind === "remove") next.assignees = stage.assignees.filter((id) => id !== change.personId);
  if (change.kind === "dates") {
    if (!validDate(change.start) || !validDate(change.end) || change.end < change.start)
      throw new Error("请选择有效日期，结束日期不能早于开始日期。");
    next = { ...next, start: change.start, end: stage.milestone ? change.start : change.end };
  }
  if (change.kind === "move") {
    if (!stage.assignees.includes(change.fromPerson) || !Number.isInteger(change.offset))
      throw new Error("原安排已变化，请重新选择工作条。");
    next = {
      ...next,
      assignees: [...new Set(stage.assignees.map((id) => (id === change.fromPerson ? change.personId : id)))],
      start: addDays(stage.start, change.offset),
      end: addDays(stage.end, change.offset),
    };
  }
  return { ...project, stages: project.stages.map((s) => (s.id === stage.id ? next : s)) };
}

export function projectColor(id: number) {
  return ["#386bcc", "#16806b", "#9b5ab4", "#b16e22", "#b74f6e", "#527785"][Math.abs(id) % 6];
}
