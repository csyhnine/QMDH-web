import { useEffect, useRef, useState } from "react";
import PlanningDate from "./PlanningDate";
import { addDays, isPaused, projectTint, scheduledWeek, today, weekRange, type PlanningProject, type Staff, type Stage } from "./planning";

export default function PlanningDesk({ projects, staff, disabled, onPersist, onDirty }: {
  projects: PlanningProject[]; staff: Staff[]; disabled: boolean;
  onPersist: (p: PlanningProject) => Promise<PlanningProject>; onDirty: (v: boolean) => void;
}) {
  const [selected, setSelected] = useState(0), [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<{ project: PlanningProject; stage: Stage; fresh: boolean } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [reason, setReason] = useState(""), [person, setPerson] = useState(0), [pauseStart, setPauseStart] = useState(today()), [resume, setResume] = useState("");
  const [note, setNote] = useState(""), [noteDate, setNoteDate] = useState(today());
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onDirty(Boolean(editor)); return () => onDirty(false); }, [Boolean(editor), onDirty]);
  const project = projects.find(p => p.id === selected) || projects[0];
  const week = weekRange(today()), last = addDays(week.start, -7), next = addDays(week.start, 7);
  const updates = project?.stages.flatMap(s => (s.updates || []).filter(u => u.date >= last && u.date < week.start).map(u => ({...u, work:s.name}))) || [];
  const milestones = project?.stages.filter(s => s.milestone) || [];
  function edit(stage?: Stage) {
    if (!project || disabled) return;
    setEditor({ project: structuredClone(project), fresh: !stage, stage: stage ? structuredClone(stage) : { id: crypto.randomUUID(), name:"", start:today(), end:today(), milestone:true, progress:0, allocation:100, assignees:[], notes:"", deliverable:"", pauses:[], updates:[] } });
    setReason(""); setNote(""); setPerson(0); setResume(""); setPauseStart(today()); setError("");
  }
  const patch = (value: Partial<Stage>) => setEditor(e => e ? {...e,stage:{...e.stage,...value}} : e);
  async function save(remove = false) {
    if (!editor || lock.current || disabled) return;
    if (remove && !window.confirm("删除这项节点或工作？已有暂停和推进记录也会从当前计划移除，历史修订仍保留。")) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const p = editor.project, s = editor.stage;
      await onPersist({...p, stages: remove ? p.stages.filter(x => x.id !== s.id) : editor.fresh ? [...p.stages,s] : p.stages.map(x => x.id===s.id?s:x)});
      if (alive.current) setEditor(null);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "保存失败，输入已保留"); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="mp-planning-desk">
    <div className="mp-desk-heading"><button aria-expanded={open} onClick={() => setOpen(!open)}>关键总览 · 上周推进 / 下周安排 / 交付节点 {open ? "收起 ▴" : "展开 ▾"}</button>
      <select aria-label="关键总览项目" disabled={busy} value={project?.id || ""} onChange={e=>setSelected(Number(e.target.value))}>{!projects.length&&<option>暂无项目</option>}{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      {project && <span style={{borderLeft:`5px solid ${projectTint(project)}`,paddingLeft:8}}>{new Set(project.stages.flatMap(s=>s.assignees)).size} 人参与排期 · {milestones.length} 个交付节点</span>}
    </div>
    {open && project && <div className="mp-desk-cards">
      <article><h3>上周推进 · {last}—{addDays(last,6)}</h3>{updates.length ? updates.map(u=><p key={u.id}>{u.date} · {u.work}：{u.note}</p>) : <p>暂无推进记录。可在下方选择工作，记录实际推进情况。</p>}</article>
      <article><h3>下周安排 · {next}—{addDays(next,4)}</h3>{scheduledWeek(project,next,5).stages.map(s=><p key={s.id}>{s.name} · {s.start}—{s.end}{s.deliverable?` · 交付：${s.deliverable}`:""}</p>)}{!scheduledWeek(project,next,5).stages.length&&<p>下周尚未安排工作。</p>}</article>
      <article><h3>交付节点</h3>{milestones.map(s=><button key={s.id} disabled={disabled} onClick={()=>edit(s)}>◆ {s.start} · {s.name} · {s.deliverable || "交付物待填写"}</button>)}<button disabled={disabled || project.stages.length>=200} onClick={()=>edit()}>＋ 添加交付节点</button></article>
      <article><h3>工作推进与暂停</h3>{project.stages.map(s=><button key={s.id} disabled={disabled} onClick={()=>edit(s)}>{s.name} · {s.progress}%{s.assignees.some(id=>isPaused(s,id,today()))?" · 有人员暂停":""} · 记录 / 暂停 / 编辑</button>)}{!project.stages.length&&<p>先在项目计划添加工作。</p>}</article>
    </div>}
    {editor && <div className="mp-modal"><form className="mp-node-card" role="dialog" aria-modal="true" aria-label="节点与工作卡片" onSubmit={e=>{e.preventDefault();void save();}}>
      <header><h2>{editor.fresh ? "添加交付节点" : editor.stage.name}</h2><button type="button" disabled={busy} onClick={()=>{if(window.confirm("关闭卡片并放弃尚未保存的修改？"))setEditor(null);}}>关闭</button></header>
      {error&&<p className="mp-error" role="alert">{error}</p>}
      <fieldset disabled={busy || disabled}>
        <label>名称<input aria-label="节点工作名称" required maxLength={250} value={editor.stage.name} onChange={e=>patch({name:e.target.value})}/></label>
        <label><input type="checkbox" checked={editor.stage.milestone} onChange={e=>patch({milestone:e.target.checked,...(e.target.checked?{end:editor.stage.start}:{})})}/>单日交付节点（不计人员负荷，实际工作另建阶段）</label>
        <PlanningDate label="节点工作开始日期" value={editor.stage.start} required onChange={date=>patch({start:date,...(editor.stage.milestone?{end:date}:{})})}/>
        {!editor.stage.milestone&&<PlanningDate label="节点工作结束日期" min={editor.stage.start} value={editor.stage.end} required onChange={date=>patch({end:date})}/>}
        <label>明确交付物<textarea aria-label="交付物" maxLength={1000} value={editor.stage.deliverable || ""} onChange={e=>patch({deliverable:e.target.value})}/></label>
        <label>进度（%）<input aria-label="节点工作进度" type="number" min={0} max={100} required value={editor.stage.progress} onChange={e=>patch({progress:Number(e.target.value)})}/></label>
        <label>说明<textarea maxLength={2000} value={editor.stage.notes} onChange={e=>patch({notes:e.target.value})}/></label>
        <details><summary>参与人员</summary>{staff.filter(s=>s.is_active || editor.stage.assignees.includes(s.id)).map(s=><label key={s.id}><input type="checkbox" checked={editor.stage.assignees.includes(s.id)} disabled={!s.is_active&&!editor.stage.assignees.includes(s.id)} onChange={e=>patch({assignees:e.target.checked?[...editor.stage.assignees,s.id]:editor.stage.assignees.filter(id=>id!==s.id)})}/>{s.name}</label>)}</details>
        <details><summary>记录实际推进</summary><PlanningDate label="推进记录日期" value={noteDate} onChange={setNoteDate}/><textarea aria-label="推进内容" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/><button type="button" disabled={!note.trim() || !noteDate || (editor.stage.updates||[]).length>=200} onClick={()=>{patch({updates:[...(editor.stage.updates||[]),{id:crypto.randomUUID(),date:noteDate,note:note.trim()}]});setNote("");}}>加入推进记录</button>{(editor.stage.updates||[]).map(u=><p key={u.id}>{u.date} · {u.note}</p>)}</details>
        <details><summary>临时抽调 / 暂停</summary><p>暂停期间不计该人员的负荷，原计划和交付日期保留；恢复日期表示当天起恢复，空白为持续暂停。延期须另行调整日期。</p>
          <select aria-label="暂停人员" value={person} onChange={e=>setPerson(Number(e.target.value))}><option value={0}>整项工作所有参与者</option>{editor.stage.assignees.map(id=><option key={id} value={id}>{staff.find(s=>s.id===id)?.name || `#${id}`}</option>)}</select>
          <PlanningDate label="暂停开始日期" value={pauseStart} onChange={setPauseStart}/><PlanningDate label="恢复日期（可空）" value={resume} min={pauseStart} onChange={setResume}/>
          <input aria-label="暂停原因" maxLength={500} value={reason} placeholder="例如：抽调支援临时紧急任务" onChange={e=>setReason(e.target.value)}/>
          <button type="button" disabled={!reason.trim()||!pauseStart||Boolean(resume&&resume<pauseStart)||(editor.stage.pauses||[]).length>=100} onClick={()=>{patch({pauses:[...(editor.stage.pauses||[]),{id:crypto.randomUUID(),start:pauseStart,until:resume||null,people:person?[person]:[],reason:reason.trim()}]});setReason("");}}>加入暂停区间</button>
          {(editor.stage.pauses||[]).map(p=><p key={p.id}>{p.start}—{p.until?`${p.until}起恢复`:"持续暂停"} · {p.people.length?p.people.map(id=>staff.find(s=>s.id===id)?.name||`#${id}`).join("、"):"整项工作"} · {p.reason} {!p.until&&p.start<=today()&&<button type="button" onClick={()=>patch({pauses:editor.stage.pauses!.map(x=>x.id===p.id?{...x,until:today()}:x)})}>今天恢复</button>}<button type="button" onClick={()=>patch({pauses:editor.stage.pauses!.filter(x=>x.id!==p.id)})}>移除此区间</button></p>)}
        </details>
        <footer><button className="mp-primary" type="submit">{busy?"保存中…":"保存卡片"}</button>{!editor.fresh&&<button type="button" onClick={()=>void save(true)}>删除节点 / 工作</button>}</footer>
      </fieldset>
    </form></div>}
  </section>;
}
