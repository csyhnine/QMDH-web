import { useEffect, useRef, useState } from "react";
import type { GanttStatic } from "dhtmlx-gantt";
import { initializePlanningGantt, renderPlanningGantt } from "./ganttBridge";
import { savePlanQueue, stageFromGantt, type PlanningProject, type Staff } from "./planning";
import "dhtmlx-gantt/codebase/dhtmlxgantt.css";
export default function ProjectPlan({
  projects,
  staff,
  start,
  days,
  archived,
  onEdit,
  onPersist,
  onDirty,
  onBusy,
}: {
  projects: PlanningProject[];
  staff: Staff[];
  start: string;
  days: number;
  archived: boolean;
  onEdit: (p: PlanningProject) => void;
  onPersist: (p: PlanningProject) => Promise<PlanningProject>;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<GanttStatic | null>(null);
  const [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState<Record<number, PlanningProject>>({}),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const latest = useRef({ projects, pending, saving, archived, onEdit });
  latest.current = { projects, pending, saving, archived, onEdit };
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => {
    onDirty(Object.keys(pending).length > 0);
    return () => onDirty(false);
  }, [pending, onDirty]);
  useEffect(() => {
    let stopped = false;
    import("dhtmlx-gantt")
      .then((module) => {
        if (stopped || !host.current) return;
        const gantt = module.Gantt.getGanttInstance();
        chart.current = gantt;
        initializePlanningGantt(gantt, host.current, {
          canDrag: () => !latest.current.saving && !latest.current.archived,
          onEdit: (id) => {
            if (Object.keys(latest.current.pending).length) {
              setError("请先保存或撤销拖动调整，再打开项目详情。");
              return;
            }
            const p = latest.current.projects.find((p) => p.id === id);
            if (p) latest.current.onEdit(p);
          },
          onChange: (id, stageId, task) =>
            setPending((previous) => {
              const source = previous[id] || latest.current.projects.find((p) => p.id === id);
              if (!source) return previous;
              return {
                ...previous,
                [id]: { ...source, stages: source.stages.map((s) => (s.id === stageId ? stageFromGantt(s, task) : s)) },
              };
            }),
        });
        setReady(true);
      })
      .catch(() => {
        if (!stopped) setLoadError("甘特组件加载失败，请刷新重试。仍可从台账编辑阶段排期。");
      });
    return () => {
      stopped = true;
      chart.current?.destructor();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    if (ready && chart.current)
      renderPlanningGantt(
        chart.current,
        projects.map((p) => pending[p.id!] || p),
        staff,
        start,
        days,
        archived || saving,
      );
  }, [ready, projects, staff, start, days, pending, archived, saving]);
  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    // Keep failed and unattempted edits; remove only writes acknowledged by the server.
    const failure = await savePlanQueue(Object.values(pending), onPersist, (id) =>
      setPending((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      }),
    );
    if (failure) setError(failure instanceof Error ? failure.message : "排期保存失败，调整仍保留，请重试。");
    setSaving(false);
  }
  return (
    <div className="mp-project-plan">
      <div className="mp-plan-tip">
        <span>↔ 拖动调整日期　↦ 拉伸调整工期　◈ 双击打开项目详情</span>
        <small>{archived ? "已归档项目为只读预览" : "调整后需点击保存 · 不会自动移动其他阶段"}</small>
      </div>
      {Object.keys(pending).length ? (
        <div className="mp-pending" role="status">
          <div>
            <strong>{Object.keys(pending).length} 个项目有排期调整</strong>
            <span>尚未保存到服务器，离开前请保存或撤销。</span>
          </div>
          <button
            disabled={saving}
            onClick={() => {
              setPending({});
              setError("");
            }}
          >
            撤销调整
          </button>
          <button className="mp-primary" disabled={saving} onClick={save}>
            {saving ? "正在保存…" : "保存排期调整"}
          </button>
        </div>
      ) : null}
      {Object.keys(pending).length ? (
        <details className="mp-change-list">
          <summary>查看日期与进度调整</summary>
          {Object.values(pending).map((project) => (
            <div key={project.id}>
              <strong>{project.name}</strong>
              {project.stages.map((stage) => {
                const before = projects.find((p) => p.id === project.id)?.stages.find((s) => s.id === stage.id);
                if (
                  before &&
                  before.start === stage.start &&
                  before.end === stage.end &&
                  before.progress === stage.progress
                )
                  return null;
                return (
                  <p key={stage.id}>
                    <b>{stage.name}</b>
                    <span>
                      原安排：{before ? `${before.start} — ${before.end} · ${before.progress}%` : "未在当前列表中"}
                    </span>
                    <span>
                      调整为：{stage.start} — {stage.end} · {stage.progress}%
                    </span>
                  </p>
                );
              })}
            </div>
          ))}
        </details>
      ) : null}
      {error || loadError ? (
        <p className="mp-error" role="alert">
          {error || loadError}
        </p>
      ) : null}
      {!ready && !loadError ? <p>正在加载项目计划…</p> : null}
      <div ref={host} className="mp-chart" aria-label="项目阶段交互甘特图" />
      {!projects.length ? (
        <p className="mp-plan-empty">暂无项目。新建项目并添加设计阶段后，即可拖动安排时间。</p>
      ) : null}
    </div>
  );
}
