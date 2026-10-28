import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import PlanningDate from "./PlanningDate";
import { adjustWorkPause, type Reassignment } from "./pillarPlanning";
import { type PlanningProject, type Staff } from "./planning";
import { confirmPlanning } from "./confirmPlanning";

export type QuickWork = { projectId: number; stageId: string; personId?: number; date: string; end?: string; x: number; y: number };
export type QuickDelivery = { projectId: number; date: string; x: number; y: number };

function QuickPanel({ x, y, title, busy, onClose, children }: {
  x: number; y: number; title: string; busy: boolean; onClose: () => void; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    const place = () => {
      const box = panel.current?.getBoundingClientRect();
      if (box) setPosition({ left: Math.max(12, Math.min(x + 8, window.innerWidth - box.width - 12)), top: Math.max(12, Math.min(y + 8, window.innerHeight - box.height - 12)) });
    };
    place();
    window.addEventListener("resize", place);
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    return () => { window.removeEventListener("resize", place); observer.disconnect(); };
  }, [x, y]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<div className="mp-quick-layer" onPointerDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="mp-quick-panel" ref={panel} style={position} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      onKeyDown={e => {
        if (e.key === "Escape") {
          e.preventDefault(); e.stopPropagation();
          const calendar = panel.current?.querySelector<HTMLElement>("[popover]:popover-open");
          if (calendar) {
            calendar.hidePopover();
            [...(panel.current?.querySelectorAll<HTMLButtonElement>("button[aria-controls]") || [])].find(b => b.getAttribute("aria-controls") === calendar.id)?.focus();
          } else if (!busy) onClose();
        }
        if (e.key !== "Tab") return;
        const elements = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') || [])].filter(el => el.getClientRects().length);
        const first = elements[0], last = elements.at(-1);
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { e.preventDefault(); first.focus(); }
      }}>
      <header><strong>{title}</strong><button type="button" disabled={busy} onClick={onClose} aria-label="关闭快捷操作">×</button></header>
      {children}
    </div>
  </div>, document.body);
}

