import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  addDays,
  dayNumber,
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
import { personnelLane, zoomPersonnelWindow } from "./personnelViewport";
import usePillarResize from "./usePillarResize";
export default function PeopleSchedule({
  projects,
  staff,
  start,
  days,
  period,
  fitDates,
  onZoom,
  onResetZoom,
  onResize,
  onResizeBusy,
  moveWork,
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
  fitDates: boolean;
  onZoom: (start: string, days: number) => void;
  onResetZoom: () => void;
  onResize: (project: PlanningProject, stage: Stage, edge: "start" | "end", offset: number) => void;
  onResizeBusy: (busy: boolean) => void;
  moveWork?: { projectId: number; stageId: string } | null;
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
        width: 60,
        lanes: lanes.length,
      };
    });
  const current = today(),
    board = useRef<HTMLDivElement>(null),
    body = useRef<HTMLTableSectionElement>(null);
  const [height, setHeight] = useState(600),
    [boardWidth, setBoardWidth] = useState(0),
    [contentZoom, setContentZoom] = useState(0),
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
  const rowHeight = fitDates ? Math.max(18, (height - 37) / days) : period === "week" ? Math.max(62, Math.floor((height - 36) / 7)) : period === "month" ? 44 : 34;
  const resize = usePillarResize({ board, rowHeight, start, days, disabled, onCommit: onResize, onBusy: onResizeBusy });
  const displayDays = days + (resize.preview?.edge === "end" ? Math.min(366, Math.max(7, resize.preview.offset + 7)) : 0),
    dates = Array.from({ length: displayDays }, (_, i) => addDays(start, i));
  const [moving, setMoving] = useState(""), [dropTarget, setDropTarget] = useState("");
  const zoomSteps = [1, 1.5, 2, 3, 4, 6, 8], scale = zoomSteps[contentZoom];
  const extra = Math.max(0, boardWidth - 72 - people.reduce((n, p) => n + p.width, 0)) / Math.max(1, people.length);
  const horizontalAnchor = useRef<number | null>(null);
  const widths = [72, ...people.map((p) => p.width + extra)],
    scaledWidths = widths.map((w, i) => i === 0 ? w : w * scale),
    grid = scaledWidths.map((w) => `${w}px`).join(" "),
    total = scaledWidths.reduce((n, w) => n + w, 0);
  function changeContentZoom(next: number) {
    const element = board.current;
    if (!element || disabled || resize.preview || pointer.current) return;
    horizontalAnchor.current = (element.scrollLeft + element.clientWidth / 2 - 72) / scale;
    setContentZoom(Math.max(0, Math.min(zoomSteps.length - 1, next)));
  }
  useLayoutEffect(() => {
    if (horizontalAnchor.current !== null && board.current) {
      board.current.scrollLeft = horizontalAnchor.current * scale + 72 - board.current.clientWidth / 2;
      horizontalAnchor.current = null;
    }
  }, [scale]);
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
  useLayoutEffect(() => {
    if (fitDates && board.current) board.current.scrollTop = 0;
  }, [start, days, fitDates]);
  function zoom(direction: number, offset?: number) {
    const element = board.current;
    if (!element || disabled || resize.preview) return;
    const next = zoomPersonnelWindow(start, days, rowHeight, element.clientHeight, offset ?? element.clientHeight / 2, element.scrollTop, direction);
    onZoom(next.start, next.days);
  }
  useLayoutEffect(() => {
    const element = board.current;
    if (!element) return;
    let delta = 0;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) { delta = 0; return; }
      event.preventDefault();
      delta += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      if (Math.abs(delta) < 40) return;
      zoom(Math.sign(delta), event.clientY - element.getBoundingClientRect().top);
      delta = 0;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [start, days, rowHeight, disabled, onZoom, Boolean(resize.preview)]);
  function drop(event: DragEvent, person: number, date: string) {
    setMoving(""); setDropTarget("");
    onDateDrop(event, person, date);
  }
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
        <div className="mp-personnel-zoom">
          <div className="mp-content-zoom" role="group" aria-label="工作内容缩放">
            <span>内容</span>
            <button disabled={disabled || Boolean(resize.preview) || contentZoom === 0} aria-label="缩小工作内容" onClick={() => changeContentZoom(contentZoom - 1)}>−</button>
            <input type="range" min="0" max={zoomSteps.length - 1} step="1" value={contentZoom} disabled={disabled || Boolean(resize.preview)} aria-label="工作内容缩放比例" aria-valuetext={`${scale * 100}%`} onChange={event => changeContentZoom(Number(event.target.value))} />
            <output>{scale * 100}%</output>
            <button disabled={disabled || Boolean(resize.preview) || contentZoom === zoomSteps.length - 1} aria-label="放大工作内容" onClick={() => changeContentZoom(contentZoom + 1)}>＋</button>
            <button disabled={disabled || Boolean(resize.preview)} onClick={() => changeContentZoom(zoomSteps.findIndex((step, index) => index === zoomSteps.length - 1 || people.every(p => Math.min(22 * step, ((p.width + extra) * step - 12) / Math.max(1, p.lanes)) >= 28)))}>看清内容</button>
            {contentZoom > 0 && <button disabled={disabled || Boolean(resize.preview)} onClick={() => changeContentZoom(0)}>重置宽度</button>}
          </div>
          <span>{over ? `⚠ ${over} 人的安排需要协调 · ` : ""}Ctrl + 滚轮缩放 · {fitDates ? `当前 ${days} 天` : "双击空白新增"}</span>
          <button disabled={disabled} aria-label="缩小日期视图" title="显示更多日期" onClick={() => zoom(1)}>−</button>
          <button disabled={disabled} aria-label="放大日期视图" title="显示更少日期" onClick={() => zoom(-1)}>＋</button>
          {fitDates && <button disabled={disabled} onClick={onResetZoom}>重置缩放</button>}
        </div>
      </div>
      <div
        className={`mp-people-board mp-calendar-board mp-pillar-board mp-period-${period}${rowHeight < 38 ? " mp-dense-dates" : ""}${resize.preview ? " mp-resizing-board" : ""}`}
        ref={board}
        style={{ height, "--mp-row-height": `${rowHeight}px` } as CSSProperties}
        tabIndex={0}
        role="region"
        aria-label="人员日期排期表"
      >
        <div className="mp-column-calendar" style={{ width: Math.max(total, 0), minWidth: "100%" }}>
          <table className="mp-person-calendar mp-pillar-grid" style={{ width: total, minWidth: "100%" }}>
            <colgroup>
              {scaledWidths.map((w, i) => (
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
                    className={`${weekday === 0 || weekday === 6 ? "mp-calendar-weekend " : ""}${date === current ? "mp-calendar-today " : ""}${i >= days ? "mp-resize-buffer" : ""}`}
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
                        className={`${loads[i] > 100 ? "mp-cell-over" : ""}${dropTarget === `${person.id}:${date}` ? " mp-pillar-drop-target" : ""}`}
                        onDragOver={!disabled && person.is_active ? (event) => {
                          onDateDragOver(event);
                          if (event.defaultPrevented) setDropTarget(`${person.id}:${date}`);
                        } : undefined}
                        onDrop={!disabled && person.is_active ? (e) => drop(e, person.id, date) : undefined}
                      >
                        <button
                          className="mp-pillar-add"
                          aria-label={`${person.name} ${date} 添加工作`}
                          title="双击新增工作；键盘按 Enter 新增"
                          disabled={disabled || !person.is_active || !projects.length}
                          onDoubleClick={() => onAdd(person.id, date)}
                          onKeyDown={(event) => {
                            if (event.repeat) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onAdd(person.id, date);
                            }
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mp-pillar-overlay" style={{ height: displayDays * rowHeight, gridTemplateColumns: grid }}>
            <div />
            {people.map(({ person, items, width, lanes }) => (
              <div className="mp-person-pillar-track" key={person.id}>
                {items.map((e) => {
                  const lane = personnelLane((width + extra) * scale, lanes, e.lane, scale),
                    key = `${e.project.id}:${e.stage.id}`,
                    active = resize.preview?.projectId === e.project.id && resize.preview.stageId === e.stage.id,
                    shown = active ? resize.preview!.stage : e.stage,
                    visualStart = active && resize.preview!.edge === "start" && e.stage.start < start ? addDays(start, resize.preview!.offset) : shown.start,
                    visualEnd = active && resize.preview!.edge === "end" && e.stage.end > addDays(start, days - 1) ? addDays(start, days - 1 + resize.preview!.offset) : shown.end,
                    left = Math.max(0, Math.min(displayDays - 1, dayNumber(visualStart) - dayNumber(start))),
                    widthDays = Math.max(1, Math.min(displayDays, dayNumber(visualEnd) - dayNumber(start) + 1) - left),
                    moveEnabled = moveWork?.projectId === e.project.id && moveWork.stageId === e.stage.id;
                  return (
                  <div
                    key={`${e.project.id}:${e.stage.id}`}
                    className={`mp-pillar-wrap${lane.width < 12 ? " mp-pillar-narrow" : ""}${lane.width >= 48 ? " mp-pillar-readable" : ""}${widthDays * rowHeight < 36 ? " mp-pillar-short" : ""}${active ? " mp-pillar-resizing" : ""}${resize.landed === key ? " mp-pillar-landed" : ""}${moving === key ? " mp-pillar-moving" : ""}${moveEnabled ? " mp-pillar-move-enabled" : ""}`}
                    style={{
                      top: left * rowHeight + 2,
                      height: widthDays * rowHeight - 4,
                      ...lane,
                    }}
                  >
                    <button
                      className={`mp-work-pillar${e.stage.milestone ? " mp-pillar-milestone" : ""}`}
                      style={{ backgroundColor: projectTint(e.project) }}
                      disabled={disabled}
                      draggable={Boolean(moveEnabled && !disabled && person.is_active)}
                      onDragStart={(event) => {
                        if (!moveEnabled) { event.preventDefault(); return; }
                        onStageDrag(event, e.project, e.stage, person.id, addDays(start, e.left));
                        if (!event.defaultPrevented) setMoving(key);
                      }}
                      onDragEnd={() => { setMoving(""); setDropTarget(""); onDragEnd(); }}
                      aria-label={`${person.name} ${e.project.name} · ${e.stage.name}`}
                      title={`${e.project.name} · ${e.stage.name}\n${e.stage.start}—${e.stage.end}\n${moveEnabled ? "整项移动模式：拖至目标日期或人员" : "点击快捷调整；按住柱体划选日期，暂停或改派到其他项目"}`}
                      onPointerDown={(event) => {
                        if (event.button !== 0 || disabled || e.stage.milestone || resize.preview || moveEnabled) return;
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
                        if (moveEnabled) return;
                        if (suppress.current) {
                          suppress.current = false;
                          return;
                        }
                        const date = event.detail ? dateAt(event.clientY) : addDays(start, e.left);
                        const box = event.currentTarget.getBoundingClientRect();
                        onSelect(e.project, e.stage, person.id, date, event.detail ? event.clientX : box.right, event.detail ? event.clientY : box.top);
                      }}
                      onDragOver={!disabled && person.is_active ? (event) => {
                        onDateDragOver(event);
                        if (event.defaultPrevented) setDropTarget(`${person.id}:${dateAt(event.clientY)}`);
                      } : undefined}
                      onDrop={!disabled && person.is_active ? (event) => drop(event, person.id, dateAt(event.clientY)) : undefined}
                    >
                      <span className="mp-pillar-caption">
                        {e.stage.milestone ? "◆ " : ""}
                        {e.project.name} · {e.stage.name}
                      </span>
                      {pauseSlices(shown, person.id, addDays(start, left), widthDays).map((s) => (
                        <span
                          key={s.left}
                          className={`mp-pillar-pause${s.unattended ? " mp-pillar-unattended" : ""}`}
                          style={{ top: `${(s.left / widthDays) * 100}%`, height: `${(s.width / widthDays) * 100}%` }}
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
                      <>
                      {!moveEnabled && <button type="button" className={`mp-pillar-resize mp-pillar-resize-start${e.stage.start < start ? " mp-pillar-resize-continuation" : ""}`}
                        aria-label={`${person.name} ${e.project.name} · ${e.stage.name} 调整开始日期`}
                        title={`开始日期 ${e.stage.start}${e.stage.start < start ? "（在视图外）" : ""}；拖动调整真实日期，结束固定；↑↓调整一天`}
                        disabled={disabled} {...resize.bind(e.project, e.stage, "start")}><span /></button>}
                      {!moveEnabled && <button type="button" className={`mp-pillar-resize mp-pillar-resize-end${e.stage.end > addDays(start, days - 1) ? " mp-pillar-resize-continuation" : ""}`}
                        aria-label={`${person.name} ${e.project.name} · ${e.stage.name} 调整结束日期`}
                        title={`结束日期 ${e.stage.end}${e.stage.end > addDays(start, days - 1) ? "（在视图外）" : ""}；拖动调整真实日期，开始固定；↑↓调整一天`}
                        disabled={disabled} {...resize.bind(e.project, e.stage, "end")}><span /></button>}
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {!people.length && <p className="mp-empty">暂无人员，请先维护人员名册。</p>}
      </div>
      {resize.preview && createPortal(<div className="mp-pillar-resize-feedback" role="status"
        style={{ left: Math.max(12, Math.min(resize.preview.x + 18, window.innerWidth - 250)), top: Math.max(12, Math.min(resize.preview.y + 18, window.innerHeight - 90)) }}>
        <strong>{resize.preview.edge === "start" ? "调整开始 · 结束固定" : "调整结束 · 开始固定"}</strong>
        <span>{resize.preview.stage.start} — {resize.preview.stage.end}</span><small>{resize.preview.stage.start < start || resize.preview.stage.end > addDays(start, days - 1) ? "含视图外日期 · " : ""}松开应用 · Esc 取消</small>
      </div>, document.body)}
      <p className="mp-help">
        并行工作太密时可放大内容或点击“看清内容”，左右滚动查看其他人员。
        上下端分别调整真实起止，另一端固定，可跨当前日期范围；整项移动在快捷卡片中选择。柱体划选暂停/支援，双击空白新增。未安排人员的工作{" "}
        {entries.filter((e) => !e.stage.assignees.length).length} 项。
      </p>
    </>
  );
}
