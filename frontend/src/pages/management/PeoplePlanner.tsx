import { useEffect, useRef, useState, type DragEvent } from "react";
import PeopleSchedule from "./PeopleSchedule";
import { dayNumber, projectTint, savePlanQueue, scheduledWeek, type PlanningProject, type Staff } from "./planning";
import { changePeoplePlan, type PeopleChange } from "./staffPlanning";
import type { WorkRequest } from "./PlanningDesk";
import type { SchedulePeriod } from "./scheduleCalendar";
import usePlanningAutoSave from "./usePlanningAutoSave";
import QuickWorkActions, { type QuickWork } from "./QuickWorkActions";
import type { Reassignment } from "./pillarPlanning";

type DragItem = { projectId: number; stageId: string; personId: number; anchor: string };
export default function PeoplePlanner({
  projects,
  workloadProjects,
  staff,
  start,
  days,
  period,
  fitDates,
  onZoom,
  onResetZoom,
  personFilter,
  archived,
  disabled = false,
  onOpen,
  onPersist,
  onReassign,
  onDirty,
  onBusy,
  autoSave = true,
}: {
  projects: PlanningProject[];
  workloadProjects: PlanningProject[];
  staff: Staff[];
  start: string;
  days: number;
  period: SchedulePeriod;
  fitDates: boolean;
  onZoom: (start: string, days: number) => void;
  onResetZoom: () => void;
  personFilter: number;
  archived: boolean;
  disabled?: boolean;
  onOpen: (request: WorkRequest) => void;
  onPersist: (p: PlanningProject) => Promise<PlanningProject>;
  onReassign: (r: Reassignment) => Promise<void>;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
  autoSave?: boolean;
}) {
  const [pending, setPending] = useState<Record<number, PlanningProject>>({});
  const [quick, setQuick] = useState<QuickWork | null>(null), [quickBusy, setQuickBusy] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [autoFailed, setAutoFailed] = useState(false),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const edits = useRef(pending),
    lock = useRef(false),
    mounted = useRef(true),
    drag = useRef<DragItem | null>(null);
  const preview = projects.map((p) => pending[p.id!] || p),
    allPreview = workloadProjects.map((p) => pending[p.id!] || p);
  const changed = Object.keys(pending).length,
    blocked = archived || saving || disabled || quickBusy;
  const names = (ids: number[]) =>
    ids.map((id) => staff.find((s) => s.id === id)?.name || `#${id}`).join("、") || "未安排";
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onDirty(changed > 0 || Boolean(quick) || resizing);
    return () => onDirty(false);
  }, [changed, Boolean(quick), resizing, onDirty]);
  useEffect(() => {
    onBusy(saving || quickBusy || resizing);
    return () => onBusy(false);
  }, [saving, quickBusy, resizing, onBusy]);
  function write(next: Record<number, PlanningProject>) {
    edits.current = next;
    if (mounted.current) setPending(next);
  }
  function apply(id: number, change: PeopleChange) {
    if (lock.current || archived || disabled) return;
    const source = edits.current[id] || projects.find((p) => p.id === id);
    if (!source) return;
    try {
      const next = changePeoplePlan(source, staff, change);
      if (JSON.stringify(next) === JSON.stringify(source)) return;
      const updated = { ...edits.current, [id]: next };
      if (JSON.stringify(next) === JSON.stringify(projects.find((p) => p.id === id))) delete updated[id];
      write(updated);
      setAutoFailed(false);
      setMessage(autoSave ? "" : "调整已预览，确认后点击“保存人员与排期”。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "调整失败，请重试。");
    }
  }
  async function save() {
    if (lock.current || archived || !Object.keys(edits.current).length) return;
    lock.current = true;
    setSaving(true);
    setMessage("");
    const failure = await savePlanQueue(Object.values(edits.current), onPersist, (id) => {
      const next = { ...edits.current };
      delete next[id];
      write(next);
    });
    lock.current = false;
    if (mounted.current) {
      setAutoFailed(Boolean(failure));
      setSaving(false);
      setMessage(
        failure
          ? `${failure instanceof Error ? failure.message : "保存失败"}。未保存调整仍保留；版本冲突时请先复制下方调整记录。`
          : "",
      );
    }
  }
  usePlanningAutoSave(changed ? JSON.stringify(pending) : null, autoSave, saving || archived || autoFailed || resizing, save);

  function open(request: Omit<WorkRequest, "nonce">) {
    if (changed || lock.current) {
      setMessage("请先保存或撤销调整，再编辑工作卡片。");
      return;
    }
    if (!blocked) onOpen({ ...request, nonce: crypto.randomUUID() });
  }
  function begin(event: DragEvent, item: DragItem) {
    if (blocked || lock.current) {
      event.preventDefault();
      return;
    }
    drag.current = item;
    event.dataTransfer.setData("application/x-qmdh-people-plan", "stage");
    event.dataTransfer.effectAllowed = "move";
  }
  function openQuick(request: QuickWork) {
    if (changed || lock.current) { setMessage("请等待当前调整保存；保存失败时可重试。"); return; }
    if (!blocked) setQuick(request);
  }
  return (
    <div className="mp-people-workspace mp-compact">
      {changed > 0 && (!autoSave || autoFailed) && (
        <div className="mp-pending" role="status">
          <div>
            <strong>{changed} 个项目待保存</strong>
            <span>{autoSave ? "调整后约1秒自动保存；失败会保留调整，可手动重试。" : "调整尚未保存。"}</span>
          </div>
          <button
            disabled={saving}
            onClick={() => {
              write({});
              setMessage("已撤销本次调整。");
            }}
          >
            撤销调整
          </button>
          <button className="mp-primary" disabled={saving} onClick={() => void save()}>
            {saving ? "正在保存…" : "保存人员与排期"}
          </button>
        </div>
      )}
      {message && (
        <p className="mp-people-message" role="status">
          {message}
        </p>
      )}
      <div className="mp-calendar-summary">
        <div className="mp-project-colors">
          {preview.map((p) => (
            <span key={p.id} style={{ borderLeftColor: projectTint(p) }}>
              {p.name} · {scheduledWeek(p, start, days).people.length} 人
            </span>
          ))}
        </div>
        <small>上下端调整起止 · ⠿ 整项平移或转交 · 柱体划选暂停或支援</small>
      </div>
      <PeopleSchedule
        projects={preview}
        workloadProjects={allPreview}
        staff={staff.filter((s) => !personFilter || s.id === personFilter)}
        start={start}
        days={days}
        period={period}
        fitDates={fitDates}
        onZoom={onZoom}
        onResetZoom={onResetZoom}
        onResize={(p, s, edge, offset) => apply(p.id!, { kind: "resize", stageId: s.id, edge, offset })}
        onResizeBusy={setResizing}
        disabled={blocked}
        onSelect={(p, s, personId, date, x, y) => openQuick({ projectId: p.id!, stageId: s.id, personId, date, x, y })}
        onSegment={(p,s,personId,date,end,x,y)=>openQuick({projectId:p.id!,stageId:s.id,personId,date,end,x,y})}
        onAdd={(personId, date) => open({ personId, date })}
        onStageDrag={(event, p, s, personId, anchor) =>
          begin(event, { projectId: p.id!, stageId: s.id, personId, anchor })
        }
        onDragEnd={() => {
          drag.current = null;
        }}
        onDateDragOver={(event) => {
          if (!blocked && drag.current) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDateDrop={(event, personId, date) => {
          event.preventDefault();
          const item = drag.current;
          drag.current = null;
          if (item && !blocked)
            apply(item.projectId, {
              kind: "move",
              stageId: item.stageId,
              fromPerson: item.personId,
              personId,
              offset: dayNumber(date) - dayNumber(item.anchor),
            });
        }}
      />
      {quick && <QuickWorkActions key={`${quick.projectId}:${quick.stageId}:${quick.date}:${quick.end}`} request={quick} projects={workloadProjects} staff={staff} disabled={archived || disabled || saving}
        onPersist={onPersist} onReassign={onReassign} onBusy={setQuickBusy} onClose={() => setQuick(null)} onDetails={() => { setQuick(null); onDirty(false); open({ projectId: quick.projectId, stageId: quick.stageId, personId: quick.personId, date: quick.date }); }} />}
      {changed > 0 && (!autoSave || autoFailed) && (
        <details className="mp-change-list">
          <summary>未保存调整 · 冲突时可复制保留</summary>
          {Object.values(pending).map((p) => (
            <div key={p.id}>
              <strong>{p.name}</strong>
              {p.stages.map((s) => {
                const before = projects.find((v) => v.id === p.id)?.stages.find((v) => v.id === s.id);
                return before && JSON.stringify(before) !== JSON.stringify(s) ? (
                  <p key={s.id}>
                    <b>{s.name}</b>
                    <span>
                      原安排：{before.start}—{before.end} · {names(before.assignees)}
                    </span>
                    <span>
                      调整为：{s.start}—{s.end} · {names(s.assignees)}
                    </span>
                  </p>
                ) : null;
              })}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
