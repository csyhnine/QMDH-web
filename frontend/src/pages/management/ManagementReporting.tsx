import { useEffect, useRef, useState } from "react";
import { managementRequest } from "../../api";
import PlanningDate from "./PlanningDate";
import { addDays, staffAffiliation, TEAM_ROLES, today, weekRange } from "./planning";
import { CLASSIFICATIONS, classifiedSummary, financialSummary, MONEY_FIELDS, weeklyWorkload, type Classification, type ReportingData, type SnapshotDocument, type SnapshotMeta } from "./reporting";

export async function downloadReportingWorkbook(data: ReportingData, start: string, days: number, suffix = "") {
  const { reportWorkbook } = await import("./reportWorkbook");
  const bytes = reportWorkbook(data, start, days);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url; link.download = `${data.unit}-${data.year}年度一览及${start}周报${suffix}.xlsx`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ManagementReporting({ unit, year, revision }: { unit: string; year: number; revision: unknown }) {
  const [live, setLive] = useState<ReportingData | null>(null), [error, setError] = useState("");
  const [group, setGroup] = useState<Classification>("grade");
  const [week, setWeek] = useState(() => weekRange(year === new Date().getFullYear() ? today() : `${year}-01-01`).start);
  const [days, setDays] = useState<5 | 7>(5), [affiliation, setAffiliation] = useState("all");
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]), [snapshot, setSnapshot] = useState<SnapshotDocument | null>(null);
  const [snapshotId, setSnapshotId] = useState(0), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0), [snapshotLoading, setSnapshotLoading] = useState(false);
  const lock = useRef(false), mounted = useRef(true);
  const path = (value: string) => `${value}${value.includes("?") ? "&" : "?"}unit=${encodeURIComponent(unit)}`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false; setError(""); setLive(null);
    managementRequest<ReportingData>(path(`/report-data?year=${year}`)).then(data => {
      if (!Array.isArray(data.projects) || !Array.isArray(data.staff) || !data.report) throw Error("统计数据未完整加载，请刷新");
      if (!cancelled) setLive(data);
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [unit, year, revision, refresh]);
  useEffect(() => {
    let cancelled = false; setSnapshots([]);
    managementRequest<SnapshotMeta[]>(path(`/weekly-snapshots?year=${year}&week_start=${week}`)).then(rows => {
      if (!Array.isArray(rows)) throw Error("周报历史未完整加载");
      if (!cancelled) setSnapshots(rows);
    }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [unit, year, week, refresh]);
  useEffect(() => {
    let cancelled = false; setSnapshot(null);
    if (!snapshotId) { setSnapshotLoading(false); return; }
    setSnapshotLoading(true);
    managementRequest<{ document: SnapshotDocument }>(path(`/weekly-snapshots/${snapshotId}`)).then(row => {
      if (!cancelled) setSnapshot(row.document);
    }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setSnapshotLoading(false); });
    return () => { cancelled = true; };
  }, [unit, snapshotId]);
  const weeklyData = snapshotId ? snapshot : live;
  const weekStart = snapshot?.week_start || week, weekDays = snapshot?.week_days || days;
  const weekly = weeklyData && weeklyWorkload(weeklyData, weekStart, weekDays);
  const finance = live && financialSummary(live.projects);
  async function saveSnapshot() {
    if (lock.current || !live) return; lock.current = true; setBusy(true); setError("");
    try {
      const saved = await managementRequest<SnapshotMeta>(path(`/weekly-snapshots?year=${year}`), { week_start: week, week_days: days }, "POST");
      if (mounted.current) { setRefresh(v => v + 1); setSnapshotId(saved.id); setNotice("周报快照已保存，后续排期调整不会改写这份记录。"); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "快照未保存，请核对后重试"); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function exportWorkbook() {
    if (!weeklyData || busy || snapshotLoading) return;
    setBusy(true); setError("");
    try { await downloadReportingWorkbook(weeklyData, weekStart, weekDays, snapshot ? "-历史快照" : ""); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "导出失败"); }
    finally { if (mounted.current) setBusy(false); }
  }
  const changeWeek = (date: string) => { setWeek(weekRange(date).start); setSnapshotId(0); setNotice(""); };
  return <section className="mp-reporting" aria-label="经营统计与人员周报">
    <div className="mp-section-heading"><div><h2 id="mp-annual-report">年度经营与分类统计</h2><p>{unit} · {year} 年度全部未删除项目，包含归档；独立于台账搜索和人员筛选。</p></div><button disabled={!weeklyData || busy || snapshotLoading} onClick={exportWorkbook}>{snapshot ? "导出历史快照 Excel" : "导出完整 Excel 一览表"}</button></div>
    {error && <p className="mp-error" role="alert">{error}</p>}{notice && <p className="mp-notice" role="status">{notice}</p>}
    {!live && !error && <p role="status">正在计算本院年度统计…</p>}
    {live && finance && <>
      <div className="mp-kpis mp-finance-kpis">{MONEY_FIELDS.map(([key, label]) => <article key={key}><span>{label}合计</span><strong className="mp-money">{finance.totals[key].known ? finance.totals[key].amount : "—"}<small>万元</small></strong><p>已填 {finance.totals[key].known} / {finance.total} 项 · 待填 {finance.totals[key].missing}</p></article>)}
        <article><span>设计回款率</span><strong>{finance.collectionRate || "—"}</strong><p>设计费与回款均已填 {finance.collectionKnown} 项 · 未完整 {finance.collectionMissing} 项</p></article>
        <article><span>已确认项目签约率</span><strong>{finance.signingRate || "—"}</strong><p>已签 {finance.signed} · 未签 {finance.unsigned} · 待确认 {finance.contractUnknown}</p></article>
      </div>
      <p className="mp-help">金额空白不当作零。回款率=同一批已填项目的回款÷设计费；签约率=已签÷已确认状态项目。合同原文字保留，须单独确认签约状态。</p>
      <article className="mp-panel"><header><h3>项目分类汇总 · {finance.total} 项（归档 {finance.archived} 项）</h3><select aria-label="经营分类维度" value={group} onChange={e => setGroup(e.target.value as Classification)}>{CLASSIFICATIONS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></header><div className="mp-table-wrap"><table><thead><tr><th>类别</th><th>项目数</th>{MONEY_FIELDS.map(([, label]) => <th key={label}>{label}（万）</th>)}<th>回款率</th><th>签约待确认</th></tr></thead><tbody>{classifiedSummary(live.projects, group).map(row => <tr key={row.label}><td>{row.label}</td><td>{row.total}</td>{MONEY_FIELDS.map(([key]) => <td key={key}>{row.totals[key].known ? row.totals[key].amount : "—"}<small className="mp-cell-note">已填 {row.totals[key].known} / {row.total}</small></td>)}<td>{row.collectionRate || "—"}</td><td>{row.contractUnknown}</td></tr>)}</tbody></table></div></article>
    </>}
    <div className="mp-section-heading"><div><h2 id="mp-weekly-report">每周工作量安排一览表</h2><p>管理分工按本年度在管项目；本周参与按阶段排期，与所选周有日期交集的项目去重统计。</p></div></div>
    <div className="mp-week-controls">
      <button disabled={busy || snapshotLoading} aria-label="前一周" onClick={() => changeWeek(addDays(week, -7))}>‹</button>
      <PlanningDate label="周报所在日期" value={week} onChange={date => date && changeWeek(date)} disabled={busy || snapshotLoading} required />
      <button disabled={busy || snapshotLoading} aria-label="后一周" onClick={() => changeWeek(addDays(week, 7))}>›</button>
      <select aria-label="周报统计天数" disabled={busy || Boolean(snapshotId)} value={weekDays} onChange={e => setDays(Number(e.target.value) as 5 | 7)}><option value={5}>周一至周五</option><option value={7}>周一至周日</option></select>
      <select aria-label="周报人员归属" value={affiliation} onChange={e => setAffiliation(e.target.value)}><option value="all">全部人员（分组展示）</option><option value="internal">QMDH 内部</option><option value="external">外包人员</option><option value="unknown">归属待确认</option></select>
      <select aria-label="查看周报快照" disabled={busy || snapshotLoading} value={snapshotId} onChange={e => setSnapshotId(Number(e.target.value))}><option value={0}>当前排期 · 实时计算</option>{snapshots.map(s => <option key={s.id} value={s.id}>{new Date(s.created_at).toLocaleString("zh-CN")} · {s.week_days} 天 · 快照 #{s.id}</option>)}</select>
      <button disabled={!live || busy || Boolean(snapshotId) || snapshotLoading} onClick={saveSnapshot}>保存本周快照</button>
    </div>
    {snapshotLoading ? <p role="status">正在读取历史快照…</p> : weekly && <>
      <p className="mp-help">{weekStart} — {weekly.end} · {snapshot ? "历史快照，只读，包含保存时的人员归属和排期" : "当前实时排期"}。同一人同一项目多个阶段只计一个参与项目。</p>
      {(["internal", "external", "unknown"] as const).filter(kind => affiliation === "all" || affiliation === kind).map(kind => {
        const rows = weekly.rows.filter(r => (r.person.employment_type || "unknown") === kind);
        if (!rows.length) return null;
        return <article className="mp-panel mp-week-group" key={kind}><header><h3>{kind === "internal" ? "QMDH 内部" : kind === "external" ? "外包人员" : "归属待确认"} · {rows.length} 人</h3><span>本周参与项目 {rows.reduce((sum, r) => sum + r.projectCount, 0)} 人次</span></header><div className="mp-table-wrap"><table><thead><tr><th>组员 / 所属单位</th>{TEAM_ROLES.map(([, label]) => <th key={label}>{label}</th>)}{["A级", "B级", "C级", "D级", "未定级", "配合其他分院", "工作子项总计", "同类排名"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.person.id}><td><strong>{r.person.name}{r.person.is_active ? "" : "（停用）"}</strong><small className="mp-cell-note">{staffAffiliation(r.person)}</small>{r.projects.length > 0 && <details><summary>本周 {r.projectCount} 个项目</summary><ul>{r.projects.map((name, i) => <li key={i}>{name}</li>)}</ul></details>}</td>{TEAM_ROLES.map(([key]) => <td key={key}>{r.roles[key]}</td>)}{r.grades.map((n, i) => <td key={i}>{n}</td>)}<td>{r.unclassified}</td><td>{r.cooperation}</td><td><strong>{r.total}</strong></td><td>{r.rank ?? "—"}</td></tr>)}</tbody></table></div></article>;
      })}
      <p className="mp-help">总计=项目统筹、设计经理、设计副经理、商务经理、驻场设计五项分工数＋本周参与项目数；“参与人员”列单独展示，不再加总。配合其他分院项目单列，不重复计入 A—D。排名在内部／外包／待确认各组内按总计排列，并列同名次、零项不排名；只作安排参考，不代表实际工时。</p>
      <p className="mp-help">待完善：{weekly.unscheduled} 个在管项目没有阶段排期；{weekly.manual} 个项目有手工周安排，未转为有日期的排期时不计入本周参与项目数。</p>
    </>}
  </section>;
}
