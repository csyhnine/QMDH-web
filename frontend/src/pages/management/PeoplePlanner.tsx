import { useEffect, useRef, useState, type DragEvent } from "react";
import PeopleSchedule from "./PeopleSchedule";
import {
  ganttEntries,
  staffLoads,
  dayNumber,
  savePlanQueue,
  TEAM_ROLES,
  staffAffiliation,
  projectTint,
  scheduledWeek,
  type PlanningProject,
  type Staff,
  type Stage,
} from "./planning";
import { changePeoplePlan, projectColor, type PeopleChange } from "./staffPlanning";
import usePlanningAutoSave from "./usePlanningAutoSave";

type DragItem =
  | { kind: "person"; personId: number }
  | { kind: "stage"; projectId: number; stageId: string; personId: number; anchor: string };
export default function PeoplePlanner({
  projects,
  workloadProjects,
  staff,
  start,
  days,
  personFilter,
  archived,
  onEdit,
  onPersist,
  onDirty,
  onBusy,
  autoSave = true,
}: {
  projects: PlanningProject[];
  workloadProjects: PlanningProject[];
  staff: Staff[];
  start: string;
  days: number;
  personFilter: number;
  archived: boolean;
  onEdit: (p: PlanningProject) => void;
  onPersist: (p: PlanningProject) => Promise<PlanningProject>;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
  autoSave?: boolean;
}) {
  const [pending, setPending] = useState<Record<number, PlanningProject>>({});
  const [autoFailed, setAutoFailed] = useState(false);
  const edits = useRef(pending),
    lock = useRef(false),
    mounted = useRef(true),
    drag = useRef<DragItem | null>(null);
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const [query, setQuery] = useState(""),
    [availability, setAvailability] = useState("all"),
    [selectedPerson, setSelectedPerson] = useState(0);
  const [showRoster, setShowRoster] = useState(false), [showAssignment, setShowAssignment] = useState(false), [compact, setCompact] = useState(true);
  const [affiliation, setAffiliation] = useState("all");
  const [projectId, setProjectId] = useState(0),
    [stageId, setStageId] = useState("");
  const preview = projects.map((p) => pending[p.id!] || p);
  const allPreview = workloadProjects.map((p) => pending[p.id!] || p);
  const project = preview.find((p) => p.id === projectId) || preview[0];
  const stage = project?.stages.find((s) => s.id === stageId) || project?.stages[0];
  const entries = ganttEntries(allPreview, start, days);
  const loads = (id: number) => staffLoads(entries, id, days);
  const peak = (id: number) => Math.max(0, ...loads(id));
  const active = staff.filter((s) => s.is_active);
  const roster = active.filter(
    (s) =>
      `${s.name} ${s.position} ${staffAffiliation(s)}`.includes(query.trim()) &&
      (affiliation === "all" || (s.employment_type || "unknown") === affiliation) &&
      (availability === "all" || (availability === "available" ? loads(s.id).some((v) => v < 100) : peak(s.id) > 100)),
  );
  const names = (ids: number[]) =>
    ids.map((id) => staff.find((s) => s.id === id)?.name || `#${id}`).join("、") || "未安排";
  const changed = Object.keys(pending).length,
    blocked = archived || saving;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onDirty(changed > 0);
    return () => onDirty(false);
  }, [changed, onDirty]);
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  function write(next: Record<number, PlanningProject>) {
    edits.current = next;
    if (mounted.current) setPending(next);
  }
  function apply(id: number, change: PeopleChange) {
    if (lock.current || archived) return;
    const source = edits.current[id] || projects.find((p) => p.id === id);
    if (!source) return;
    try {
      const next = changePeoplePlan(source, staff, change);
      if (JSON.stringify(next) === JSON.stringify(source)) return;
      const updated = { ...edits.current, [id]: next };
      if (JSON.stringify(next) === JSON.stringify(projects.find((p) => p.id === id))) delete updated[id];
      write(updated);
      setAutoFailed(false);
      setMessage(autoSave ? "调整已预览，稍后自动保存…" : "调整已预览，确认后点击“保存人员与排期”。");
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
          : "人员与排期已保存。",
      );
    }
  }
  usePlanningAutoSave(changed ? JSON.stringify(pending) : null, autoSave, saving || archived || autoFailed, save);
  function begin(event: DragEvent, item: DragItem) {
    if (blocked || lock.current) {
      event.preventDefault();
      return;
    }
    drag.current = item;
    event.dataTransfer.setData("application/x-qmdh-people-plan", item.kind);
    event.dataTransfer.effectAllowed = "move";
  }
  function accept(event: DragEvent, kind: DragItem["kind"]) {
    if (!blocked && drag.current?.kind === kind) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }
  function dropPerson(event: DragEvent, target: (id: number) => void) {
    event.preventDefault();
    event.stopPropagation();
    const item = drag.current;
    drag.current = null;
    if (!blocked && item?.kind === "person") target(item.personId);
  }
  function select(p: PlanningProject, s?: Stage) {
    setShowAssignment(true);
    setProjectId(p.id!);
    setStageId(s?.id || "");
  }
  function open(p: PlanningProject) {
    if (changed || lock.current) setMessage("请先保存或撤销调整，再打开项目详情。");
    else onEdit(p);
  }
  return (
    <div className={`mp-people-workspace${compact ? " mp-compact" : ""}`}><div className="mp-density-controls"><button aria-pressed={showRoster} onClick={() => setShowRoster(!showRoster)}>选人面板</button><button aria-pressed={showAssignment} onClick={() => setShowAssignment(!showAssignment)}>安排工作</button><label><input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)} />紧凑显示</label></div>
      <div className="mp-people-intro">
        <div>
          <strong>看人员，安排多个项目</strong>
          <p>① 选人员　② 拖到阶段或管理分工　③ {autoSave ? "自动保存" : "确认保存"}</p>
        </div>
        <span>
          {active.length} 位可选人员 · {preview.length} 个显示项目
        </span>
      </div>
      {changed > 0 && (
        <div className="mp-pending" role="status">
          <div>
            <strong>{changed} 个项目待保存</strong>
            <span>{autoSave ? "调整后约1秒自动保存；失败会保留调整，可手动重试。" : "甘特条和负荷已按调整预览，尚未写入服务器。"}</span>
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
          <button className="mp-primary" disabled={saving} onClick={save}>
            {saving ? "正在保存…" : "保存人员与排期"}
          </button>
        </div>
      )}
      {message && (
        <p className="mp-people-message" role="status">
          {message}
        </p>
      )}
      <div className={`mp-people-layout${showRoster ? " has-roster" : ""}${showAssignment ? " has-editor" : ""}`}>
        {showRoster && <aside className="mp-roster-panel" aria-label="可选员工与管理人员">
          <h3>可选人员</h3>
          <p>显示职务，管理分工可在右侧安排。</p>
          <input
            aria-label="搜索姓名或职务"
            placeholder="搜索姓名 / 职务"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select aria-label="人员可用情况" value={availability} onChange={(e) => setAvailability(e.target.value)}>
            <option value="all">全部在用人员</option>
            <option value="available">有余量的人员</option>
            <option value="over">有超额安排</option>
          </select>
          <select aria-label="排期人员归属" value={affiliation} onChange={e => setAffiliation(e.target.value)}>
            <option value="all">内部与外包</option><option value="internal">QMDH 内部</option><option value="external">外包人员</option><option value="unknown">归属待确认</option>
          </select>
          <div className="mp-roster-list">
            {roster.map((s) => (
              <button
                key={s.id}
                className={`mp-roster-card${selectedPerson === s.id ? " selected" : ""}`}
                aria-pressed={selectedPerson === s.id}
                disabled={blocked}
                draggable={!blocked}
                onClick={() => setSelectedPerson(s.id)}
                onDragStart={(e) => begin(e, { kind: "person", personId: s.id })}
                onDragEnd={() => {
                  drag.current = null;
                }}
              >
                <span className="mp-avatar">{s.name.slice(-2)}</span>
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.position || "项目成员"}</small>
                  <small className={`mp-affiliation ${s.employment_type || "unknown"}`}>{staffAffiliation(s)}</small>
                  <small className={peak(s.id) > 100 ? "mp-danger-text" : ""}>
                    {peak(s.id)
                      ? `最高 ${peak(s.id)}% · ${new Set(entries.filter((e) => e.stage.assignees.includes(s.id)).map((e) => e.project.id)).size} 个项目`
                      : "本窗口尚未排期"}
                  </small>
                </span>
                <span aria-hidden="true">⠿</span>
              </button>
            ))}
          </div>
          {!roster.length && (
            <p className="mp-empty">{active.length ? "没有匹配人员，请调整搜索或筛选。" : "先在人员名册添加员工。"}</p>
          )}
          <small>有余量指窗口内至少一天低于100%，仍需检查具体日期。</small>
        </aside>}
        <div className="mp-people-main">
          <div className="mp-people-summary">
            <span>
              <b>{active.filter((s) => peak(s.id) > 100).length}</b> 人有超额安排
            </span>
            <small>负荷合计覆盖所选年度全部项目，包含被筛选隐藏的安排。</small>
          </div>
          <div className="mp-project-colors">
            {preview.map((p) => (
              <button key={p.id} style={{ borderLeftColor: projectTint(p) }} onClick={() => select(p)}>
                {p.name} · {scheduledWeek(p, start, days).people.length} 人
              </button>
            ))}
          </div>
          <PeopleSchedule
            projects={preview}
            workloadProjects={allPreview}
            staff={staff.filter((s) => !personFilter || s.id === personFilter)}
            start={start}
            days={days}
            onEdit={(p) => open(p)}
            onSelect={select}
            selectedPerson={selectedPerson}
            disabled={blocked}
            onStageDrag={(event, p, s, id, anchor) =>
              begin(event, { kind: "stage", projectId: p.id!, stageId: s.id, personId: id, anchor })
            }
            onDragEnd={() => {
              drag.current = null;
            }}
            onDateDragOver={(e) => accept(e, "stage")}
            onDateDrop={(event, id, date) => {
              event.preventDefault();
              const item = drag.current;
              drag.current = null;
              if (item?.kind === "stage")
                apply(item.projectId, {
                  kind: "move",
                  stageId: item.stageId,
                  fromPerson: item.personId,
                  personId: id,
                  offset: dayNumber(date) - dayNumber(item.anchor),
                });
            }}
            onStageDragOver={(e) => accept(e, "person")}
            onStageDrop={(event, p, s) =>
              dropPerson(event, (id) => apply(p.id!, { kind: "assign", stageId: s.id, personId: id }))
            }
          />
          <p className="mp-help">
            拖工作条到目标人员的日期格可改期或转交。多人阶段共享日期，改期会影响该阶段所有人；转交只替换拖动的这一人。也可点击工作条，在右侧调整日期及人员。
          </p>
        </div>
        {showAssignment && <aside className="mp-assignment-panel" aria-label="人员与管理分工安排">
          <h3>安排到项目</h3>
          <select
            aria-label="选择安排项目"
            disabled={saving}
            value={project?.id || ""}
            onChange={(e) => {
              setProjectId(Number(e.target.value));
              setStageId("");
            }}
          >
            {!preview.length && <option value="">暂无项目</option>}
            {preview.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {scheduledWeek(p, start, days).people.length} 人
              </option>
            ))}
          </select>
          {project ? (
            <>
              <p className="mp-selected-person">
                {selectedPerson ? `已选：${names([selectedPerson])}` : "先点选左侧人员，或直接拖入下面的安排区。"}
              </p>
              <h4>阶段工作</h4>
              <div className="mp-stage-targets">
                {project.stages.map((s) => (
                  <div
                    key={s.id}
                    className={`mp-stage-target${stage?.id === s.id ? " selected" : ""}`}
                    onDragOver={(e) => accept(e, "person")}
                    onDrop={(e) =>
                      dropPerson(e, (id) => {
                        select(project, s);
                        apply(project.id!, { kind: "assign", stageId: s.id, personId: id });
                      })
                    }
                  >
                    <button aria-pressed={stage?.id === s.id} onClick={() => select(project, s)}>
                      <strong>{s.name}</strong>
                      <small>
                        {s.start} — {s.end}
                      </small>
                      <small>
                        {names(s.assignees)} · 每人 {s.allocation}%
                      </small>
                    </button>
                    <button
                      disabled={blocked || !selectedPerson || s.assignees.includes(selectedPerson)}
                      onClick={() => {
                        select(project, s);
                        apply(project.id!, { kind: "assign", stageId: s.id, personId: selectedPerson });
                      }}
                    >
                      ＋ 安排所选人员
                    </button>
                  </div>
                ))}
              </div>
              {!project.stages.length && <p className="mp-help">先补充阶段工作与日期，再安排人员。</p>}
              {stage && (
                <div className="mp-stage-adjustment" key={`${project.id}:${stage.id}`}>
                  <h4>{stage.name} · 调整安排</h4>
                  <div className="mp-assignee-chips">
                    {stage.assignees.map((id) => (
                      <button
                        key={id}
                        disabled={blocked}
                        aria-label={`移除阶段人员${names([id])}`}
                        onClick={() => apply(project.id!, { kind: "remove", stageId: stage.id, personId: id })}
                      >
                        {names([id])} ×
                      </button>
                    ))}
                  </div>
                  <StageDates
                    stage={stage}
                    disabled={blocked}
                    onApply={(from, to) =>
                      apply(project.id!, { kind: "dates", stageId: stage.id, start: from, end: to })
                    }
                  />
                </div>
              )}
              <h4>项目管理分工</h4>
              <p className="mp-help">标明项目责任，不自动占用排期，不授予系统权限。</p>
              <div className="mp-role-targets">
                {TEAM_ROLES.map(([role, label]) => (
                  <div
                    key={role}
                    onDragOver={(e) => accept(e, "person")}
                    onDrop={(e) => dropPerson(e, (id) => apply(project.id!, { kind: "role", role, personId: id }))}
                  >
                    <strong>{label}</strong>
                    <div className="mp-assignee-chips">
                      {project.team[role].map((id) => (
                        <button
                          key={id}
                          disabled={blocked}
                          aria-label={`移除${label}${names([id])}`}
                          onClick={() => apply(project.id!, { kind: "role", role, personId: id, remove: true })}
                        >
                          {names([id])} ×
                        </button>
                      ))}
                    </div>
                    <button
                      disabled={blocked || !selectedPerson || project.team[role].includes(selectedPerson)}
                      onClick={() => apply(project.id!, { kind: "role", role, personId: selectedPerson })}
                    >
                      ＋ {selectedPerson ? names([selectedPerson]) : "先选人员"}
                    </button>
                  </div>
                ))}
              </div>
              <button className="mp-project-detail" disabled={saving} onClick={() => open(project)}>
                {project.stages.length ? "编辑项目 / 新增阶段 ↗" : "补充阶段工作与日期 ↗"}
              </button>
            </>
          ) : (
            <p className="mp-empty">先创建项目，再选择员工安排工作。</p>
          )}
        </aside>}
      </div>
      {changed > 0 && (
        <details className="mp-change-list" open>
          <summary>调整记录 · 冲突时可先复制保留</summary>
          {Object.values(pending).map((p) => (
            <div key={p.id}>
              <strong>{p.name}</strong>
              {p.stages.map((s) => {
                const before = projects.find((v) => v.id === p.id)?.stages.find((v) => v.id === s.id);
                return before && JSON.stringify(before) !== JSON.stringify(s) ? (
                  <p key={s.id}>
                    <b>{s.name}</b>
                    <span>
                      原安排：{before.start} — {before.end} · {names(before.assignees)}
                    </span>
                    <span>
                      调整为：{s.start} — {s.end} · {names(s.assignees)}
                    </span>
                  </p>
                ) : null;
              })}
              {TEAM_ROLES.map(([role, label]) => {
                const before = projects.find((v) => v.id === p.id)?.team[role] || [];
                return JSON.stringify(before) !== JSON.stringify(p.team[role]) ? (
                  <p key={role}>
                    {label}：{names(before)} → {names(p.team[role])}
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
function StageDates({
  stage,
  disabled,
  onApply,
}: {
  stage: Stage;
  disabled: boolean;
  onApply: (start: string, end: string) => void;
}) {
  const [from, setFrom] = useState(stage.start),
    [to, setTo] = useState(stage.end);
  useEffect(() => {
    setFrom(stage.start);
    setTo(stage.end);
  }, [stage.start, stage.end]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onApply(from, stage.milestone ? from : to);
      }}
    >
      <label>
        开始日期
        <input
          aria-label="阶段开始日期"
          type="date"
          required
          disabled={disabled}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      {!stage.milestone && (
        <label>
          结束日期
          <input
            aria-label="阶段结束日期"
            type="date"
            min={from}
            required
            disabled={disabled}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      )}
      <button type="submit" disabled={disabled}>
        应用日期调整
      </button>
    </form>
  );
}
