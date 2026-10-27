import { confirmPlanning } from "./confirmPlanning";
import { useEffect, useRef, useState } from "react";
import type { GanttStatic } from "dhtmlx-gantt";
import { initializePlanningGantt, renderPlanningGantt } from "./ganttBridge";
import { addDays, dayNumber, today, savePlanQueue, stageFromGantt, staffAffiliation, projectTint, type Stage, type PlanningProject, type Staff } from "./planning";
import PlanningDate from "./PlanningDate";
import usePlanningAutoSave from "./usePlanningAutoSave";
import QuickWorkActions, { QuickDeliveryInsert, type QuickWork, type QuickDelivery } from "./QuickWorkActions";
import type { Reassignment } from "./pillarPlanning";
import "dhtmlx-gantt/codebase/dhtmlxgantt.css";
export default function ProjectPlan({
  projects,
  workloadProjects = projects,
  staff,
  start,
  days,
  archived,
  onEdit,
  onPersist,
  onReassign,
  onDirty,
  onBusy,
  autoSave = true,
}: {
  projects: PlanningProject[];
  workloadProjects?: PlanningProject[];
  staff: Staff[];
  start: string;
  days: number;
  archived: boolean;
  onEdit: (p: PlanningProject) => void;
  onPersist: (p: PlanningProject) => Promise<PlanningProject>;
  onReassign: (r: Reassignment) => Promise<void>;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  autoSave?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<GanttStatic | null>(null);
  const [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState("");
  const [pending, setPending] = useState<Record<number, PlanningProject>>({}),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const saveLock = useRef(false);
  const [quick, setQuick] = useState<QuickWork | null>(null), [delivery, setDelivery] = useState<QuickDelivery | null>(null), [quickBusy, setQuickBusy] = useState(false);
  const fitRange = (items: PlanningProject[]) => {
    const dates = items.flatMap(p => p.stages.flatMap(s => [s.start, s.end])).sort();
    return dates.length ? { start: addDays(dates[0], -2), days: Math.max(14, dayNumber(dates.slice(-1)[0]) - dayNumber(dates[0]) + 5) } : { start, days };
  };
  const [range, setRange] = useState(() => fitRange(projects));
  const requestedRange = useRef({ start, days });
  useEffect(() => {
    if (requestedRange.current.start !== start || requestedRange.current.days !== days) setRange({ start, days });
    requestedRange.current = { start, days };
  }, [start, days]);
  const [editor, setEditor] = useState<{ projectId: number; stage: Stage; isNew: boolean } | null>(null);
  const effective = projects.map(p => pending[p.id!] || p);
  const openStage = async (projectId: number, stageId?: string) => {
    if (saveLock.current || latest.current.quickBusy || latest.current.archived) return;
    if (latest.current.editor && !await confirmPlanning("当前工作尚未应用到预览，确定放弃编辑并切换？")) return;
    const project = latest.current.pending[projectId] || latest.current.projects.find(p => p.id === projectId);
    if (!project) return;
    setQuick(null); setDelivery(null);
    const stage = project.stages.find(s => s.id === stageId);
    const begin = project.stages.length ? addDays(project.stages.map(s => s.end).sort().slice(-1)[0], 1) : today();
    setEditor({ projectId, isNew: !stage, stage: stage ? structuredClone(stage) : { id: crypto.randomUUID(), name: "", start: begin, end: addDays(begin, 6), assignees: [], progress: 0, allocation: 100, milestone: false, notes: "" } });
    setError("");
  };
  const patch = (change: Partial<Stage>) => setEditor(e => e ? { ...e, stage: { ...e.stage, ...change } } : e);
  const applyStage = (remove = false) => {
    if (!editor || archived || saveLock.current) return;
    const s = editor.stage;
    if (!remove && (!s.name.trim() || !s.start || !s.end || s.end < s.start || dayNumber(s.end) - dayNumber(s.start) > 3660 || (s.milestone && s.start !== s.end))) {
      setError("请填写工作名称和有效日期；结束不早于开始，里程碑须为同一天，工期不超过十年。"); return;
    }
    setPending(previous => {
      const p = previous[editor.projectId] || projects.find(p => p.id === editor.projectId);
      if (!p) return previous;
      return { ...previous, [editor.projectId]: { ...p, stages: remove ? p.stages.filter(x => x.id !== s.id) : editor.isNew ? [...p.stages, { ...s, name: s.name.trim() }] : p.stages.map(x => x.id === s.id ? s : x) } };
    });
    setEditor(null); setError("");
  };
  function openDelivery(projectId: number, date: string, x: number, y: number) {
    if (saveLock.current || latest.current.quickBusy || latest.current.archived || latest.current.editor) return;
    setQuick(null); setDelivery({ projectId, date, x, y });
  }
  function insertDelivery(name: string, date: string, deliverable: string) {
    if (!delivery || archived || saveLock.current) return;
    const p = pending[delivery.projectId] || projects.find(p => p.id === delivery.projectId);
    if (!p || p.stages.length >= 200) { setError("该项目工作数量已达上限"); return; }
    const node: Stage = { id: crypto.randomUUID(), name, start: date, end: date, assignees: [], milestone: true, deliverable, progress: 0, allocation: 100, notes: "" };
    setPending(previous => ({ ...previous, [p.id!]: { ...p, stages: [...p.stages, node] } }));
    setRange(fitRange([...effective.filter(v => v.id !== p.id), { ...p, stages: [...p.stages, node] }]));
    setError(""); setDelivery(null);
  }
  const latest = useRef({ projects, pending, saving, archived, onEdit, editor, quickBusy, quick, delivery });
  latest.current = { projects, pending, saving, archived, onEdit, editor, quickBusy, quick, delivery };
  useEffect(() => {
    onBusy(saving || quickBusy);
    return () => onBusy(false);
  }, [saving, quickBusy, onBusy]);
  useEffect(() => {
    onDirty(Object.keys(pending).length > 0 || Boolean(editor || quick || delivery));
    return () => onDirty(false);
  }, [pending, editor, Boolean(quick), Boolean(delivery), onDirty]);
  useEffect(() => {
    let stopped = false;
    import("dhtmlx-gantt")
      .then((module) => {
        if (stopped || !host.current) return;
        const gantt = module.Gantt.getGanttInstance();
        chart.current = gantt;
        initializePlanningGantt(gantt, host.current, {
          onStage: (id, stage) => openStage(id, stage),
          onQuick: (projectId, stageId, x, y) => {
            const state = latest.current;
            if (saveLock.current || state.archived || state.editor || state.quickBusy) return;
            if (Object.keys(state.pending).length) return;
            const s = state.projects.find(p => p.id === projectId)?.stages.find(s => s.id === stageId);
            if (s) { setDelivery(null); setQuick({ projectId, stageId, date: s.start, x, y }); }
          },
          onDelivery: openDelivery,
          canDrag: () => !latest.current.saving && !latest.current.archived && !latest.current.editor && !latest.current.quickBusy && !latest.current.quick && !latest.current.delivery,
          onEdit: (id) => {
            if (Object.keys(latest.current.pending).length || latest.current.editor) {
              setError("请先保存或撤销拖动调整，再打开项目详情。");
              return;
            }
            const p = latest.current.projects.find((p) => p.id === id);
            if (p) latest.current.onEdit(p);
          },
          onChange: (id, stageId, task) => {
            setError("");
            setPending((previous) => {
              const source = previous[id] || latest.current.projects.find((p) => p.id === id);
              if (!source) return previous;
              return {
                ...previous,
                [id]: { ...source, stages: source.stages.map((s) => (s.id === stageId ? stageFromGantt(s, task) : s)) },
              };
            });
          },
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
        range.start,
        range.days,
        archived || saving || quickBusy,
      );
  }, [ready, projects, staff, range, pending, archived, saving, quickBusy]);
  async function save() {
    if (saveLock.current || editor || archived || !Object.keys(pending).length) return;
    saveLock.current = true;
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
    saveLock.current = false;
    setSaving(false);
  }
  usePlanningAutoSave(Object.keys(pending).length ? JSON.stringify(pending) : null, autoSave, saving || archived || Boolean(editor || delivery) || Boolean(error), save);
  return (
    <div className="mp-project-plan">
      <div className="mp-plan-tip">
        <span>点击工作条快捷暂停 / 支援 · 拖动改期 · 拖边缘改工期 · 点击时间轴空白处插入交付节点</span>
        {archived && <small>已归档项目为只读预览</small>}
      </div>
      <div className="mp-direct-actions">
        <button onClick={() => setRange(fitRange(effective))}>显示全部工作</button>
        <span>当前显示 {range.start} 至 {addDays(range.start, range.days - 1)}；超出窗口的工作会被截断，实际日期见左侧。</span>
      </div>
      <div className="mp-project-shortcuts">{effective.map(p => <div key={p.id}><strong style={{borderLeft:`5px solid ${projectTint(p)}`,paddingLeft:8}}>{p.name}</strong><span>{p.stages.length} 项工作 · {p.stages.length ? `${p.stages.map(s => s.start).sort()[0]} — ${p.stages.map(s => s.end).sort().slice(-1)[0]}` : "尚未排期"}</span>
        <button disabled={saving || archived} onClick={() => openStage(p.id!)}>＋ 添加阶段 / 人员工作</button>
        <button disabled={saving || archived || Boolean(editor)} onClick={e => { const box = e.currentTarget.getBoundingClientRect(); openDelivery(p.id!, p.deadline || today(), box.left, box.bottom); }}>◆ 插入交付节点</button>
        <button disabled={saving || Boolean(editor) || Object.keys(pending).length > 0} onClick={() => onEdit(p)}>编辑项目资料</button>
      </div>)}</div>
      {editor && <form className="mp-work-editor" aria-label="甘特工作安排" onSubmit={e => { e.preventDefault(); applyStage(); }}>
        <header><strong>{editor.isNew ? "添加工作安排" : "编辑工作安排"} · {effective.find(p => p.id === editor.projectId)?.name}</strong><button type="button" onClick={() => setEditor(null)}>取消编辑</button></header>
        <fieldset disabled={saving || archived}>
          <label>阶段 / 工作名称<input aria-label="阶段或工作名称" required maxLength={250} value={editor.stage.name} onChange={e => patch({ name: e.target.value })} /></label>
          <label>开始日期<PlanningDate label="工作开始日期" value={editor.stage.start} required onChange={start => patch({ start, ...(editor.stage.milestone ? { end: start } : {}) })} /></label>
          <label>结束日期<PlanningDate label="工作结束日期" value={editor.stage.end} min={editor.stage.start} required onChange={end => patch({ end, ...(editor.stage.milestone ? { start: end } : {}) })} /></label>
          <label>交付物<input aria-label="阶段交付物" maxLength={1000} value={editor.stage.deliverable || ""} onChange={e=>patch({deliverable:e.target.value})}/></label>
          <label>工作内容<textarea aria-label="工作内容" maxLength={2000} value={editor.stage.notes} onChange={e => patch({ notes: e.target.value })} /></label>
          <label>每人投入（%）<input aria-label="每人投入" type="number" min={1} max={100} required value={editor.stage.allocation} onChange={e => patch({ allocation: Number(e.target.value) })} /></label>
          <label>进度（%）<input aria-label="工作进度" type="number" min={0} max={100} required value={editor.stage.progress} onChange={e => patch({ progress: Number(e.target.value) })} /></label>
          <label><input type="checkbox" checked={editor.stage.milestone} onChange={e => patch({ milestone: e.target.checked, ...(e.target.checked ? { end: editor.stage.start } : {}) })} />里程碑（单日）</label>
          <div className="mp-work-people"><b>参与人员</b><p>同一工作中的参与者共享日期。参与时段或工作内容不同，请分别添加工作。</p>{staff.filter(s => s.is_active || editor.stage.assignees.includes(s.id)).map(s => <label key={s.id}><input type="checkbox" disabled={!s.is_active && !editor.stage.assignees.includes(s.id)} checked={editor.stage.assignees.includes(s.id)} onChange={e => patch({ assignees: e.target.checked ? [...editor.stage.assignees, s.id] : editor.stage.assignees.filter(id => id !== s.id) })} />{s.name}<small className="mp-affiliation">{staffAffiliation(s)}</small>{s.is_active ? "" : "（停用）"}</label>)}</div>
          <footer><button type="submit" className="mp-primary">应用到甘特图预览</button>{!editor.isNew && <button type="button" onClick={async () => { if (await confirmPlanning("从本次计划移除此工作安排？保存后生效。")) applyStage(true); }}>移除工作</button>}</footer>
        </fieldset>{archived && <p>已归档项目只读，请先在项目资料中恢复。</p>}
      </form>}
      {Object.keys(pending).length && (!autoSave || Boolean(error)) ? (
        <div className="mp-pending" role="status">
          <div>
            <strong>{Object.keys(pending).length} 个项目有排期调整</strong>
            <span>{autoSave ? "等待自动保存；失败时调整会保留，也可立即保存。" : "尚未保存到服务器，离开前请保存或撤销。"}</span>
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
          <button className="mp-primary" disabled={saving || Boolean(editor)} onClick={save}>
            {saving ? "正在保存…" : "保存排期调整"}
          </button>
        </div>
      ) : null}
      {Object.keys(pending).length && (!autoSave || Boolean(error)) ? (
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
                  && JSON.stringify(before) === JSON.stringify(stage)
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
      <div className="mp-chart-scroll"><div ref={host} className="mp-chart" aria-label="项目阶段交互甘特图" /></div>
      {quick && <QuickWorkActions key={`${quick.projectId}:${quick.stageId}`} request={quick} projects={workloadProjects} staff={staff} disabled={archived || saving}
        onPersist={onPersist} onReassign={onReassign} onBusy={setQuickBusy} onClose={() => setQuick(null)} onDetails={() => { setQuick(null); void openStage(quick.projectId, quick.stageId); }} />}
      {delivery && effective.find(p => p.id === delivery.projectId) && <QuickDeliveryInsert key={`${delivery.projectId}:${delivery.date}`} request={delivery} project={effective.find(p => p.id === delivery.projectId)!} disabled={archived || saving} onInsert={insertDelivery} onClose={() => setDelivery(null)} />}
      {!projects.length ? (
        <p className="mp-plan-empty">暂无项目。新建项目并添加设计阶段后，即可拖动安排时间。</p>
      ) : null}
    </div>
  );
}

