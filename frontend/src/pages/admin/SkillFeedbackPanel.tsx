import { useEffect, useRef, useState } from "react";
import { api, type SkillIssue, type SkillEvent, type SkillFeedbackSummary, type ImprovementStatus } from "../../api";

export const improvementLabels: Record<ImprovementStatus, string> = {
  pending_analysis: "待分析", pending_modification: "待修改", pending_verification: "待验证", resolved: "已解决",
};
const sourceLabels = { human: "人工反馈", system: "系统事件", ai_inference: "AI 推断" };
const emptyDraft = { communication_status: "pending_reply" as SkillIssue["communication_status"], improvement_status: "pending_analysis" as ImprovementStatus, root_cause: "", modification_suggestion: "", retest_result: "", admin_reply: "" };

export default function SkillFeedbackPanel({ onUpdated }: { onUpdated: () => void }) {
  const [issues, setIssues] = useState<SkillIssue[]>([]);
  const [summary, setSummary] = useState<SkillFeedbackSummary | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [events, setEvents] = useState<SkillEvent[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [moreIssues, setMoreIssues] = useState(false);
  const [moreEvents, setMoreEvents] = useState(false);
  const [runId, setRunId] = useState<number | undefined>();
  const [view, setView] = useState<"issues" | "events">("issues");
  const epoch = useRef(0);
  const selected = issues.find((issue) => issue.id === selectedId);

  async function refresh() {
    setBusy(true);
    try {
      const [rows, totals] = await Promise.all([api.skillFeedbackIssues(), api.skillFeedbackSummary()]);
      setIssues(rows); setSummary(totals); setMoreIssues(rows.length === 50); setError("");
      setSelectedId((id) => rows.some((row) => row.id === id) ? id : rows[0]?.id ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : "加载失败"); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (selected) setDraft({ communication_status: selected.communication_status, improvement_status: selected.improvement_status, root_cause: selected.root_cause, modification_suggestion: selected.modification_suggestion, retest_result: selected.retest_result, admin_reply: selected.admin_reply });
  }, [selected]);
  useEffect(() => {
    const request = ++epoch.current;
    setEvents([]); setMoreEvents(false);
    if (view === "issues" && !selectedId) return;
    void api.skillFeedbackEvents(view === "events" ? { run_id: runId } : { issue_id: selectedId ?? undefined }).then((rows) => {
      if (request === epoch.current) { setEvents(rows); setMoreEvents(rows.length === 50); }
    }).catch((err) => { if (request === epoch.current) setError(err instanceof Error ? err.message : "证据加载失败"); });
    return () => { epoch.current++; };
  }, [selectedId, view, runId]);

  async function more(kind: "issues" | "events") {
    const request = epoch.current;
    setBusy(true);
    try {
      if (kind === "issues") {
        const rows = await api.skillFeedbackIssues(issues[issues.length - 1]?.id);
        setIssues((current) => [...current, ...rows]); setMoreIssues(rows.length === 50);
      } else {
        const rows = await api.skillFeedbackEvents({ ...(view === "events" ? { run_id: runId } : { issue_id: selectedId ?? undefined }), before_id: events[events.length - 1]?.id });
        if (request === epoch.current) { setEvents((current) => [...current, ...rows]); setMoreEvents(rows.length === 50); }
      }
    } catch (err) { setError(err instanceof Error ? err.message : "加载失败"); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await api.updateSkillIssue(selected.id, draft);
      setIssues((current) => current.map((issue) => issue.id === updated.id ? { ...issue, ...updated } : issue));
      setError(""); onUpdated();
    } catch (err) { setError(err instanceof Error ? err.message : "保存失败"); }
    finally { setBusy(false); }
  }

  return <section className="admin-page">
    <header className="admin-page-head"><div><h2>Skill 改进收件箱</h2><p>只展示需要关注的问题；正常执行、评测和交付数据用于统计。</p></div><button disabled={busy} onClick={() => void refresh()}>刷新</button></header>
    {summary && <><p>关联任务 {summary.runs} · 正常完成 {summary.completed_runs} · 原始事件 {summary.events} · 聚合问题 {summary.issues}</p><details><summary>按平台和版本统计</summary>{summary.by_skill.map((row) => <p key={`${row.platform}/${row.skill_name}/${row.skill_version}`}>{row.platform} · {row.skill_name} {row.skill_version}：{row.events} 次事件</p>)}</details></>}
    <p><button onClick={() => { setView("issues"); setRunId(undefined); }}>改进问题</button> <button onClick={() => { setView("events"); setRunId(undefined); }}>原始事件（审计）</button></p>
    {error && <p role="alert">{error}</p>}
    {view === "issues" && <div className="admin-split-layout">
      <section className="admin-table-panel">{issues.map((issue) => <button key={issue.id} className="admin-table-row" onClick={() => setSelectedId(issue.id)}><span>{issue.title}<small>{issue.skill_name} · {issue.skill_version} · {issue.problem_code}</small></span><span>{improvementLabels[issue.improvement_status]} · {issue.communication_status === "replied" ? "已回复" : "待回复"}<small>{issue.evidence_count} 次证据</small></span></button>)}{!issues.length && <p>暂无需要关注的问题。</p>}{moreIssues && <button disabled={busy} onClick={() => void more("issues")}>加载更多问题</button>}</section>
      {selected && <aside className="admin-detail-panel"><h3>{selected.title}</h3><label className="composer-menu-field">沟通状态<select value={draft.communication_status} onChange={(event) => setDraft({ ...draft, communication_status: event.target.value as SkillIssue["communication_status"] })}><option value="pending_reply">待回复</option><option value="replied">已回复</option></select></label><label className="composer-menu-field">改进状态<select value={draft.improvement_status} onChange={(event) => setDraft({ ...draft, improvement_status: event.target.value as ImprovementStatus })}>{Object.entries(improvementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {([['root_cause', '根因分析'], ['modification_suggestion', '修改建议'], ['retest_result', '复测结果'], ['admin_reply', '回复记录']] as const).map(([key, label]) => <label key={key} className="composer-menu-field">{label}<textarea value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
        <p>回复记录保存在后台；本次不会向外部平台发送消息。</p><button disabled={busy} onClick={() => void save()}>保存改进详情</button>
      </aside>}
    </div>}
    {view === "issues" && selected && <p>问题来源：{selected.sources?.map((source) => sourceLabels[source]).join("、") || "见各次证据"}</p>}
    <h3>{view === "issues" ? "各次证据与评测" : runId ? "同一任务的执行、评测与纠正" : "原始事件审计"}</h3>
    {events.map((event) => <article key={event.id} className="feedback-detail-card"><strong>{sourceLabels[event.source]} · {event.platform} · {event.event_type}</strong><p>{event.skill_name} {event.skill_version} · {event.correlation_id} · {event.occurred_at}</p><p>{event.summary}</p><button onClick={() => { setRunId(event.run_id); setView("events"); }}>查看关联任务</button><details><summary>评分与评测详情</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(event.evaluation, null, 2)}</pre></details><details><summary>原始证据</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(event.evidence, null, 2)}</pre></details></article>)}
    {moreEvents && <button disabled={busy} onClick={() => void more("events")}>加载更多证据</button>}
  </section>;
}
