import { useEffect, useMemo, useState, type FormEvent } from "react";
import { managementRequest as request } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { addDays, cell, ganttEntries, ledgerCsv, LEDGER_COLUMNS, newProject, overloadedDays, projectPayload, TEAM_ROLES, today,
  type PlanningProject, type Report, type Staff, type Stage } from "./planning";
import "./management.css";

function PeopleSelect({ value, staff, onChange }: { value: number[]; staff: Staff[]; onChange: (ids: number[]) => void }) {
  return <select multiple value={value.map(String)} onChange={e => onChange(Array.from(e.target.selectedOptions, o => Number(o.value)))}>
    {staff.filter(s => s.is_active || value.includes(s.id)).map(s => <option key={s.id} value={s.id}>{s.name}{!s.is_active ? "（已停用）" : ""}</option>)}
  </select>;
}

export default function ManagementProjectsPage() {
  const { currentUser } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [projects, setProjects] = useState<PlanningProject[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [view, setView] = useState<"ledger" | "gantt" | "staff">("ledger");
  const [archive, setArchive] = useState(false);
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState(0);
  const [group, setGroup] = useState<"project" | "staff">("project");
  const [start, setStart] = useState(today());
  const [days, setDays] = useState(30);
  const [draft, setDraft] = useState<PlanningProject | null>(null);
  const [staffDraft, setStaffDraft] = useState<Staff | null>(null);
  const [reportDraft, setReportDraft] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setProjects([]); setReport(null);
    Promise.all([request<PlanningProject[]>(`/projects?year=${year}&archived=${archive}`), request<Staff[]>("/staff"), request<Report>(`/reports/${year}`)])
      .then(([p, s, r]) => { if (!cancelled) { setProjects(p); setStaff(s); setReport(r); } })
      .catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, archive, refresh]);
  const filtered = useMemo(() => projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) && (!person || [
    ...Object.values(p.team).flat(), ...p.next_week_staff, ...p.stages.flatMap(s => s.assignees),
  ].includes(person))), [projects, search, person]);
  const entries = useMemo(() => ganttEntries(filtered, start, days), [filtered, start, days]);
  const reload = () => setRefresh(v => v + 1);
  const change = <K extends keyof PlanningProject>(key: K, value: PlanningProject[K]) => setDraft(p => p ? { ...p, [key]: value } : p);
  const editStage = (index: number, patch: Partial<Stage>) => { if (draft) change("stages", draft.stages.map((s, i) => i === index ? { ...s, ...patch } : s)); };
  const closeDraft = () => { if (!busy && window.confirm("关闭编辑？尚未保存的内容将丢失。")) setDraft(null); };
  async function saveProject(e: FormEvent) {
    e.preventDefault(); if (!draft || busy) return;
    setBusy(true); setError("");
    try {
      await request(draft.id ? `/projects/${draft.id}` : `/projects?year=${year}`, projectPayload(draft), draft.id ? "PUT" : "POST");
      setDraft(null); setNotice("项目已保存"); reload();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setBusy(false); }
  }
  async function saveStaff(e: FormEvent) {
    e.preventDefault(); if (!staffDraft || busy) return;
    setBusy(true); setError("");
    const { id, ...body } = staffDraft;
    try { await request(id ? `/staff/${id}` : "/staff", body, id ? "PUT" : "POST"); setStaffDraft(null); setNotice("人员已保存"); reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setBusy(false); }
  }
  async function saveReport(e: FormEvent) {
    e.preventDefault(); if (!reportDraft || busy) return;
    setBusy(true); setError("");
    try { await request(`/reports/${year}`, { compiler: reportDraft.compiler, data_as_of: reportDraft.data_as_of, version: reportDraft.version }); setReportDraft(null); reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([ledgerCsv(filtered, staff)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${report?.unit ?? "二分院"}-${year}年度项目台账.csv`; a.click(); URL.revokeObjectURL(url);
  }
  const textField = (key: keyof PlanningProject, label: string, wide = false) => <label key={key} className={wide ? "mp-wide" : ""}><span>{label}</span>
    {wide ? <textarea maxLength={4000} value={String(draft?.[key] ?? "")} onChange={e => change(key, e.target.value as never)} /> :
      <input maxLength={key === "contract" ? 500 : key === "grade" ? 100 : 250} value={String(draft?.[key] ?? "")} onChange={e => change(key, e.target.value as never)} required={key === "name"} />}</label>;
  const ganttRow = (label: string, items: typeof entries, overload: number[] = []) => <div className="mp-gantt-row" key={label}>
    <div className="mp-gantt-label" title={label}>{label}{overload.length > 0 ? <small className="mp-warning">超额排期 {overload.length} 天</small> : null}</div>
    <div className="mp-tracks" style={{ width: days * 34, backgroundSize: "34px 100%" }}>
      {overload.map(d => <div key={d} className="mp-overload" style={{ left: d * 34, width: 34 }} title={`${addDays(start, d)} 分配合计超过 100%`} />)}
      {items.length ? items.map(item => <div className="mp-track" key={`${item.project.id}-${item.stage.id}`}>
        <button className={`mp-bar ${item.stage.milestone ? "mp-milestone" : ""} ${item.stage.progress === 100 ? "mp-complete" : ""}`} style={{ left: item.left * 34, width: Math.max(26, item.width * 34 - 4) }}
          onClick={() => setDraft(structuredClone(item.project))} title={`${item.project.name} · ${item.stage.name}\n${item.stage.start} 至 ${item.stage.end} · 进度 ${item.stage.progress}% · 每人分配 ${item.stage.allocation}%`}>
          <i style={{ width: `${item.stage.progress}%` }} /><span>{item.stage.milestone ? "◆ " : ""}{item.stage.name} · {item.stage.progress}%</span>
        </button>
      </div>) : <div className="mp-track"><small>本时间范围无排期</small></div>}
    </div>
  </div>;
  return <section className="management-page">
    <header className="mp-header"><div><p className="mp-eyebrow">公司管理 · {currentUser?.company_position}</p><h1>【{report?.unit || currentUser?.company_unit}】{year} 年度项目信息一览表</h1>
      <p>表格编制：{report?.compiler || "待填写"}　数据更新：{report?.data_as_of || "待填写"}</p>
      <small>最近保存：{report?.updated_at ? new Date(report.updated_at).toLocaleString("zh-CN") : "尚未设置台账信息"} · 项目修改时间见编辑页</small></div>
      <button disabled={loading} onClick={() => report && setReportDraft({ ...report, data_as_of: report.data_as_of || today() })}>编辑台账信息</button></header>
    <nav className="mp-tabs" aria-label="项目管理视图">{([["ledger", "年度台账"], ["gantt", "甘特排期"], ["staff", "人员管理"]] as const).map(([v,l]) => <button key={v} className={view === v ? "selected" : ""} onClick={() => setView(v)}>{l}</button>)}</nav>
    {error ? <p className="mp-error" role="alert">{error}</p> : null}{notice ? <p role="status" className="mp-notice">{notice}</p> : null}
    <div className="mp-toolbar"><label>年度<select value={year} onChange={e => setYear(Number(e.target.value))}>{Array.from(new Set([2026, year, new Date().getFullYear(), ...Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i)])).sort().map(y => <option key={y}>{y}</option>)}</select></label>
      {view !== "staff" ? <><input aria-label="搜索项目" placeholder="搜索项目名称" value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="按人员筛选" value={person} onChange={e => setPerson(Number(e.target.value))}><option value={0}>全部人员</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <label className="mp-inline"><input type="checkbox" checked={archive} onChange={e => setArchive(e.target.checked)} />查看已归档</label>
      <button disabled={loading} onClick={download}>导出台账</button><button className="mp-primary" disabled={loading} onClick={() => setDraft(newProject(Math.max(0, ...projects.map(p => p.sequence)) + 1))}>＋ 新建项目</button></> :
      <button className="mp-primary" disabled={loading} onClick={() => setStaffDraft({ id: 0, name: "", position: "", is_active: true, version: 0 })}>＋ 添加人员</button>}
      <button disabled={loading || busy} onClick={reload}>刷新</button></div>
    {loading ? <p>正在加载…</p> : view === "ledger" ? <div className="mp-table-wrap"><table className="mp-ledger"><caption>{filtered.length} 个{archive ? "已归档" : "在册"}项目 · 点击项目名称编辑</caption><thead><tr>{LEDGER_COLUMNS.map(([k,l]) => <th key={k}>{TEAM_ROLES.some(([t]) => t === k) ? <small>项目组成员<br /></small> : null}{l}</th>)}</tr></thead><tbody>
      {filtered.map(p => <tr key={p.id}>{LEDGER_COLUMNS.map(([k]) => <td key={k}>{k === "name" ? <button className="mp-link" onClick={() => setDraft(structuredClone(p))}>{p.name}</button> : cell(p, k, staff) || "—"}</td>)}</tr>)}
      {!filtered.length ? <tr><td colSpan={LEDGER_COLUMNS.length}>暂无项目。先补充人员，再新建项目及阶段排期；未录入的数据不会自动推测。</td></tr> : null}</tbody></table></div> : view === "gantt" ? <>
      <div className="mp-toolbar"><label>分组<select value={group} onChange={e => setGroup(e.target.value as typeof group)}><option value="project">按项目</option><option value="staff">按人员</option></select></label>
      <button onClick={() => setStart(addDays(start, -days))}>上一段</button><label>开始日期<input type="date" required value={start} onChange={e => { if (e.target.value) setStart(e.target.value); }} /></label><button onClick={() => setStart(addDays(start, days))}>下一段</button><button onClick={() => setStart(today())}>今天</button>
      <select aria-label="时间跨度" value={days} onChange={e => setDays(Number(e.target.value))}><option value={14}>两周</option><option value={30}>30 天</option><option value={90}>90 天</option></select></div>
      <p className="mp-help">点击排期条编辑阶段、日期与人员。红色背景表示同一天人员分配超过 100%；按日历日计算，仅提示计划重叠。未排期项目：{filtered.filter(p => !p.stages.length).length} 个。</p>
      <div className="mp-gantt-wrap"><div style={{ minWidth: 220 + days * 34 }}><div className="mp-gantt-row mp-gantt-head"><div className="mp-gantt-label">{group === "project" ? "项目 / 阶段" : "人员 / 阶段"}</div><div className="mp-days">{Array.from({ length: days }, (_, i) => <span key={i} className={addDays(start, i) === today() ? "mp-today" : ""}>{addDays(start, i).slice(5)}</span>)}</div></div>
      {group === "project" ? filtered.map(p => ganttRow(p.name, entries.filter(e => e.project.id === p.id))) : staff.filter(s => !person || s.id === person).map(s => ganttRow(s.name + (s.is_active ? "" : "（停用）"), entries.filter(e => e.stage.assignees.includes(s.id)), overloadedDays(entries, s.id, days)))}
      </div></div><p className="mp-help">未指定人员的阶段：{entries.filter(e => !e.stage.assignees.length).length} 个。里程碑以 ◆ 标记；跨年度阶段按所选项目年度读取。</p></> :
      <div className="mp-table-wrap"><table><thead><tr><th>姓名</th><th>职务</th><th>状态</th><th>操作</th></tr></thead><tbody>{staff.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.position || "—"}</td><td>{s.is_active ? "在用" : "停用"}</td><td><button onClick={() => setStaffDraft({ ...s })}>编辑</button></td></tr>)}</tbody></table><p className="mp-help">人员名册用于排期，可添加尚无网站账号的员工。添加或修改名册不会授予登录或管理权限；同名人员请在姓名中注明区分。</p></div>}
    {draft ? <div className="mp-modal"><form className="mp-editor" onSubmit={saveProject} role="dialog" aria-modal="true" aria-label="编辑项目"><header><h2>{draft.id ? "编辑项目" : "新建项目"}</h2><button type="button" disabled={busy} onClick={closeDraft}>关闭</button></header>
      {error ? <p className="mp-error" role="alert">{error}</p> : null}<p>{year} 年度 · {draft.updated_at ? `最后修改 ${new Date(draft.updated_at).toLocaleString("zh-CN")}` : "新建"}</p>
      <fieldset disabled={busy}><legend>基本信息</legend><div className="mp-fields">{textField("name", "项目名称")}
      <label><span>序号</span><input required type="number" min={1} max={100000} value={draft.sequence} onChange={e => change("sequence", Number(e.target.value))} /></label>
      {textField("grade", "项目等级")}<label><span>紧急程度</span><select value={draft.urgency} onChange={e => change("urgency", e.target.value)}>{["常规", "重要", "紧急", "特急"].map(s => <option key={s}>{s}</option>)}</select></label>
      {textField("mode", "项目模式")}{textField("source", "项目来源")}{textField("project_type", "项目类型")}{textField("phase", "项目阶段")}
      <label><span>完成时间节点</span><input type="date" value={draft.deadline || ""} onChange={e => change("deadline", e.target.value || null)} /></label>
      {textField("stage_work", "阶段工作", true)}{textField("notes", "备注", true)}</div></fieldset>
      <fieldset disabled={busy}><legend>项目组成员</legend><p className="mp-help">按住 Ctrl / Command 可多选；人员在“人员管理”中维护。</p><div className="mp-fields">{TEAM_ROLES.map(([k,l]) => <label key={k}><span>{l}</span><PeopleSelect value={draft.team[k]} staff={staff} onChange={ids => change("team", { ...draft.team, [k]: ids })} /></label>)}</div></fieldset>
      <fieldset disabled={busy}><legend>下周工作安排</legend><div className="mp-fields">{textField("next_week_work", "下周主要工作内容", true)}<label><span>下周主要使用人员</span><PeopleSelect value={draft.next_week_staff} staff={staff} onChange={ids => change("next_week_staff", ids)} /></label></div></fieldset>
      <fieldset disabled={busy}><legend>合同与费用</legend><p className="mp-help">金额单位均为万元，最多两位小数；未知可留空，0 表示已确认零金额。</p><div className="mp-fields">{([["investment", "工程投资"], ["design_fee", "设计费用"], ["paid", "设计回款"], ["invoiced_pending", "请款中（已开发票）"]] as const).map(([k,l]) => <label key={k}><span>{l}（万）</span><input type="number" min="0" step="0.01" max="999999999999.99" value={draft[k] ?? ""} onChange={e => change(k, e.target.value || null)} /></label>)}{textField("contract", "合同签订情况 / 日期 / 编号")}</div></fieldset>
      <fieldset disabled={busy}><legend>阶段排期 · 甘特图</legend><p className="mp-help">每个阶段可安排多人，分配比例应用到每人每天。进度由管理层更新。</p>
      {draft.stages.map((s,i) => <section className="mp-stage" key={s.id}><div className="mp-fields"><label><span>阶段工作</span><input required maxLength={250} value={s.name} onChange={e => editStage(i, { name: e.target.value })} /></label>
      <label><span>开始日期</span><input required type="date" value={s.start} onChange={e => editStage(i, { start: e.target.value, ...(s.milestone ? { end: e.target.value } : {}) })} /></label>
      <label><span>完成日期</span><input required type="date" min={s.start} disabled={s.milestone} value={s.end} onChange={e => editStage(i, { end: e.target.value })} /></label>
      <label><span>进度（%）</span><input required type="number" min={0} max={100} value={s.progress} onChange={e => editStage(i, { progress: Number(e.target.value) })} /></label>
      <label><span>每人分配（%）</span><input required type="number" min={1} max={100} value={s.allocation} onChange={e => editStage(i, { allocation: Number(e.target.value) })} /></label>
      <label><span>安排人员</span><PeopleSelect value={s.assignees} staff={staff} onChange={ids => editStage(i, { assignees: ids })} /></label>
      <label className="mp-inline"><input type="checkbox" checked={s.milestone} onChange={e => editStage(i, { milestone: e.target.checked, ...(e.target.checked ? { end: s.start } : {}) })} />里程碑</label>
      <label><span>排期说明</span><input maxLength={2000} value={s.notes} onChange={e => editStage(i, { notes: e.target.value })} /></label></div>
      <button type="button" onClick={() => change("stages", draft.stages.filter((_,index) => index !== i))}>移除此阶段</button></section>)}
      <button type="button" onClick={() => change("stages", [...draft.stages, { id: crypto.randomUUID(), name: "", start: today(), end: addDays(today(), 6), assignees: [], progress: 0, allocation: 100, milestone: false, notes: "" }])}>＋ 添加阶段</button></fieldset>
      <footer><label className="mp-inline"><input type="checkbox" disabled={busy} checked={draft.archived} onChange={e => change("archived", e.target.checked)} />归档项目（可从已归档列表恢复）</label><button className="mp-primary" disabled={busy} type="submit">{busy ? "正在保存…" : "保存项目与排期"}</button></footer><p className="mp-help">每次保存保留版本记录；移除阶段只影响新版本。</p>
    </form></div> : null}
    {staffDraft ? <div className="mp-modal"><form className="mp-small-editor" onSubmit={saveStaff} role="dialog" aria-modal="true" aria-label="编辑人员"><h2>人员信息</h2>{error ? <p role="alert" className="mp-error">{error}</p> : null}<fieldset disabled={busy}><label>姓名<input required maxLength={150} value={staffDraft.name} onChange={e => setStaffDraft({ ...staffDraft, name: e.target.value })} /></label><label>职务<input maxLength={120} value={staffDraft.position} onChange={e => setStaffDraft({ ...staffDraft, position: e.target.value })} /></label><label className="mp-inline"><input type="checkbox" checked={staffDraft.is_active} onChange={e => setStaffDraft({ ...staffDraft, is_active: e.target.checked })} />可安排工作</label></fieldset><footer><button type="button" disabled={busy} onClick={() => setStaffDraft(null)}>取消</button><button className="mp-primary" disabled={busy}>保存人员</button></footer></form></div> : null}
    {reportDraft ? <div className="mp-modal"><form className="mp-small-editor" onSubmit={saveReport} role="dialog" aria-modal="true" aria-label="编辑台账信息"><h2>台账信息</h2>{error ? <p role="alert" className="mp-error">{error}</p> : null}<fieldset disabled={busy}><label>表格编制<input maxLength={150} value={reportDraft.compiler} onChange={e => setReportDraft({ ...reportDraft, compiler: e.target.value })} /></label><label>数据更新日期<input type="date" required value={reportDraft.data_as_of || ""} onChange={e => setReportDraft({ ...reportDraft, data_as_of: e.target.value })} /></label></fieldset><footer><button type="button" disabled={busy} onClick={() => setReportDraft(null)}>取消</button><button className="mp-primary" disabled={busy}>保存信息</button></footer></form></div> : null}
  </section>;
}
