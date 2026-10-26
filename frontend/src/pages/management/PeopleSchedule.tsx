import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
  ganttEntries,
  staffLoads,
  addDays,
  staffAffiliation,
  projectTint,
  isPaused,
  today,
  type PlanningProject,
  type Staff,
  type Stage,
} from "./planning";
import type { SchedulePeriod } from "./scheduleCalendar";

export default function PeopleSchedule({
  projects,
  staff,
  start,
  days,
  period,
  workloadProjects = projects,
  disabled = false,
  onSelect,
  onAdd,
  onStageDrag,
  onDragEnd,
  onDateDragOver,
  onDateDrop,
}: {
  projects: PlanningProject[];
  staff: Staff[];
  start: string;
  days: number;
  period: SchedulePeriod;
  workloadProjects?: PlanningProject[];
  disabled?: boolean;
  onSelect: (p: PlanningProject, s: Stage) => void;
  onAdd: (person: number, date: string) => void;
  onStageDrag: (e: DragEvent, p: PlanningProject, s: Stage, person: number, anchor: string) => void;
  onDragEnd: () => void;
  onDateDragOver: (e: DragEvent) => void;
  onDateDrop: (e: DragEvent, person: number, date: string) => void;
}) {
  const entries = useMemo(() => ganttEntries(projects, start, days), [projects, start, days]);
  const workload = useMemo(() => ganttEntries(workloadProjects, start, days), [workloadProjects, start, days]);
  const people = useMemo(
    () =>
      staff
        .filter((p) => p.is_active || workload.some((e) => e.stage.assignees.includes(p.id)))
        .map((person) => ({
          person,
          loads: staffLoads(workload, person.id, days),
          items: entries.filter((e) => e.stage.assignees.includes(person.id)),
        })),
    [staff, workload, entries, days],
  );
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i)),
    current = today();
  const over = people.filter((p) => p.loads.some((v) => v > 100)).length;
  const board = useRef<HTMLDivElement>(null),
    [height, setHeight] = useState(600);
  useLayoutEffect(() => {
    const resize = () => {
      if (board.current) setHeight(Math.max(320, window.innerHeight - board.current.getBoundingClientRect().top - 24));
    };
    resize();
    window.addEventListener("resize", resize);
    const observer = new ResizeObserver(resize),
      host = board.current?.closest(".management-page");
    if (host) observer.observe(host);
    return () => {
      window.removeEventListener("resize", resize);
      observer.disconnect();
    };
  }, [start, period, people.length]);
  return (
    <>
      <div className="mp-calendar-meta">
        <span>
          {start} — {addDays(start, days - 1)} · 每行 1 天 · {people.length} 人
        </span>
        <span>
          <i className="mp-over-dot" />
          {over} 人有超额安排 · 斜纹表示暂停
        </span>
      </div>
      <div
        className={`mp-people-board mp-calendar-board mp-period-${period}`}
        ref={board}
        style={{ height, "--mp-board-height": `${height}px` } as CSSProperties}
        key={`${start}-${period}`}
        tabIndex={0}
        role="region"
        aria-label="人员日期排期表"
      >
        <table className="mp-person-calendar" style={{ minWidth: 96 + people.length * 96 }}>
          <thead>
            <tr>
              <th scope="col" className="mp-calendar-corner">
                日期 / 人员
              </th>
              {people.map(({ person }) => (
                <th
                  scope="col"
                  key={person.id}
                  title={`${person.name} · ${person.position || "项目成员"} · ${staffAffiliation(person)}`}
                >
                  <strong>
                    {person.name}
                    {!person.is_active ? "（停用）" : ""}
                  </strong>
                  <small>
                    {person.employment_type === "external" ? "外包 · " : ""}
                    {person.position || "项目成员"}
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((date, i) => {
              const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
              return (
                <tr
                  key={date}
                  className={`${weekday === 0 || weekday === 6 ? "mp-calendar-weekend " : ""}${date === current ? "mp-calendar-today" : ""}`}
                >
                  <th scope="row">
                    <strong>{date.slice(5).replace("-", "/")}</strong>
                    <small>
                      周{["日", "一", "二", "三", "四", "五", "六"][weekday]}
                      {date === current ? " · 今天" : ""}
                    </small>
                    {date.endsWith("-01") && <small>{date.slice(0, 7)}</small>}
                  </th>
                  {people.map(({ person, loads, items }) => {
                    const work = items.filter((e) => e.left <= i && i < e.left + e.width),
                      load = loads[i];
                    return (
                      <td
                        key={person.id}
                        data-person={person.id}
                        data-date={date}
                        className={load > 100 ? "mp-cell-over" : ""}
                        onDragOver={!disabled && person.is_active ? onDateDragOver : undefined}
                        onDrop={!disabled && person.is_active ? (e) => onDateDrop(e, person.id, date) : undefined}
                      >
                        <div className="mp-calendar-cell">
                          <button
                            className={`mp-cell-add${work.length ? " mp-cell-has-work" : ""}`}
                            aria-label={`${person.name} ${date} 添加工作`}
                            disabled={disabled || !person.is_active || !projects.some((p) => !p.archived)}
                            onClick={() => onAdd(person.id, date)}
                            title={projects.length ? "添加工作，或加入已有工作" : "先新建项目，再添加工作"}
                          >
                            <span>＋</span>
                          </button>
                          <small
                            className={`mp-cell-load${load > 100 ? " mp-danger-text" : ""}`}
                            title={`${person.name} ${date} 全部项目计划负荷 ${load}%`}
                          >
                            {load ? `${load}%` : work.length ? "节点 / 暂停" : ""}
                          </small>
                          <div className="mp-cell-work">
                            {work.map(({ project, stage }) => {
                              const paused = isPaused(stage, person.id, date);
                              return (
                                <button
                                  key={`${project.id}:${stage.id}`}
                                  className={`mp-calendar-work${paused ? " mp-work-paused" : ""}${stage.milestone ? " mp-work-milestone" : ""}`}
                                  style={{ backgroundColor: projectTint(project) }}
                                  disabled={disabled}
                                  draggable={!disabled && !project.archived && person.is_active}
                                  onDragStart={(e) => onStageDrag(e, project, stage, person.id, date)}
                                  onDragEnd={onDragEnd}
                                  onClick={() => onSelect(project, stage)}
                                  aria-label={`${person.name} ${date} ${project.name} · ${stage.name}${paused ? " · 暂停" : ""}`}
                                  title={`${project.name} · ${stage.name}\n${stage.start} — ${stage.end} · 每人 ${stage.allocation}%${stage.deliverable ? `\n交付：${stage.deliverable}` : ""}${paused ? "\n暂停，不计负荷" : ""}\n点击编辑 · 拖到日期格改期或转交；多人工作共享起止日期`}
                                >
                                  <strong>
                                    {stage.milestone ? "◆ " : ""}
                                    {project.name}
                                  </strong>
                                  <span>
                                    {paused ? "暂停 · " : ""}
                                    {stage.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!people.length && <p className="mp-empty">暂无人员，请先维护人员名册。</p>}
      </div>
      <p className="mp-help">
        负荷包含当前年度被筛选隐藏的项目。拖动多人工作会同步调整该工作的日期，转交只替换拖动的这一人。未安排人员的工作{" "}
        {entries.filter((e) => !e.stage.assignees.length).length} 项，可从项目计划补充。
      </p>
    </>
  );
}
