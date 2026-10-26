import type { DragEvent } from "react";
import { ganttEntries, staffLoads, addDays, staffAffiliation, projectTint, isPaused, type PlanningProject, type Staff, type Stage } from "./planning";
import { projectColor } from "./staffPlanning";
export default function PeopleSchedule({
  projects,
  staff,
  start,
  days,
  onEdit,
  workloadProjects = projects,
  selectedPerson,
  disabled = false,
  onSelect,
  onStageDrag,
  onDragEnd,
  onDateDragOver,
  onDateDrop,
  onStageDragOver,
  onStageDrop,
}: {
  projects: PlanningProject[];
  staff: Staff[];
  start: string;
  days: number;
  onEdit: (p: PlanningProject) => void;
  workloadProjects?: PlanningProject[];
  selectedPerson?: number;
  disabled?: boolean;
  onSelect?: (p: PlanningProject, s: Stage) => void;
  onStageDrag?: (e: DragEvent, p: PlanningProject, s: Stage, person: number, anchor: string) => void;
  onDragEnd?: () => void;
  onDateDragOver?: (e: DragEvent) => void;
  onDateDrop?: (e: DragEvent, person: number, date: string) => void;
  onStageDragOver?: (e: DragEvent) => void;
  onStageDrop?: (e: DragEvent, p: PlanningProject, s: Stage) => void;
}) {
  const entries = ganttEntries(projects, start, days);
  const workload = ganttEntries(workloadProjects, start, days);
  return (
    <>
      <div className="mp-schedule-legend">
        <span>
          <i className="free" />
          未排期
        </span>
        <span>
          <i className="planned" />
          已安排 ≤ 100%
        </span>
        <span>
          <i className="over" />
          超额 &gt; 100%
        </span>
        <small>点击工作条调整 · 拖至负荷日期格改期 / 转交</small>
      </div>
      <div className="mp-people-board">
        <div style={{ minWidth: 240 + days * 64 }}>
          <div className="mp-people-head">
            <div className="mp-people-label">人员 / 工作安排</div>
            <div className="mp-capacity-days">
              {Array.from({ length: days }, (_, i) => (
                <span key={i}>
                  {addDays(start, i).slice(5)}
                  <small>
                    {["日", "一", "二", "三", "四", "五", "六"][new Date(`${addDays(start, i)}T00:00:00Z`).getUTCDay()]}
                  </small>
                </span>
              ))}
            </div>
          </div>
          {staff
            .filter((person) => person.is_active || workload.some((entry) => entry.stage.assignees.includes(person.id)))
            .map((person) => {
              const values = staffLoads(workload, person.id, days),
                items = entries.filter((e) => e.stage.assignees.includes(person.id));
              const lanes: number[] = [];
              const placed = items.slice().sort((a,b) => a.left-b.left).map(e => { let lane = lanes.findIndex(end => end <= e.left); if(lane < 0) lane = lanes.length; lanes[lane] = e.left+e.width; return {e,lane}; });
              return (
                <div
                  className={`mp-person-row${selectedPerson === person.id ? " mp-person-selected" : ""}`}
                  key={person.id}
                >
                  <div className="mp-people-label">
                    <span className="mp-avatar">{person.name.slice(-2)}</span>
                    <div>
                      <strong>
                        {person.name}
                        {person.is_active ? "" : "（停用）"}
                      </strong>
                      <small>{person.position || "项目成员"}</small>
                      <small className="mp-affiliation">{staffAffiliation(person)}</small>
                      <span className={values.some((v) => v > 100) ? "mp-danger-text" : "mp-subtle"}>
                        {values.some((v) => v > 100)
                          ? `${values.filter((v) => v > 100).length} 天超额`
                          : `${items.length} 个阶段`}
                      </span>
                    </div>
                  </div>
                  <div
                    className="mp-capacity-timeline"
                    style={{ flex: 1, minWidth: days * 64, backgroundSize: `${100 / days}% 100%` }}
                  >
                    <div className="mp-capacity-days">
                      {values.map((v, i) => (
                        <span
                          key={i}
                          className={v > 100 ? "over" : v ? "planned" : "free"}
                          title={`${person.name} ${addDays(start, i)} 全部项目计划分配 ${v}%`}
                          onDragOver={!disabled && person.is_active ? onDateDragOver : undefined}
                          onDrop={
                            !disabled && person.is_active
                              ? (e) => onDateDrop?.(e, person.id, addDays(start, i))
                              : undefined
                          }
                        >
                          {v ? `${v}%` : "—"}
                        </span>
                      ))}
                    </div>
                    {items.length ? (
                      <div className="mp-packed-tracks" style={{ height: Math.max(1, lanes.length) * 26, position: "relative" }}>{placed.map(({e,lane}) => (
                        <div className="mp-capacity-track" key={`${e.project.id}-${e.stage.id}`} style={{ position: "absolute", top: lane * 26, left: 0, right: 0 }}>
                          <button
                            style={{
                              left: `calc(${(e.left / days) * 100}% + 3px)`,
                              width: `calc(${(e.width / days) * 100}% - 6px)`,
                              background: projectTint(e.project),
                            }}
                            disabled={disabled}
                            draggable={Boolean(onStageDrag) && !disabled && !e.project.archived}
                            onDragStart={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              const offset = Math.min(
                                e.width - 1,
                                Math.max(
                                  0,
                                  Math.floor(((event.clientX - rect.left) / Math.max(1, rect.width)) * e.width),
                                ),
                              );
                              onStageDrag?.(event, e.project, e.stage, person.id, addDays(start, e.left + offset));
                            }}
                            onDragEnd={onDragEnd}
                            onDragOver={!disabled && !e.project.archived ? onStageDragOver : undefined}
                            onDrop={
                              !disabled && !e.project.archived
                                ? (event) => onStageDrop?.(event, e.project, e.stage)
                                : undefined
                            }
                            onClick={() => (onSelect ? onSelect(e.project, e.stage) : onEdit(e.project))}
                            title={`${e.project.name} · ${e.stage.name}\n${e.stage.start} — ${e.stage.end} · 分配 ${e.stage.allocation}%`}
                          >
                            {Array.from({length:e.width},(_,i) => isPaused(e.stage,person.id,addDays(start,e.left+i)) ? <span key={i} className="mp-pause-slice" style={{left:`${i/e.width*100}%`,width:`${100/e.width}%`}} title="暂停，不计负荷" /> : null)}
                            <span className="mp-work-caption">{e.project.name} · {e.stage.name}</span>
                            <small> {e.stage.allocation}%</small>
                          </button>
                        </div>
                      ))}</div>
                    ) : (
                      <p className="mp-schedule-empty">没有显示的阶段 · 负荷格仍包含隐藏项目</p>
                    )}
                  </div>
                </div>
              );
            })}
          {!staff.length ? <div className="mp-empty">暂无人员，请先维护人员名册。</div> : null}
        </div>
      </div>
      <p className="mp-help">
        未指定人员的阶段：{entries.filter((e) => !e.stage.assignees.length).length}{" "}
        个。停用人员的既有安排仍保留。负荷合计覆盖所选年度全部项目，包含被筛选隐藏的安排。
      </p>
    </>
  );
}