export default function QuickWorkActions({ request, projects, staff, disabled, onPersist, onReassign, onBusy, onClose, onDetails }: {
  request: QuickWork; projects: PlanningProject[]; staff: Staff[]; disabled: boolean;
  onPersist: (p: PlanningProject) => Promise<PlanningProject>; onReassign: (r: Reassignment) => Promise<void>;
  onBusy: (v: boolean) => void; onClose: () => void; onDetails: () => void;
}) {
  const project = projects.find(p => p.id === request.projectId), stage = project?.stages.find(s => s.id === request.stageId);
  const [from, setFrom] = useState(request.date), [to, setTo] = useState(request.end || stage?.end || request.date);
  const [person, setPerson] = useState(request.personId || stage?.assignees[0] || 0);
  const [target, setTarget] = useState(0), [work, setWork] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => () => onBusy(false), [onBusy]);
  if (!project || !stage) return null;
  const blocked = busy || disabled || project.archived;
  async function run(kind: "pause" | "resume" | "transfer" | "progress" | "delete", progress?: number) {
    if (lock.current || blocked || !project || !stage) return;
    lock.current = true; setBusy(true); onBusy(true); setError("");
    try {
      if (kind === "delete") {
        if (!await confirmPlanning(`删除“${project.name} · ${stage.name}”？这会删除整项${stage.milestone ? "交付节点" : "工作及所有参与人员的泳道"}。`)) return;
        await onPersist({ ...project, stages: project.stages.filter(s => s.id !== stage.id) });
      } else if (kind === "transfer") {
        // Validate the same selected-person interval before invoking the atomic two-project API.
        adjustWorkPause(stage, person, from, to);
        const dest = projects.find(p => p.id === target && !p.archived && p.id !== project.id);
        if (!dest || !staff.some(s => s.id === person && s.is_active)) throw Error("请选择在用人员和支援项目");
        if (!work.trim()) throw Error("请填写支援工作内容");
        await onReassign({ source_project_id: project.id!, source_stage_id: stage.id, source_version: project.version,
          target_project_id: dest.id!, target_version: dest.version, person_id: person, start: from, end: to, work: work.trim() });
      } else {
        const updated = kind === "progress" ? { ...stage, progress: progress! } : adjustWorkPause(stage, person, from, to, kind === "resume");
        await onPersist({ ...project, stages: project.stages.map(s => s.id === stage.id ? updated : s) });
      }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，选择已保留，请重试"); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  return <QuickPanel {...request} title="快捷调整工作" busy={busy} onClose={onClose}>
    <p className="mp-quick-context"><b>{project.name} · {stage.name}</b><span>{stage.start}—{stage.end}</span></p>
    <fieldset disabled={blocked}>
      <label>完成进度<select aria-label="快捷完成进度" value={stage.progress} onChange={e => void run("progress", Number(e.target.value))}>
        {[...new Set([0, 25, 50, 75, 100, stage.progress])].sort((a, b) => a - b).map(v => <option key={v} value={v}>{v}%</option>)}
      </select></label>
      {!stage.milestone && <>
        <label>人员<select aria-label="快捷调整人员" value={person} onChange={e => setPerson(Number(e.target.value))}>
          <option value={0}>选择参与人员</option>{stage.assignees.map(id => <option key={id} value={id}>{staff.find(s => s.id === id)?.name || `#${id}`}</option>)}
        </select></label>
        <div className="mp-quick-dates"><label>从<PlanningDate label="快捷开始日期" required min={stage.start} max={stage.end} value={from} onChange={setFrom} /></label>
          <label>至（含当天）<PlanningDate label="快捷结束日期" required min={from || stage.start} max={stage.end} value={to} onChange={setTo} /></label></div>
        <div className="mp-quick-buttons"><button type="button" onClick={() => void run("pause")}>暂停所选时段</button><button type="button" onClick={() => void run("resume")}>恢复所选时段</button></div>
        <label>支援项目<select aria-label="快捷支援项目" value={target} onChange={e => setTarget(Number(e.target.value))}><option value={0}>选择其他项目</option>{projects.filter(p => p.id !== project.id && !p.archived).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>支援工作<input aria-label="快捷支援工作" maxLength={250} placeholder="填写要支援的工作" value={work} onChange={e => setWork(e.target.value)} /></label>
        <button type="button" className="mp-primary" onClick={() => void run("transfer")}>中断并支援项目</button>
        <small>只调整所选人员与日期。原交付日保留；无人接替时会标记暂停。恢复原工作不会删除支援安排。</small>
      </>}
    </fieldset>
    {error && <p className="mp-quick-error" role="alert">{error}</p>}
    <footer className="mp-quick-work-footer"><span>{busy ? "正在保存…" : "选择操作后直接保存"}</span>
      <div><button type="button" className="mp-quick-delete" disabled={blocked} onClick={() => void run("delete")}>{stage.milestone ? "删除交付节点" : "删除泳道"}</button>
        <button type="button" disabled={blocked} onClick={onDetails}>详细编辑</button></div>
    </footer>
  </QuickPanel>;
}

export function QuickDeliveryInsert({ request, project, disabled, onInsert, onClose }: {
  request: QuickDelivery; project: PlanningProject; disabled: boolean;
  onInsert: (name: string, date: string, deliverable: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState(""), [date, setDate] = useState(request.date), [deliverable, setDeliverable] = useState("");
  const full = project.stages.length >= 200;
  return <QuickPanel {...request} title="插入交付节点" busy={false} onClose={onClose}>
    <p className="mp-quick-context">{project.name}</p>
    <form onSubmit={e => { e.preventDefault(); if (name.trim() && date) onInsert(name.trim(), date, deliverable.trim()); }}>
      <fieldset disabled={disabled || full}>
        <label>节点名称<input aria-label="快捷交付节点名称" required maxLength={250} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>交付日期<PlanningDate label="快捷交付日期" required value={date} onChange={setDate} /></label>
        <label>交付物（选填）<input aria-label="快捷交付物" maxLength={1000} value={deliverable} onChange={e => setDeliverable(e.target.value)} /></label>
        <button type="submit" className="mp-primary">插入甘特图</button>
      </fieldset>
      {full && <p className="mp-quick-error" role="alert">该项目工作数量已达上限，请先整理工作或节点。</p>}
    </form>
  </QuickPanel>;
}
