import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
  addDays,
  ganttEntries,
  staffLoads,
  projectTint,
  today,
  type PlanningProject,
  type Staff,
  type Stage,
} from "./planning";
import { dayAtPointer, pauseSlices } from "./pillarPlanning";
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
  onSegment,
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
  onSelect: (p: PlanningProject, s: Stage, person: number, date: string, x: number, y: number) => void;
  onSegment: (p: PlanningProject, s: Stage, person: number, start: string, end: string, x: number, y: number) => void;
  onAdd: (person: number, date: string) => void;
  onStageDrag: (e: DragEvent, p: PlanningProject, s: Stage, person: number, anchor: string) => void;
  onDragEnd: () => void;
  onDateDragOver: (e: DragEvent) => void;
  onDateDrop: (e: DragEvent, person: number, date: string) => void;
}) {
  const entries = useMemo(() => ganttEntries(projects, start, days), [projects, start, days]),
    workload = useMemo(() => ganttEntries(workloadProjects, start, days), [workloadProjects, start, days]);
  const people = staff
    .filter((p) => p.is_active || workload.some((e) => e.stage.assignees.includes(p.id)))
    .map((person) => {
      const lanes: number[] = [],
        items = entries
          .filter((e) => e.stage.assignees.includes(person.id))
          .sort((a, b) => a.left - b.left || b.width - a.width)
          .map((e) => {
            let lane = lanes.findIndex((n) => n <= e.left);
            if (lane < 0) lane = lanes.length;
            lanes[lane] = e.left + e.width;
            return { ...e, lane };
          });
      return {
        person,
        items,
        loads: staffLoads(workload, person.id, days),
        width: Math.max(60, lanes.length * 22 + 14),
      };
    });
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i)),
    current = today(),
    board = useRef<HTMLDivElement>(null),
    body = useRef<HTMLTableSectionElement>(null);
  const [height, setHeight] = useState(600),
    [boardWidth, setBoardWidth] = useState(0),
    [selection, setSelection] = useState<{
      project: number;
      stage: string;
      person: number;
      from: string;
      to: string;
    } | null>(null);
  const pointer = useRef<{
      id: number;
      from: string;
      top: number;
      project: PlanningProject;
      stage: Stage;
      person: number;
    } | null>(null),
    suppress = useRef(false);
  const rowHeight = period === "week" ? Math.max(62, Math.floor((height - 36) / 7)) : period === "month" ? 44 : 34;
  const extra = Math.max(0, boardWidth - 72 - people.reduce((n, p) => n + p.width, 0)) / Math.max(1, people.length);
  const widths = [72, ...people.map((p) => p.width + extra)],
    grid = widths.map((w) => `${w}px`).join(" "),
    total = widths.reduce((n, w) => n + w, 0);
  useLayoutEffect(() => {
    const resize = () => {
      if (board.current) {
        setHeight(Math.max(320, window.innerHeight - board.current.getBoundingClientRect().top - 24));
        setBoardWidth(board.current.clientWidth);
      }
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
  function dateAt(y: number) {
    return dayAtPointer(body.current?.getBoundingClientRect().top || 0, y, rowHeight, start, days);
  }
  const over = people.filter((p) => p.loads.some((v) => v > 100)).length;
  return (
    <>
      <div className="mp-calendar-meta">
        <span>
          {start}—{addDays(start, days - 1)} · {people.length} 人
        </span>
        <span>{over ? `⚠ ${over} 人的安排需要协调 · ` : ""}点击柱体快捷调整 · 划选一段暂停或改派 · ↕ 拖动整项 · 灰白表示暂停</span>
      </div>
      <div
        className={`mp-people-board mp-calendar-board mp-pillar-board mp-period-${period}`}
        ref={board}
        style={{ height, "--mp-row-height": `${rowHeight}px` } as CSSProperties}
        tabIndex={0}
        role="region"
        aria-label="人员日期排期表"
      >
        <div className="mp-column-calendar" style={{ width: Math.max(total, 0), minWidth: "100%" }}>
          <table className="mp-person-calendar mp-pillar-grid" style={{ width: total, minWidth: "100%" }}>
            <colgroup>
              {widths.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="mp-calendar-corner">
                  日期 / 人员
                </th>
                {people.map(({ person }) => (
                  <th scope="col" key={person.id} title={person.is_active ? person.name : `${person.name}（停用）`}>
                    <strong>{person.name}</strong>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody ref={body}>
              {dates.map((date, i) => {
                const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
                return (
                  <tr
                    key={date}
                    style={{ height: rowHeight }}
                    className={`${weekday === 0 || weekday === 6 ? "mp-calendar-weekend " : ""}${date === current ? "mp-calendar-today" : ""}`}
                  >
                    <th scope="row">
                      <strong>{date.slice(5).replace("-", "/")}</strong>
                      <small>
                        周{["日", "一", "二", "三", "四", "五", "六"][weekday]}
                        {date === current ? " · 今天" : ""}
                      </small>
                    </th>
                    {people.map(({ person, loads }) => (
                      <td
                        key={person.id}
                        data-person={person.id}
                        data-date={date}
                        className={loads[i] > 100 ? "mp-cell-over" : ""}
                        onDragOver={!disabled && person.is_active ? onDateDragOver : undefined}
                        onDrop={!disabled && person.is_active ? (e) => onDateDrop(e, person.id, date) : undefined}
                      >
                        <button
                          className="mp-pillar-add"
                          aria-label={`${person.name} ${date} 添加工作`}
                          disabled={disabled || !person.is_active || !projects.length}
                          onClick={() => onAdd(person.id, date)}
                        >
                          <span>＋</span>
                        </button>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mp-pillar-overlay" style={{ height: days * rowHeight, gridTemplateColumns: grid }}>
            <div />
            {people.map(({ person, items }) => (
              <div className="mp-person-pillar-track" key={person.id}>
                {items.map((e) => (
                  <div
                    key={`${e.project.id}:${e.stage.id}`}
                    className="mp-pillar-wrap"
                    style={{
                      top: e.left * rowHeight + 2,
                      height: e.width * rowHeight - 4,
                      left:
                        Math.max(
                          4,
                          (people.find((p) => p.person.id === person.id)!.width +
                            extra -
                            Math.max(1, ...items.map((i) => i.lane + 1)) * 22) /
                            2,
                        ) +
                        e.lane * 22,
                      width: 20,
                    }}
                  >
                    <button
                      className={`mp-work-pillar${e.stage.milestone ? " mp-pillar-milestone" : ""}`}
                      style={{ backgroundColor: projectTint(e.project) }}
                      disabled={disabled}
                      aria-label={`${person.name} ${e.project.name} · ${e.stage.name}`}
                      title={`${e.project.name} · ${e.stage.name}\n${e.stage.start}—${e.stage.end}\n点击快捷调整；按住柱体划选日期，暂停或改派到其他项目`}
                      onPointerDown={(event) => {
                        if (event.button !== 0 || disabled || e.stage.milestone) return;
                        suppress.current = false;
                        const date = dateAt(event.clientY);
                        pointer.current = {
                          id: event.pointerId,
                          from: date,
                          top: event.clientY,
                          project: e.project,
                          stage: e.stage,
                          person: person.id,
                        };
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={(event) => {
                        const p = pointer.current;
                        if (!p || p.id !== event.pointerId) return;
                        const to = dateAt(event.clientY);
                        setSelection({
                          project: e.project.id!,
                          stage: e.stage.id,
                          person: person.id,
                          from: p.from < to ? p.from : to,
                          to: p.from < to ? to : p.from,
                        });
                      }}
                      onPointerCancel={() => {
                        pointer.current = null;
                        setSelection(null);
                      }}
                      onPointerUp={(event) => {
                        const p = pointer.current;
                        pointer.current = null;
                        setSelection(null);
                        if (!p) return;
                        const to = dateAt(event.clientY);
                        if (to !== p.from) {
                          suppress.current = true;
                          const a = p.from < to ? p.from : to,
                            b = p.from < to ? to : p.from;
                          onSegment(
                            p.project,
                            p.stage,
                            p.person,
                            a < e.stage.start ? e.stage.start : a,
                            b > e.stage.end ? e.stage.end : b,
                            event.clientX,
                            event.clientY,
                          );
                        }
                      }}
                      onClick={(event) => {
                        if (suppress.current) {
                          suppress.current = false;
                          return;
                        }
                        const date = event.detail ? dateAt(event.clientY) : addDays(start, e.left);
                        const box = event.currentTarget.getBoundingClientRect();
                        onSelect(e.project, e.stage, person.id, date, event.detail ? event.clientX : box.right, event.detail ? event.clientY : box.top);
                      }}
                      onDragOver={!disabled ? onDateDragOver : undefined}
                      onDrop={!disabled ? (event) => onDateDrop(event, person.id, dateAt(event.clientY)) : undefined}
                    >
                      <span className="mp-pillar-caption">
                        {e.stage.milestone ? "◆ " : ""}
                        {e.project.name} · {e.stage.name}
                      </span>
                      {pauseSlices(e.stage, person.id, addDays(start, e.left), e.width).map((s) => (
                        <span
                          key={s.left}
                          className={`mp-pillar-pause${s.unattended ? " mp-pillar-unattended" : ""}`}
                          style={{ top: `${(s.left / e.width) * 100}%`, height: `${(s.width / e.width) * 100}%` }}
                          title={s.unattended ? "⚠ 工作暂停 · 暂无人员接替" : "该人员暂停参与，其他人员继续负责"}
                        >
                          <span>{s.unattended ? "⚠ 工作暂停" : "暂停参与"}</span>
                        </span>
                      ))}
                      {selection &&
                        selection.project === e.project.id &&
                        selection.stage === e.stage.id &&
                        selection.person === person.id && (
                          <span
                            className="mp-pillar-selection"
                            style={{
                              top: `${(Math.max(0, (Date.parse(selection.from) - Date.parse(addDays(start, e.left))) / 86400000) / e.width) * 100}%`,
                              height: `${(((Date.parse(selection.to) - Date.parse(selection.from)) / 86400000 + 1) / e.width) * 100}%`,
                            }}
                          />
                        )}
                    </button>
                    {!e.stage.milestone && person.is_active && (
                      <button
                        className="mp-pillar-grip"
                        aria-label={`${person.name} ${e.stage.name} 拖动整项`}
                        title="拖动整项改期或转交"
                        draggable={!disabled}
                        disabled={disabled}
                        onDragStart={(event) =>
                          onStageDrag(event, e.project, e.stage, person.id, addDays(start, e.left))
                        }
                        onDragEnd={onDragEnd}
                      >
                        ↕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        {!people.length && <p className="mp-empty">暂无人员，请先维护人员名册。</p>}
      </div>
      <p className="mp-help">
        点击空白日期格新增工作。多人工作共享起止日期；改派一段只抽调所选人员。未安排人员的工作{" "}
        {entries.filter((e) => !e.stage.assignees.length).length} 项。
      </p>
    </>
  );
}
