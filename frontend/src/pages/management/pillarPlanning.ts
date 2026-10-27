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
