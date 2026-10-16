import type { GanttStatic } from "dhtmlx-gantt";
import { addDays, dateInput, ganttData, type PlanningProject, type Staff } from "./planning";
export type ChartCallbacks = {
  canDrag: () => boolean;
  onEdit: (projectId: number) => void;
  onChange: (projectId: number, stageId: string, task: { start_date: Date; end_date: Date; progress: number }) => void;
};
export function initializePlanningGantt(gantt: GanttStatic, host: HTMLElement, callbacks: ChartCallbacks) {
  gantt.i18n.setLocale("cn");
  Object.assign(gantt.config, {
    date_format: "%Y-%m-%d %H:%i",
    work_time: false,
    duration_unit: "day",
    duration_step: 1,
    row_height: 46,
    bar_height: 26,
    scale_height: 60,
    grid_width: 440,
    min_column_width: 34,
    drag_links: false,
    drag_progress: true,
    drag_move: true,
    drag_resize: true,
    show_links: false,
    show_errors: false,
    details_on_dblclick: false,
    details_on_create: false,
    keyboard_navigation: true,
    fit_tasks: false,
    columns: [
      { name: "text", label: "项目 / 设计阶段", tree: true, width: 245, resize: true },
      { name: "people", label: "负责人", width: 100, template: (task: any) => task.people || "—" },
      {
        name: "progress",
        label: "进度",
        width: 65,
        template: (task: any) => (task.unscheduled ? "待排期" : `${Math.round(task.progress * 100)}%`),
      },
    ],
  });
  gantt.templates.task_text = (_start, _end, task) => task.text;
  gantt.templates.task_class = (_start, _end, task) =>
    task.unscheduled
      ? "mp-chart-unscheduled"
      : task.type === "project"
        ? "mp-chart-project"
        : task.progress === 1
          ? "mp-chart-done"
          : "mp-chart-stage";
  gantt.templates.grid_date_format = (date) => dateInput(date);
  gantt.attachEvent("onBeforeTaskDrag", (id) => {
    const task = gantt.getTask(id);
    return Boolean(task.stageId && !task.readonly && callbacks.canDrag());
  });
  gantt.attachEvent("onAfterTaskDrag", (id) => {
    const task = gantt.getTask(id);
    if (task.stageId && task.start_date && task.end_date)
      callbacks.onChange(task.projectId, task.stageId, {
        start_date: task.start_date,
        end_date: task.end_date,
        progress: task.progress ?? 0,
      });
  });
  gantt.attachEvent("onTaskDblClick", (id) => {
    callbacks.onEdit(gantt.getTask(id).projectId);
    return false;
  });
  gantt.init(host);
}
export function renderPlanningGantt(
  gantt: GanttStatic,
  projects: PlanningProject[],
  staff: Staff[],
  start: string,
  days: number,
  readonly: boolean,
) {
  const scroll = gantt.getScrollState();
  const opened = new Map<string, boolean>();
  gantt.eachTask((task) => {
    if (task.type === "project") opened.set(String(task.id), task.$open);
  });
  gantt.config.readonly = readonly;
  gantt.config.start_date = new Date(`${start}T00:00:00`);
  gantt.config.end_date = new Date(`${addDays(start, days)}T00:00:00`);
  gantt.config.scales =
    days <= 30
      ? [
          { unit: "month", step: 1, format: "%Y 年 %F" },
          { unit: "day", step: 1, format: "%d %D" },
        ]
      : [
          { unit: "month", step: 1, format: "%Y 年 %F" },
          { unit: "week", step: 1, format: "第 %W 周" },
        ];
  const data = ganttData(projects, staff, start).map((task) => ({
    ...task,
    open: opened.get(String(task.id)) ?? true,
  }));
  gantt.batchUpdate(() => {
    gantt.clearAll();
    gantt.parse({ data, links: [] });
  });
  gantt.scrollTo(scroll.x, scroll.y);
}
