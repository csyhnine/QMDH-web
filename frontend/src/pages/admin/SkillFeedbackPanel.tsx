import { useEffect, useRef, useState } from "react";
import { api, type SkillIssue, type SkillEvent, type SkillFeedbackSummary, type ImprovementStatus } from "../../api";
import { formatChinaDateTime } from "../../lib/datetime";

export const improvementLabels: Record<ImprovementStatus, string> = {
  pending_analysis: "待分析",
  pending_modification: "待修改",
  pending_verification: "待验证",
  resolved: "已解决",
};
const sourceLabels = { human: "声明为人工反馈", system: "声明为系统事件", ai_inference: "AI 推断" };
const reviewLabels = {
  pending: "待核实",
  accepted: "已核实",
  rejected: "已驳回",
  not_required: "统计数据（未经核实）",
  legacy: "历史证据（未经核实）",
};
function feedbackTime(value: string | null | undefined) {
  return formatChinaDateTime(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
const emptyDraft = {
  communication_status: "pending_reply" as SkillIssue["communication_status"],
  improvement_status: "pending_analysis" as ImprovementStatus,
  root_cause: "",
  modification_suggestion: "",
  retest_result: "",
  admin_reply: "",
};

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
  const [view, setView] = useState<"issues" | "events" | "pending">("pending");
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [progressFilter, setProgressFilter] = useState("");
  const [loadingEvents, setLoadingEvents] = useState(true);
  const epoch = useRef(0);
  const selected = issues.find((issue) => issue.id === selectedId);

  async function refresh() {
    setBusy(true);
    try {
      const [rows, totals] = await Promise.all([api.skillFeedbackIssues(), api.skillFeedbackSummary()]);
      setIssues(rows);
      setSummary(totals);
      setReload((value) => value + 1);
      setMoreIssues(rows.length === 50);
      setError("");
      setSelectedId((id) => (rows.some((row) => row.id === id) ? id : (rows[0]?.id ?? null)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (selected)
      setDraft({
        communication_status: selected.communication_status,
        improvement_status: selected.improvement_status,
        root_cause: selected.root_cause,
        modification_suggestion: selected.modification_suggestion,
        retest_result: selected.retest_result,
        admin_reply: selected.admin_reply,
      });
  }, [selected]);
  useEffect(() => {
    const request = ++epoch.current;
    setEvents([]);
    setMoreEvents(false);
    setLoadingEvents(true);
    if (view === "issues" && !selectedId) {
      setLoadingEvents(false);
      return;
    }
    void api
      .skillFeedbackEvents(
        view === "pending"
          ? { review_status: "pending" }
          : view === "events"
            ? { run_id: runId }
            : { issue_id: selectedId ?? undefined },
      )
      .then((rows) => {
        if (request === epoch.current) {
          setEvents(rows);
          setMoreEvents(rows.length === 50);
        }
      })
      .catch((err) => {
        if (request === epoch.current) setError(err instanceof Error ? err.message : "证据加载失败");
      })
      .finally(() => {
        if (request === epoch.current) setLoadingEvents(false);
      });
    return () => {
      epoch.current++;
    };
  }, [selectedId, view, runId, reload]);

  async function more(kind: "issues" | "events") {
    const request = epoch.current;
    setBusy(true);
    try {
      if (kind === "issues") {
        const rows = await api.skillFeedbackIssues(issues[issues.length - 1]?.id);
        setIssues((current) => [...current, ...rows]);
        setMoreIssues(rows.length === 50);
      } else {
        const rows = await api.skillFeedbackEvents({
          ...(view === "pending"
            ? { review_status: "pending" }
            : view === "events"
              ? { run_id: runId }
              : { issue_id: selectedId ?? undefined }),
          before_id: events[events.length - 1]?.id,
        });
        if (request === epoch.current) {
          setEvents((current) => [...current, ...rows]);
          setMoreEvents(rows.length === 50);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await api.updateSkillIssue(selected.id, draft);
      setIssues((current) => current.map((issue) => (issue.id === updated.id ? { ...issue, ...updated } : issue)));
      setError("");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function review(event: SkillEvent, status: "accepted" | "rejected") {
    setBusy(true);
    try {
      await api.reviewSkillEvent(event.id, status, reviewNotes[event.id] || "");
      setReviewNotes((current) => {
        const next = { ...current };
        delete next[event.id];
        return next;
      });
      await refresh();
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "核实失败");
    } finally {
      setBusy(false);
    }
  }

  const visibleIssues = issues.filter(
    (issue) =>
      (!progressFilter || issue.improvement_status === progressFilter) &&
      `${issue.title} ${issue.skill_name} ${issue.skill_version} ${issue.problem_code}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const visibleEvents = events.filter((event) =>
    `${event.summary} ${event.skill_name} ${event.skill_version} ${event.platform} ${event.correlation_id}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const eventsTitle =
    view === "issues" ? "关联证据" : view === "pending" ? "待核实反馈" : runId ? `任务 #${runId} 的事件` : "事件记录";
  function eventCards() {
    return (
      <div className="feedback-event-list" aria-busy={busy || loadingEvents}>
        {!visibleEvents.length && (
          <div className="feedback-empty">
            <strong>
              {loadingEvents ? "正在加载反馈…" : view === "pending" ? "暂无待核实反馈" : "没有匹配的事件"}
            </strong>
            <p>
              {loadingEvents ? "请稍候。" : query ? "试试其他关键词，或清空搜索。" : "后续收到的反馈会显示在这里。"}
            </p>
          </div>
        )}
        {visibleEvents.map((event) => (
          <article key={event.id} className="feedback-event-card">
            <div className="feedback-event-head">
              <div className="feedback-badges">
                <span className={`feedback-badge is-${event.review_status}`}>{reviewLabels[event.review_status]}</span>
                <span>
                  {event.skill_name} <small>{event.skill_version}</small>
                </span>
                <span className="feedback-muted">{event.platform}</span>
              </div>
              <small className="feedback-muted">{feedbackTime(event.occurred_at)}</small>
            </div>
            <h3>{event.summary || "未填写摘要"}</h3>
            <p className="feedback-event-meta">
              {sourceLabels[event.source]} ·{" "}
              {event.identity === "anonymous_session" ? "外部临时会话（身份未核实）" : "公司账号或历史采集"}
            </p>
            {event.review_note && <p className="feedback-review-note">核实记录：{event.review_note}</p>}
            {event.review_status === "pending" && (
              <div className="feedback-review-form">
                <label className="composer-menu-field">
                  <span>核实说明</span>
                  <textarea
                    placeholder="核对实际产物后，记录确认或驳回的依据"
                    value={reviewNotes[event.id] || ""}
                    onChange={(e) => setReviewNotes((current) => ({ ...current, [event.id]: e.target.value }))}
                  />
                </label>
                <div className="feedback-actions">
                  <button
                    className="feedback-action-primary"
                    disabled={busy || !reviewNotes[event.id]?.trim()}
                    onClick={() => void review(event, "accepted")}
                  >
                    确认并纳入改进
                  </button>
                  <button
                    disabled={busy || !reviewNotes[event.id]?.trim()}
                    onClick={() => void review(event, "rejected")}
                  >
                    驳回并保留记录
                  </button>
                </div>
              </div>
            )}
            <div className="feedback-event-footer">
              <button
                className="feedback-text-button"
                onClick={() => {
                  setQuery("");
                  setRunId(event.run_id);
                  setView("events");
                }}
              >
                查看关联任务
              </button>
              <span className="feedback-muted">事件 #{event.id}</span>
            </div>
            <details className="feedback-disclosure">
              <summary>证据与采集详情</summary>
              <dl className="feedback-metadata">
                <dt>任务标识</dt>
                <dd>{event.correlation_id}</dd>
                <dt>Skill ID</dt>
                <dd>{event.skill_id || "历史名称归属"}</dd>
                <dt>事件类型</dt>
                <dd>{event.event_type}</dd>
                <dt>采集凭证</dt>
                <dd>{event.credential_id ?? "历史 Agent"}</dd>
                <dt>接收时间</dt>
                <dd>{feedbackTime(event.received_at)}（北京时间）</dd>
              </dl>
              <details>
                <summary>评分与评测详情</summary>
                <pre>{JSON.stringify(event.evaluation, null, 2)}</pre>
              </details>
              <details>
                <summary>原始证据</summary>
                <pre>{JSON.stringify(event.evidence, null, 2)}</pre>
              </details>
            </details>
          </article>
        ))}
        {moreEvents && (
          <button className="feedback-load-more" disabled={busy} onClick={() => void more("events")}>
            加载更多证据
          </button>
        )}
      </div>
    );
  }
  return (
    <section className="skill-feedback-workspace">
      <div className="feedback-workspace-head">
        <div>
          <h2>Skill 反馈</h2>
          <p>先核实外部反馈，再跟进确认的问题。</p>
        </div>
        <button disabled={busy} onClick={() => void refresh()}>
          {busy ? "更新中…" : "刷新 Skill 反馈"}
        </button>
      </div>
      <div className="feedback-metrics" aria-label="Skill 反馈统计">
        <div>
          <span>待核实</span>
          <strong>{summary?.pending_review ?? "—"}</strong>
        </div>
        <div>
          <span>改进问题</span>
          <strong>{summary?.issues ?? "—"}</strong>
        </div>
        <div>
          <span>关联任务</span>
          <strong>{summary?.runs ?? "—"}</strong>
        </div>
        <div>
          <span>事件总数</span>
          <strong>{summary?.events ?? "—"}</strong>
        </div>
      </div>
      <div className="feedback-view-bar">
        <nav className="feedback-view-tabs" aria-label="Skill 反馈视图">
          {(
            [
              ["pending", "待核实"],
              ["issues", "改进问题"],
              ["events", "事件记录"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-current={view === value ? "page" : undefined}
              onClick={() => {
                setView(value);
                setRunId(undefined);
                setQuery("");
              }}
            >
              {label}
              {value === "pending" && summary ? <span>{summary.pending_review}</span> : null}
            </button>
          ))}
        </nav>
        <label className="feedback-search">
          <span className="feedback-sr-only">搜索当前已加载{view === "issues" ? "问题" : "事件"}</span>
          <input
            type="search"
            placeholder="搜索摘要、Skill 或平台"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="feedback-inline-error" role="alert">
          {error}
        </p>
      )}
      {view === "issues" ? (
        <div className="feedback-issue-layout">
          <section className="feedback-issue-list" aria-label="改进问题列表">
            <div className="feedback-list-heading">
              <h3>
                问题列表 <small>{visibleIssues.length}</small>
              </h3>
              <label>
                <span className="feedback-sr-only">按改进状态筛选</span>
                <select value={progressFilter} onChange={(e) => setProgressFilter(e.target.value)}>
                  <option value="">全部状态</option>
                  {Object.entries(improvementLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {visibleIssues.map((issue) => (
              <button
                key={issue.id}
                className={`feedback-issue-row ${selectedId === issue.id ? "is-active" : ""}`}
                aria-pressed={selectedId === issue.id}
                onClick={() => setSelectedId(issue.id)}
              >
                <div>
                  <span className={`feedback-badge is-${issue.improvement_status}`}>
                    {improvementLabels[issue.improvement_status]}
                  </span>
                  <small>{feedbackTime(issue.updated_at)}</small>
                </div>
                <strong>{issue.title}</strong>
                <p>
                  {issue.skill_name} · {issue.skill_version}
                </p>
                <small>
                  {issue.evidence_count} 次证据 · {issue.communication_status === "replied" ? "已回复" : "待回复"}
                </small>
              </button>
            ))}
            {!visibleIssues.length && (
              <div className="feedback-empty">
                <strong>暂无匹配的改进问题</strong>
                <p>核实通过的反馈会在这里聚合。</p>
              </div>
            )}
            {moreIssues && (
              <button className="feedback-load-more" disabled={busy} onClick={() => void more("issues")}>
                加载更多问题
              </button>
            )}
          </section>
          <aside className="feedback-issue-detail">
            {selected ? (
              <>
                <header>
                  <span className="feedback-eyebrow">问题 #{selected.id}</span>
                  <h2>{selected.title}</h2>
                  <p>
                    {selected.skill_name} {selected.skill_version} · {selected.evidence_count} 次证据
                  </p>
                </header>
                <div className="feedback-field-grid">
                  <label className="composer-menu-field">
                    <span>沟通状态</span>
                    <select
                      value={draft.communication_status}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          communication_status: event.target.value as SkillIssue["communication_status"],
                        })
                      }
                    >
                      <option value="pending_reply">待回复</option>
                      <option value="replied">已回复</option>
                    </select>
                  </label>
                  <label className="composer-menu-field">
                    <span>改进状态</span>
                    <select
                      value={draft.improvement_status}
                      onChange={(event) =>
                        setDraft({ ...draft, improvement_status: event.target.value as ImprovementStatus })
                      }
                    >
                      {Object.entries(improvementLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {(
                  [
                    ["root_cause", "根因分析"],
                    ["modification_suggestion", "修改建议"],
                    ["retest_result", "复测结果"],
                    ["admin_reply", "回复记录"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="composer-menu-field">
                    <span>{label}</span>
                    <textarea
                      rows={3}
                      value={draft[key]}
                      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                    />
                  </label>
                ))}
                <div className="feedback-save-bar">
                  <p>回复记录保存在后台，不会向外部平台发消息。</p>
                  <button className="feedback-action-primary" disabled={busy} onClick={() => void save()}>
                    保存改进详情
                  </button>
                </div>
                <details className="feedback-disclosure">
                  <summary>问题来源与统计</summary>
                  <p>{selected.sources?.map((source) => sourceLabels[source]).join("、") || "见各次证据"}</p>
                  <p>
                    {selected.submitter_count} 个公司账号 · {selected.anonymous_session_count || 0}{" "}
                    次匿名会话（不代表人数）
                  </p>
                  <p>
                    创建：{feedbackTime(selected.created_at)} · 更新：{feedbackTime(selected.updated_at)}（北京时间）
                  </p>
                  <code>
                    {selected.skill_id || "历史名称归属"} · {selected.problem_code}
                  </code>
                </details>
                <h3 className="feedback-evidence-title">{eventsTitle}</h3>
                {eventCards()}
              </>
            ) : (
              <div className="feedback-empty">
                <strong>选择一条问题</strong>
                <p>在左侧选择后查看原因、修改进展与关联证据。</p>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <>
          <div className="feedback-section-caption">
            <div>
              <h3>{eventsTitle}</h3>
              <p>
                {view === "pending"
                  ? "确认依据后再纳入改进，未经核实的内容不会影响问题状态。"
                  : "包含执行、评测和纠正事件；正常事件只作统计。"}
              </p>
            </div>
            {runId && <button onClick={() => setRunId(undefined)}>返回全部事件</button>}
          </div>
          {eventCards()}
        </>
      )}
      <p className="feedback-scope-note">搜索和状态筛选仅作用于当前已加载记录，时间均为北京时间。</p>
      {summary && (
        <details className="feedback-disclosure feedback-statistics">
          <summary>平台与版本统计</summary>
          <p>自报正常完成 {summary.completed_runs} 次，不代表已核实通过。</p>
          <div className="feedback-stat-rows">
            {summary.by_skill.map((row) => (
              <div key={`${row.platform}/${row.skill_id || "legacy"}/${row.skill_name}/${row.skill_version}`}>
                <strong>
                  {row.skill_name} {row.skill_version}
                </strong>
                <span>{row.platform}</span>
                <span>{row.events} 次事件</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
