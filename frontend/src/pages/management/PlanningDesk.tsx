import { useEffect, useRef, useState } from "react";
import PlanningDate from "./PlanningDate";
import WeeklyBrief from "./WeeklyBrief";
import { addDays, projectTint, today, weekRange, type PlanningProject, type Staff, type Stage } from "./planning";
import { pauseWarnings, type Reassignment } from "./pillarPlanning";
export type WorkRequest = {
  nonce: string;
  projectId?: number;
  stageId?: string;
  personId?: number;
  date: string;
  end?: string;
  intent?: "segment";
};
export default function PlanningDesk({
  projects,
  staff,
  disabled,
  onPersist,
  onDirty,
  onBusy,
  autoSave = true,
  request,
  onRequestHandled,
  rangeStart = today(),
  rangeDays = 7,
  onReassign,
}: {
  projects: PlanningProject[];
  staff: Staff[];
  disabled: boolean;
  onPersist: (p: PlanningProject) => Promise<PlanningProject>;
  onDirty: (v: boolean) => void;
  onBusy?: (v: boolean) => void;
  autoSave?: boolean;
  request?: WorkRequest | null;
  onRequestHandled?: () => void;
  rangeStart?: string;
  rangeDays?: number;
  onReassign: (r: Reassignment) => Promise<void>;
}) {
  const [selected, setSelected] = useState(0),
    [open, setOpen] = useState(false),
    [editor, setEditor] = useState<{ project: PlanningProject; stage: Stage; fresh: boolean } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [briefDirty, setBriefDirty] = useState(false),
    [briefBusy, setBriefBusy] = useState(false);
  const [segment, setSegment] = useState(false),
    [from, setFrom] = useState(today()),
    [to, setTo] = useState(today()),
    [person, setPerson] = useState(0),
    [target, setTarget] = useState(0),
    [work, setWork] = useState("");
  const [note, setNote] = useState("");
  const lock = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    onDirty(Boolean(editor) || briefDirty);
    return () => onDirty(false);
  }, [Boolean(editor), briefDirty, onDirty]);
  useEffect(() => {
    onBusy?.(busy || briefBusy);
    return () => onBusy?.(false);
  }, [busy, briefBusy, onBusy]);
  const project = projects.find((p) => p.id === selected) || projects[0],
    week = weekRange(today()).start;
  const warnings = pauseWarnings(projects).filter(
    (w) => w.end >= rangeStart && w.start <= addDays(rangeStart, rangeDays - 1),
  );
  function begin(p: PlanningProject, s?: Stage, r?: WorkRequest) {
    if (disabled || briefDirty) return;
    const date = r?.date || today();
    setEditor({
      project: structuredClone(p),
      fresh: !s,
      stage: s
        ? structuredClone(s)
        : {
            id: crypto.randomUUID(),
            name: "",
            start: date,
            end: r?.end || date,
            assignees: r?.personId ? [r.personId] : [],
            progress: 0,
            allocation: 100,
            milestone: !r,
            notes: "",
            deliverable: "",
            pauses: [],
            updates: [],
          },
    });
    setSegment(r?.intent === "segment");
    setFrom(date >= (s?.start || date) ? date : s!.start);
    setTo(r?.end || date);
    setPerson(r?.personId || s?.assignees[0] || 0);
    setTarget(projects.find((x) => x.id !== p.id && !x.archived)?.id || 0);
    setWork(s?.name || "");
    setError("");
    setNote("");
  }
  useEffect(() => {
    if (!request) return;
    const p = projects.find((p) => p.id === request.projectId) || project;
    if (p)
      begin(
        p,
        p.stages.find((s) => s.id === request.stageId),
        request,
      );
    onRequestHandled?.();
  }, [request]);
  const patch = (value: Partial<Stage>) => setEditor((e) => (e ? { ...e, stage: { ...e.stage, ...value } } : e));
  async function save(remove = false) {
    if (!editor || lock.current || disabled) return;
    if (remove && !window.confirm("删除这项工作或节点？")) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const p = editor.project,
        s = { ...editor.stage };
      if (segment && !remove) {
        const dest = projects.find((p) => p.id === target);
        if (!dest || !person) throw Error("请选择人员和支援项目");
        await onReassign({
          source_project_id: p.id!,
          source_stage_id: s.id,
          source_version: p.version,
          target_project_id: dest.id!,
          target_version: dest.version,
          person_id: person,
          start: from,
          end: to,
          work,
        });
      } else {
        if (note.trim())
          s.updates = [...(s.updates || []), { id: crypto.randomUUID(), date: today(), note: note.trim() }];
        if (editor.fresh && p.stages.length >= 200) throw Error("该项目工作数量已达上限");
        await onPersist({
          ...p,
          stages: remove
            ? p.stages.filter((x) => x.id !== s.id)
            : editor.fresh
              ? [...p.stages, s]
              : p.stages.map((x) => (x.id === s.id ? s : x)),
        });
      }
      if (alive.current) setEditor(null);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "保存失败，输入已保留");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="mp-planning-desk">
      <div className="mp-desk-heading">
        <button disabled={briefDirty || briefBusy} aria-expanded={open} onClick={() => setOpen(!open)}>
          关键总览 · 上周推进 / 下周安排 / 交付节点 {open ? "收起 ▴" : "展开 ▾"}
        </button>
        <select
          aria-label="关键总览项目"
          disabled={busy || briefDirty || briefBusy}
          value={project?.id || ""}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {!projects.length && <option>暂无项目</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {project && (
          <span style={{ borderLeft: `5px solid ${projectTint(project)}`, paddingLeft: 8 }}>
            {new Set(project.stages.flatMap((s) => s.assignees)).size} 人参与排期 ·{" "}
            {project.stages.filter((s) => s.milestone).length} 个交付节点
          </span>
        )}
      </div>
      {warnings.length > 0 && (
        <details className="mp-pause-warnings" open>
          <summary>⚠ {warnings.length} 段工作暂停，暂无人员接替</summary>
          {warnings.map((w) => (
            <button
              key={`${w.project.id}:${w.stage.id}:${w.start}`}
              disabled={disabled}
              onClick={() => begin(w.project, w.stage, { nonce: "warning", date: w.start })}
            >
              ⚠ {w.project.name} · {w.stage.name} · {w.start}—{w.end} · 无人接替
            </button>
          ))}
        </details>
      )}
      {open && project && (
        <>
          <WeeklyBrief
            key={`${project.id}:${week}`}
            project={project}
            week={week}
            disabled={disabled}
            autoSave={autoSave}
            onPersist={onPersist}
            onDirty={setBriefDirty}
            onBusy={setBriefBusy}
          />
          <div className="mp-desk-cards">
            <article>
              <h3>交付节点</h3>
              {project.stages
                .filter((s) => s.milestone)
                .map((s) => (
                  <button key={s.id} disabled={disabled || briefDirty} onClick={() => begin(project, s)}>
                    ◆ {s.start} · {s.name} · {s.deliverable || "交付物待填写"}
                  </button>
                ))}
              <button disabled={disabled || briefDirty} onClick={() => begin(project)}>
                ＋ 添加交付节点
              </button>
            </article>
            <article>
              <h3>项目工作</h3>
              {project.stages
                .filter((s) => !s.milestone)
                .map((s) => (
                  <button
                    key={s.id}
                    disabled={disabled || briefDirty}
                    onClick={() => begin(project, s, { nonce: "work", date: s.start })}
                  >
                    {s.name} · 编辑
                  </button>
                ))}
            </article>
          </div>
        </>
      )}
      {editor && (
        <div className="mp-modal">
          <form
            className="mp-node-card mp-simple-work-card"
            role="dialog"
            aria-modal="true"
            aria-label="节点与工作卡片"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <header>
              <h2>
                {segment
                  ? "改派一段工作"
                  : editor.fresh
                    ? editor.stage.milestone
                      ? "添加交付节点"
                      : "添加工作"
                    : editor.stage.name}
              </h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("关闭并放弃未保存内容？")) setEditor(null);
                }}
              >
                关闭
              </button>
            </header>
            {error && (
              <p className="mp-error" role="alert">
                {error}
              </p>
            )}
            <fieldset disabled={disabled || busy}>
              {segment ? (
                <>
                  <p>
                    {editor.project.name} · {editor.stage.name}
                  </p>
                  <label>
                    抽调人员
                    <select
                      aria-label="抽调人员"
                      required
                      value={person || ""}
                      onChange={(e) => setPerson(Number(e.target.value))}
                    >
                      <option value="">选择人员</option>
                      {editor.stage.assignees
                        .filter((id) => staff.some((p) => p.id === id && p.is_active))
                        .map((id) => (
                          <option key={id} value={id}>
                            {staff.find((p) => p.id === id)?.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="mp-date-pair">
                    <PlanningDate
                      caption="从哪天" label="改派开始日期"
                      value={from}
                      min={editor.stage.start}
                      max={editor.stage.end}
                      required
                      onChange={setFrom}
                    />
                    <PlanningDate
                      caption="到哪天" label="改派结束日期"
                      value={to}
                      min={from}
                      max={editor.stage.end}
                      required
                      onChange={setTo}
                    />
                  </div>
                  <label>
                    支援项目
                    <select
                      aria-label="支援项目"
                      required
                      value={target || ""}
                      onChange={(e) => setTarget(Number(e.target.value))}
                    >
                      <option value="">选择项目</option>
                      {projects
                        .filter((p) => p.id !== editor.project.id && !p.archived)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    要做什么
                    <input
                      aria-label="改派工作内容"
                      maxLength={250}
                      value={work}
                      onChange={(e) => setWork(e.target.value)}
                    />
                  </label>
                  <p className="mp-help">选中日期将安排到支援项目。原工作若无人接替，会标记暂停并显示警示。</p>
                </>
              ) : (
                <>
                  {editor.fresh ? (
                    <label>
                      项目
                      <select
                        aria-label="工作所属项目"
                        value={editor.project.id}
                        onChange={(e) => {
                          const p = projects.find((p) => p.id === Number(e.target.value));
                          if (p) setEditor({ ...editor, project: structuredClone(p) });
                        }}
                      >
                        {projects
                          .filter((p) => !p.archived)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : (
                    <p style={{ borderLeft: `4px solid ${projectTint(editor.project)}`, paddingLeft: 8 }}>
                      {editor.project.name}
                    </p>
                  )}
                  <label>
                    {editor.stage.milestone ? "节点名称" : "要做什么"}
                    <input
                      aria-label="节点工作名称"
                      required
                      maxLength={250}
                      value={editor.stage.name}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </label>
                  <div className="mp-date-pair">
                    <PlanningDate
                      caption="开始" label="节点工作开始日期"
                      required
                      value={editor.stage.start}
                      onChange={(date) => patch({ start: date, ...(editor.stage.milestone ? { end: date } : {}) })}
                    />
                    {!editor.stage.milestone && (
                      <PlanningDate
                        caption="结束" label="节点工作结束日期"
                        required
                        min={editor.stage.start}
                        value={editor.stage.end}
                        onChange={(end) => patch({ end })}
                      />
                    )}
                  </div>
                  <details className="mp-simple-assignees">
                    <summary>
                      参与人员：
                      {editor.stage.assignees
                        .map((id) => staff.find((p) => p.id === id)?.name || `#${id}`)
                        .join("、") || "请选择"}
                    </summary>
                    <div>
                      {staff
                        .filter((p) => p.is_active || editor.stage.assignees.includes(p.id))
                        .map((p) => (
                          <label key={p.id}>
                            <input
                              type="checkbox"
                              checked={editor.stage.assignees.includes(p.id)}
                              disabled={!p.is_active && !editor.stage.assignees.includes(p.id)}
                              onChange={(e) =>
                                patch({
                                  assignees: e.target.checked
                                    ? [...editor.stage.assignees, p.id]
                                    : editor.stage.assignees.filter((id) => id !== p.id),
                                })
                              }
                            />
                            {p.name}
                          </label>
                        ))}
                    </div>
                  </details>
                  {editor.stage.milestone && (
                    <label>
                      交付物
                      <textarea
                        aria-label="交付物"
                        maxLength={1000}
                        value={editor.stage.deliverable || ""}
                        onChange={(e) => patch({ deliverable: e.target.value })}
                      />
                    </label>
                  )}
                  {editor.fresh && (
                    <details>
                      <summary>加入已有工作</summary>
                      <select
                        aria-label="新增或加入已有工作"
                        value=""
                        onChange={(e) => {
                          const s = editor.project.stages.find((s) => s.id === e.target.value);
                          if (s)
                            setEditor({
                              ...editor,
                              fresh: false,
                              stage: {
                                ...structuredClone(s),
                                assignees: [...new Set([...s.assignees, ...editor.stage.assignees])],
                              },
                            });
                        }}
                      >
                        <option value="">选择已有工作</option>
                        {editor.project.stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} · {s.start}—{s.end}
                          </option>
                        ))}
                      </select>
                    </details>
                  )}
                  {!editor.fresh && !editor.stage.milestone && (
                    <button
                      type="button"
                      onClick={() => {
                        setFrom(editor.stage.start);
                        setTo(editor.stage.end);
                        setSegment(true);
                      }}
                    >
                      改派部分日期…
                    </button>
                  )}
                  <details>
                    <summary>更多信息</summary>
                    <label>
                      补充说明
                      <textarea
                        maxLength={2000}
                        value={editor.stage.notes}
                        onChange={(e) => patch({ notes: e.target.value })}
                      />
                    </label>
                    {!editor.stage.milestone && (
                      <label>
                        交付物
                        <textarea
                          aria-label="交付物"
                          maxLength={1000}
                          value={editor.stage.deliverable || ""}
                          onChange={(e) => patch({ deliverable: e.target.value })}
                        />
                      </label>
                    )}
                    <label>
                      今天推进了什么
                      <textarea
                        aria-label="推进内容"
                        maxLength={1000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    {(editor.stage.pauses || []).map((p) => (
                      <p key={p.id}>
                        {p.start}—{p.until ? addDays(p.until, -1) : "持续"} · {p.reason}
                        <button
                          type="button"
                          onClick={() => patch({ pauses: editor.stage.pauses!.filter((x) => x.id !== p.id) })}
                        >
                          撤销这段暂停
                        </button>
                      </p>
                    ))}
                  </details>
                </>
              )}
              <footer>
                <button type="submit" className="mp-primary">
                  {busy ? "正在保存…" : segment ? "确认改派" : "保存卡片"}
                </button>
                {segment && (
                  <button type="button" onClick={() => setSegment(false)}>
                    返回编辑
                  </button>
                )}
                {!segment && !editor.fresh && (
                  <button type="button" onClick={() => void save(true)}>
                    删除节点 / 工作
                  </button>
                )}
              </footer>
            </fieldset>
          </form>
        </div>
      )}
    </section>
  );
}
