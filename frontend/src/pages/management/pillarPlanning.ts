import { addDays, dayNumber, isPaused, scheduledWeek, type PlanningProject, type Stage } from "./planning";
export type Reassignment = {
  source_project_id: number;
  source_stage_id: string;
  source_version: number;
  target_project_id: number;
  target_version: number;
  person_id: number;
  start: string;
  end: string;
  work: string;
};
/** Inclusive UI dates; stored pause.until is the first day back at work. */
export function adjustWorkPause(stage: Stage, person: number, from: string, to: string, resume = false): Stage {
  if (stage.milestone || !stage.assignees.includes(person)) throw Error("请选择这项工作的参与人员");
  if (!from || !to || !Number.isFinite(dayNumber(from)) || !Number.isFinite(dayNumber(to)) || from > to || from < stage.start || to > stage.end)
    throw Error("请选择工作起止日期内的有效时段");
  const until = addDays(to, 1), pauses = stage.pauses || [];
  const overlaps = (p: NonNullable<Stage["pauses"]>[number]) => p.start < until && (!p.until || p.until > from) && (!p.people.length || p.people.includes(person));
  if (!resume && pauses.some(overlaps)) throw Error("所选人员在该时段已有暂停，请先恢复或选择其他日期");
  if (resume && !pauses.some(overlaps)) throw Error("所选人员在该时段没有暂停");
  const next = resume ? pauses.flatMap(p => {
    if (!overlaps(p)) return [p];
    const pieces: typeof pauses = [];
    const others = (p.people.length ? p.people : stage.assignees).filter(id => id !== person);
    if (others.length) pieces.push({ ...p, people: others });
    if (p.start < from) pieces.push({ ...p, id: crypto.randomUUID(), until: from, people: [person] });
    if (p.until === null || p.until > until) pieces.push({ ...p, id: crypto.randomUUID(), start: until, people: [person] });
    return pieces;
  }) : [...pauses, { id: crypto.randomUUID(), start: from, until, people: [person], reason: "临时中断" }];
  if (next.length > 100) throw Error("暂停记录已达上限，请缩小恢复时段或先整理记录");
  return { ...stage, pauses: next };
}
export const unattended = (stage: Stage, date: string) =>
  !stage.milestone && stage.assignees.length > 0 && stage.assignees.every((id) => isPaused(stage, id, date));
export function pauseSlices(stage: Stage, person: number, start: string, days: number) {
  const slices: { left: number; width: number; unattended: boolean }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    if (!isPaused(stage, person, date)) continue;
    const empty = unattended(stage, date),
      last = slices.at(-1);
    if (last && last.left + last.width === i && last.unattended === empty) last.width++;
    else slices.push({ left: i, width: 1, unattended: empty });
  }
  return slices;
}
export function pauseWarnings(projects: PlanningProject[]) {
  return projects.flatMap((project) =>
    project.stages
      .filter((s) => !s.milestone && s.assignees.length && s.pauses?.length)
      .flatMap((stage) => {
        const end = addDays(stage.end, 1),
          boundaries = [stage.start, end, ...(stage.pauses || []).flatMap((p) => [p.start, p.until || end])].filter(
            (x) => x >= stage.start && x <= end,
          );
        const dates = [...new Set(boundaries)].sort(),
          ranges: { start: string; end: string }[] = [];
        for (let i = 0; i < dates.length - 1; i++) {
          if (!unattended(stage, dates[i])) continue;
          const last = ranges.at(-1),
            to = addDays(dates[i + 1], -1);
          if (last && addDays(last.end, 1) === dates[i]) last.end = to;
          else ranges.push({ start: dates[i], end: to });
        }
        return ranges.map((range) => ({ project, stage, ...range }));
      }),
  );
}
export function summarizeWeek(project: PlanningProject, week: string, kind: "previous" | "following") {
  if (kind === "previous")
    return project.stages
      .flatMap((s) =>
        (s.updates || [])
          .filter((u) => u.date >= addDays(week, -7) && u.date < week)
          .map((u) => `${u.date} · ${s.name}：${u.note}`),
      )
      .join("\n");
  return scheduledWeek(project, addDays(week, 7), 7)
    .stages.map((s) => `${s.start}—${s.end} · ${s.name}${s.deliverable ? ` · 交付：${s.deliverable}` : ""}`)
    .join("\n");
}
export function dayAtPointer(top: number, y: number, rowHeight: number, start: string, days: number) {
  return addDays(start, Math.min(days - 1, Math.max(0, Math.floor((y - top) / rowHeight))));
}
