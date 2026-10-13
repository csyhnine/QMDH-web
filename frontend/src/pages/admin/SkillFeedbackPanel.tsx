import { useEffect, useRef, useState } from "react";
import { api, type SkillIssue, type SkillEvent, type SkillFeedbackSummary, type ImprovementStatus } from "../../api";
import FeedbackCredentials from "./FeedbackCredentials";
import { formatChinaDateTime } from "../../lib/datetime";
import { useAuth } from "../../context/AuthContext";

export const improvementLabels: Record<ImprovementStatus, string> = {
  pending_analysis: "待分析", pending_modification: "待修改", pending_verification: "待验证", resolved: "已解决",
};
const sourceLabels = { human: "声明为人工反馈", system: "声明为系统事件", ai_inference: "AI 推断" };
const reviewLabels = { pending: "待核实", accepted: "已核实", rejected: "已驳回", not_required: "统计数据（未经核实）", legacy: "历史证据（未经核实）" };
function feedbackTime(value: string | null | undefined) {
  return formatChinaDateTime(value, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
const emptyDraft = { communication_status: "pending_reply" as SkillIssue["communication_status"], improvement_status: "pending_analysis" as ImprovementStatus, root_cause: "", modification_suggestion: "", retest_result: "", admin_reply: "" };

export default function SkillFeedbackPanel({ onUpdated }: { onUpdated: () => void }) {
  const { canManageUsers } = useAuth();
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
  const [view, setView] = useState<"issues" | "events" | "pending">("issues");
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [reload, setReload] = useState(0);
  const epoch = useRef(0);
  const selected = issues.find((issue) => issue.id === selectedId);

  async function refresh() {
    setBusy(true);
    try {
      const [rows, totals] = await Promise.all([api.skillFeedbackIssues(), api.skillFeedbackSummary()]);
      setIssues(rows); setSummary(totals); setReload((value) => value + 1); setMoreIssues(rows.length === 50); setError("");
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
    void api.skillFeedbackEvents(view === "pending" ? { review_status: "pending" } : view === "events" ? { run_id: runId } : { issue_id: selectedId ?? undefined }).then((rows) => {
      if (request === epoch.current) { setEvents(rows); setMoreEvents(rows.length === 50); }
    }).catch((err) => { if (request === epoch.current) setError(err instanceof Error ? err.message : "证据加载失败"); });
    return () => { epoch.current++; };
  }, [selectedId, view, runId, reload]);

  async function more(kind: "issues" | "events") {
    const request = epoch.current;
    setBusy(true);
    try {
      if (kind === "issues") {
        const rows = await api.skillFeedbackIssues(issues[issues.length - 1]?.id);
        setIssues((current) => [...current, ...rows]); setMoreIssues(rows.length === 50);
      } else {
        const rows = await api.skillFeedbackEvents({ ...(view === "pending" ? { review_status: "pending" } : view === "events" ? { run_id: runId } : { issue_id: selectedId ?? undefined }), before_id: events[events.length - 1]?.id });
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

  async function review(event: SkillEvent, status: "accepted" | "rejected") {
    setBusy(true);
    try {
      await api.reviewSkillEvent(event.id, status, reviewNotes[event.id] || "");
      setReviewNotes((current) => { const next = { ...current }; delete next[event.id]; return next; });
      await refresh(); onUpdated();
    } catch (err) { setError(err instanceof Error ? err.message : "核实失败"); }
    finally { setBusy(false); }
  }

  return <section className="admin-page">
    {canManageUsers && <FeedbackCredentials />}
    <header className="admin-page-head"><div><h2>Skill 改进收件箱</h2><p>外部问题先核实，确认后进入改进收件箱；正常事件只用于统计。</p></div><button disabled={busy} onClick={() => void refresh()}>刷新</button></header>
    {summary && <><p>关联任务 {summary.runs} · 自报正常完成 {summary.completed_runs} · 原始事件 {summary.events} · 聚合问题 {summary.issues} · 待核实 {summary.pending_review}</p><details><summary>按平台和版本统计</summary>{summary.by_skill.map((row) => <p key={`${row.platform}/${row.skill_id || "legacy"}/${row.skill_name}/${row.skill_version}`}>{row.platform} · {row.skill_id || "历史名称归属"} · {row.skill_name} {row.skill_version}：{row.events} 次事件</p>)}</details></>}
    <p><button onClick={() => { setView("issues"); setRunId(undefined); }}>改进问题</button> <button onClick={() => { setView("pending"); setRunId(undefined); }}>待核实问题</button> <button onClick={() => { setView("events"); setRunId(undefined); }}>原始事件（审计）</button></p>
    {error && <p role="alert">{error}</p>}
    {view === "issues" && <div className="admin-split-layout">
      <section className="admin-table-panel">{issues.map((issue) => <button key={issue.id} className="admin-table-row" onClick={() => setSelectedId(issue.id)}><span>{issue.title}<small>{issue.skill_id || "历史名称归属"} · {issue.skill_name} · {issue.skill_version} · {issue.problem_code}</small><small>创建：{feedbackTime(issue.created_at)} · 更新：{feedbackTime(issue.updated_at)}（北京时间）</small></span><span>{improvementLabels[issue.improvement_status]} · {issue.communication_status === "replied" ? "已回复" : "待回复"}<small>{issue.evidence_count} 次证据 · {issue.submitter_count} 个公司账号 · {issue.anonymous_session_count || 0} 次匿名会话（不代表人数）</small></span></button>)}{!issues.length && <p>暂无需要关注的问题。</p>}{moreIssues && <button disabled={busy} onClick={() => void more("issues")}>加载更多问题</button>}</section>
      {selected && <aside className="admin-detail-panel"><h3>{selected.title}</h3><p>创建：{feedbackTime(selected.created_at)} · 更新：{feedbackTime(selected.updated_at)}（北京时间）</p><label className="composer-menu-field">沟通状态<select value={draft.communication_status} onChange={(event) => setDraft({ ...draft, communication_status: event.target.value as SkillIssue["communication_status"] })}><option value="pending_reply">待回复</option><option value="replied">已回复</option></select></label><label className="composer-menu-field">改进状态<select value={draft.improvement_status} onChange={(event) => setDraft({ ...draft, improvement_status: event.target.value as ImprovementStatus })}>{Object.entries(improvementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {([['root_cause', '根因分析'], ['modification_suggestion', '修改建议'], ['retest_result', '复测结果'], ['admin_reply', '回复记录']] as const).map(([key, label]) => <label key={key} className="composer-menu-field">{label}<textarea value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
        <p>回复记录保存在后台；本次不会向外部平台发送消息。</p><button disabled={busy} onClick={() => void save()}>保存改进详情</button>
      </aside>}
    </div>}
    {view === "issues" && selected && <p>问题来源：{selected.sources?.map((source) => sourceLabels[source]).join("、") || "见各次证据"}</p>}
    <h3>{view === "issues" ? "各次证据与评测" : view === "pending" ? "待核实问题（不影响改进状态）" : runId ? "同一任务的执行、评测与纠正" : "原始事件审计"}</h3>
    {events.map((event) => <article key={event.id} className="feedback-detail-card"><strong>{sourceLabels[event.source]} · {event.platform} · {event.event_type} · {reviewLabels[event.review_status]}</strong><p>{event.skill_id || "历史名称归属"} · {event.skill_name} {event.skill_version} · {event.correlation_id}</p><p>发生：{feedbackTime(event.occurred_at)} · 接收：{feedbackTime(event.received_at)}（北京时间）</p><p>{event.summary}</p><p>{event.identity === "anonymous_session" ? "外部临时会话（身份未核实）" : "公司账号或历史采集"} · 采集凭证：{event.credential_id ?? "历史 Agent"} · {event.review_note}</p>{event.review_status === "pending" && <div><label>核实说明<textarea value={reviewNotes[event.id] || ""} onChange={(e) => setReviewNotes((current) => ({ ...current, [event.id]: e.target.value }))} /></label><button disabled={busy || !reviewNotes[event.id]?.trim()} onClick={() => void review(event, "accepted")}>确认并纳入改进</button><button disabled={busy || !reviewNotes[event.id]?.trim()} onClick={() => void review(event, "rejected")}>驳回并保留记录</button></div>}<button onClick={() => { setRunId(event.run_id); setView("events"); }}>查看关联任务</button><details><summary>评分与评测详情</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(event.evaluation, null, 2)}</pre></details><details><summary>原始证据</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(event.evidence, null, 2)}</pre></details></article>)}
    {moreEvents && <button disabled={busy} onClick={() => void more("events")}>加载更多证据</button>}
  </section>;
}
