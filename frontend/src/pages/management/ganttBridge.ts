import type { GanttStatic } from "dhtmlx-gantt";
import { addDays, dateInput, ganttData, type PlanningProject, type Staff } from "./planning";
export type ChartCallbacks = {
  canDrag: () => boolean;
  onEdit: (projectId: number) => void;
  onStage?: (projectId: number, stageId?: string) => void;
  onQuick?: (projectId: number, stageId: string, x: number, y: number) => void;
  onDelivery?: (projectId: number, date: string, x: number, y: number) => void;
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
    grid_width: 760,
    min_column_width: 34,
    drag_links: false,
    drag_progress: false,
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
      { name: "people", label: "参与人员", width: 140, template: (task: any) => task.people || "未安排" },
      { name: "dates", label: "起止日期（含结束日）", width: 170, template: (task: any) => task.dates || "待排期" },
      { name: "actions", label: "操作", width: 130, template: (task: any) => task.stageId
        ? '<button type="button" class="mp-gantt-action">详细编辑</button>'
        : '<button type="button" class="mp-gantt-action">＋ 工作</button> <button type="button" class="mp-gantt-delivery">◆ 节点</button>' },
      {
        name: "progress",
        label: "进度",
        width: 65,
        template: (task: any) => (task.unscheduled ? "待排期" : `${Math.round(task.progress * 100)}%`),
      },
    ],
  });
  gantt.templates.task_text = (_start, _end, task) => task.text;
  gantt.templates.rightside_text = (_start, _end, task) => task.type === "milestone"
    ? `${task.text}${task.deliverable ? ` · ${task.deliverable}` : ""}` : `${task.paused ? "⚠ 工作暂停 · " : ""}${task.people || ""}`;
  const insertAtPointer = (e: Event) => {
    const row = (e.target as HTMLElement | null)?.closest(".gantt_task_row");
    if (!row || !callbacks.canDrag()) return false;
    const id = row.getAttribute(gantt.config.task_attribute), data = host.querySelector(".gantt_data_area");
    if (!id || !gantt.isTaskExists(id) || !data) return false;
    const mouse = e as MouseEvent, date = gantt.dateFromPos(mouse.clientX - data.getBoundingClientRect().left);
    if (!date) return false;
    callbacks.onDelivery?.(gantt.getTask(id).projectId, dateInput(date), mouse.clientX, mouse.clientY);
    return true;
  };
  gantt.attachEvent("onTaskClick", (id, e) => {
    if (e && insertAtPointer(e)) return false;
    const action = (e?.target as HTMLElement | undefined)?.closest(".mp-gantt-action");
    const task = gantt.getTask(id);
    const delivery = (e?.target as HTMLElement | undefined)?.closest(".mp-gantt-delivery");
    const mouse = e as MouseEvent;
    if (delivery) { callbacks.onDelivery?.(task.projectId, dateInput(task.start_date || new Date()), mouse.clientX, mouse.clientY); return false; }
    if (action) { callbacks.onStage?.(task.projectId, task.stageId); return false; }
    if (task.stageId) callbacks.onQuick?.(task.projectId, task.stageId, mouse.clientX, mouse.clientY);
    return true;
  });
  gantt.attachEvent("onEmptyClick", insertAtPointer);
  gantt.templates.task_class = (_start, _end, task) =>
    task.paused ? "mp-chart-paused" : task.unscheduled
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
    const task = gantt.getTask(id);
    if (task.stageId) callbacks.onStage?.(task.projectId, task.stageId);
    else callbacks.onEdit(task.projectId);
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
  gantt.config.min_column_width = days <= 30 ? 20 : 34;
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
