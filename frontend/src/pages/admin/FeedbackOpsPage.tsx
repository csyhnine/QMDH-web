import { type FormEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useContentEditor, type ContentOperation } from "./useContentEditor";

import { api, type FeedbackMessage, type FeedbackRecord, type ImprovementStatus } from "../../api";
import SkillFeedbackPanel, { improvementLabels } from "./SkillFeedbackPanel";
import FeedbackCredentials from "./FeedbackCredentials";
import { useAuth } from "../../context/AuthContext";
import "./feedback-ops.css";
import { formatChinaMonthDayTime } from "../../lib/datetime";

type ReplyDraft = {
  status: "open" | "replied" | "closed";
  admin_reply: string;
};

const defaultReply: ReplyDraft = {
  status: "replied",
  admin_reply: "",
};

export type FeedbackOpsPageProps = {
  feedbackItems: FeedbackRecord[];
  error: string;
  onRefresh: () => void | Promise<void>;
  onSetError: (error: string) => void;
};

function messageAuthorLabel(message: FeedbackMessage): string {
  if (message.author_role === "admin") {
    return message.author_display_name || message.author_user_name || "管理员";
  }
  return message.author_display_name || message.author_user_name || "用户";
}

function FeedbackMessageList({ messages }: { messages: FeedbackMessage[] }) {
  return (
    <div className="feedback-message-list">
      {messages.map((message) => (
        <div
          key={`${message.feedback_id}-${message.id}-${message.created_at}`}
          className={`feedback-message-card ${message.author_role === "admin" ? "is-admin" : "is-user"}`}
        >
          <div className="feedback-message-head">
            <strong>{messageAuthorLabel(message)}</strong>
            <small>{formatChinaMonthDayTime(message.created_at)}</small>
          </div>
          <p>{message.body}</p>
          {message.attachment_paths.length > 0 ? (
            <div className="feedback-thread-attachments">
              {message.attachment_paths.map((path) => (
                <a key={path} href={path} target="_blank" rel="noreferrer" className="feedback-thread-image">
                  <img src={path} alt="反馈截图" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function FeedbackOpsPage(props: FeedbackOpsPageProps) {
  const { currentUser, isGuest } = useAuth();
  return <FeedbackOpsContent key={JSON.stringify([currentUser?.id, currentUser?.name, isGuest])} {...props} />;
}

function FeedbackOpsContent({ feedbackItems, error, onRefresh }: FeedbackOpsPageProps) {
  const { canManageUsers } = useAuth();
  const [section, setSection] = useState<"skills" | "manual" | "access">("skills");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const editor = useContentEditor<ReplyDraft, FeedbackRecord>(feedbackItems,
    row => row ? { status: (row.status as ReplyDraft["status"]) || "replied", admin_reply: "" } : defaultReply,
    onRefresh, "反馈");
  const { draft: replyDraft } = editor;
  const selectedFeedback = editor.model.record;
  const saving = editor.busy;
  const manualOperation = useRef<ContentOperation<ReplyDraft, FeedbackRecord> | null>(null);
  const [, redraw] = useState(0);
  const improvementDraft = useMemo(() => ({ value: selectedFeedback?.improvement_status ?? "pending_analysis",
    baseline: selectedFeedback?.improvement_status ?? "pending_analysis", version: 0, dirty: false, error: "", notice: "" }), [editor.model]);
  const feedback = useMemo(() => ({ replyError: "", refreshError: "", refreshSequence: 0 }), [editor.model]);
  const refreshSkillPanel = useMemo(() => () => { void Promise.resolve().then(onRefresh).catch(() => undefined); }, [onRefresh]);
  const improvement = improvementDraft.value;
  function publish() {
    if (editor.isCurrentEditor()) redraw(value => editor.isCurrentEditor() ? value + 1 : value);
  }
  function setImprovement(value: ImprovementStatus) {
    if (!editor.isCurrentEditor()) return;
    improvementDraft.value = value; improvementDraft.version += 1; improvementDraft.dirty = true;
    improvementDraft.error = ""; improvementDraft.notice = ""; publish();
  }
  const openCount = feedbackItems.filter((item) => item.status === "open").length;
  const repliedCount = feedbackItems.filter((item) => item.status === "replied").length;
  const visibleFeedback = feedbackItems
    .filter(
      (item) =>
        (!statusFilter || item.status === statusFilter) &&
        `${item.title} ${item.message} ${item.user_name} ${item.user_display_name}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const closedCount = feedbackItems.filter((item) => item.status === "closed").length;

  useLayoutEffect(() => {
    if (!editor.isCurrentEditor()) return;
    const remote = selectedFeedback?.improvement_status ?? "pending_analysis";
    let changed = false;
    if (!improvementDraft.dirty && improvementDraft.value !== remote) { improvementDraft.value = remote; changed = true; }
    if (improvementDraft.dirty && remote !== improvementDraft.baseline && remote !== improvementDraft.value) {
      improvementDraft.notice = "服务器改进状态已更新，当前未保存的选择已保留。"; changed = true;
    }
    improvementDraft.baseline = remote;
    if (changed) publish();
  }, [editor.model, selectedFeedback?.improvement_status]);

  async function handleReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (manualOperation.current) return manualOperation.current.promise;
    if (!selectedFeedback) { editor.report("请先选择一条反馈记录。"); return; }
    return editor.run(async operation => {
      manualOperation.current = operation; feedback.replyError = "";
      try {
        const values = operation.values;
        if (!values.admin_reply.trim()) { editor.report("请先填写回复内容。", operation); return; }
        let next: FeedbackRecord;
        try {
          next = await api.replyFeedback(operation.id!, { status: values.status, admin_reply: values.admin_reply.trim() });
        } catch (err) {
          if (editor.isCurrentEditor()) {
            feedback.replyError = `上一条回复发送失败，当前输入已保留。${err instanceof Error ? err.message : "保存回复失败"}`; publish();
          }
          return;
        }
        editor.saved(operation, next);
        await editor.refreshAfter(operation);
      } finally { if (manualOperation.current === operation) manualOperation.current = null; }
    });
  }

  async function handleSaveImprovement() {
    if (manualOperation.current) return manualOperation.current.promise;
    if (!selectedFeedback) { editor.report("请先选择一条反馈记录。"); return; }
    const submitted = improvementDraft.value, version = improvementDraft.version, baseline = improvementDraft.baseline;
    return editor.run(async operation => {
      manualOperation.current = operation; improvementDraft.error = ""; improvementDraft.notice = "";
      try {
        let next: FeedbackRecord;
        try { next = await api.updateFeedbackImprovement(operation.id!, submitted); }
        catch (err) {
          if (editor.isCurrentEditor()) {
            improvementDraft.error = `原改进状态保存失败，当前选择已保留。${err instanceof Error ? err.message : "保存改进状态失败"}`; publish();
          }
          return;
        }
        if (editor.isCurrentEditor()) {
          if (next?.id !== operation.id) {
            improvementDraft.notice = "改进状态已响应，但返回反馈身份待确认，请刷新核对。"; publish();
            await editor.refreshAfter(operation); return;
          }
          const received = next.improvement_status ?? submitted;
          const remoteChanged = improvementDraft.baseline !== baseline && improvementDraft.baseline !== received;
          if (!remoteChanged) {
            improvementDraft.baseline = received;
            if (improvementDraft.version === version) { improvementDraft.value = received; improvementDraft.dirty = false; }
          }
          improvementDraft.notice = remoteChanged ? "改进状态提交已完成，期间的服务器变化已保留，请核对。"
            : improvementDraft.version === version ? "改进状态已保存。" : "原改进状态已保存，后续选择已保留，尚未保存。";
          publish();
        }
        await editor.refreshAfter(operation);
      } finally { if (manualOperation.current === operation) manualOperation.current = null; }
    });
  }

  async function handleManualRefresh() {
    const sequence = ++feedback.refreshSequence; feedback.refreshError = ""; publish();
    try { await onRefresh(); }
    catch (err) {
      if (editor.isCurrentEditor() && feedback.refreshSequence === sequence) {
        feedback.refreshError = `人工反馈刷新失败：${err instanceof Error ? err.message : "加载失败"}`; publish();
      }
    }
  }

  return (
    <section className="admin-page feedback-ops-page">
      <header className="admin-page-head">
        <div>
          <span className="feedback-eyebrow">反馈管理</span>
          <h1>反馈中心</h1>
          <p>核实反馈、跟进改进，集中处理用户的问题。</p>
        </div>
      </header>

      <nav className="feedback-main-tabs" aria-label="反馈中心栏目">
        <button aria-current={section === "skills" ? "page" : undefined} onClick={() => setSection("skills")}>
          Skill 反馈
        </button>
        <button aria-current={section === "manual" ? "page" : undefined} onClick={() => setSection("manual")}>
          人工反馈 <span>{openCount}</span>
        </button>
        {canManageUsers && (
          <button aria-current={section === "access" ? "page" : undefined} onClick={() => setSection("access")}>
            接入设置
          </button>
        )}
      </nav>
      <div hidden={section !== "skills"}>
        <SkillFeedbackPanel onUpdated={refreshSkillPanel} />
      </div>
      {section === "access" && canManageUsers && <FeedbackCredentials />}
      <div hidden={section !== "manual"} className="feedback-manual-workspace">
        <div className="feedback-workspace-head">
          <div>
            <h2>人工反馈</h2>
            <p>查看用户对话并回复，改进进度单独保存。</p>
          </div>
          <button type="button" onClick={() => void handleManualRefresh()}>
            刷新人工反馈
          </button>
        </div>

        {error && (
          <p className="feedback-inline-error" role="alert">
            {error}
          </p>
        )}
        {[editor.error, feedback.replyError, feedback.refreshError, improvementDraft.error].filter(Boolean).map((message, index) => (
          <p key={index} className="feedback-inline-error" role="alert">{message}</p>
        ))}
        {editor.model.notice ? <p role="status">{editor.model.notice.replace("反馈已保存。", "回复已发送。").replace("原提交已保存", "原回复已发送")}</p> : null}
        {improvementDraft.notice ? <p role="status">{improvementDraft.notice}</p> : null}
        {editor.model.missing ? <p role="status">原反馈已从列表中移除，回复草稿已保留，请重新选择后再发送。</p> : null}
        <div className="feedback-metrics" aria-label="人工反馈统计">
          {[
            ["反馈总数", feedbackItems.length],
            ["待处理", openCount],
            ["已回复", repliedCount],
            ["已关闭", closedCount],
          ].map(([label, count]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </div>

        <div className="admin-split-layout">
          <section className="admin-table-panel">
            <div className="agent-ops-section-head">
              <div>
                <h2>人工表单反馈</h2>
                <p>最新反馈会排在最前面，方便后台优先处理。</p>
              </div>
            </div>
            <div className="feedback-manual-filters">
              <label>
                <span className="feedback-sr-only">搜索人工反馈</span>
                <input
                  type="search"
                  placeholder="搜索标题、内容或用户"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                <span className="feedback-sr-only">沟通状态筛选</span>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">全部状态</option>
                  <option value="open">待处理</option>
                  <option value="replied">已回复</option>
                  <option value="closed">已关闭</option>
                </select>
              </label>
            </div>
            {!visibleFeedback.length && (
              <div className="feedback-empty">
                <strong>{feedbackItems.length ? "暂无匹配的反馈" : "暂未收到人工反馈"}</strong>
                <p>{feedbackItems.length ? "试试其他关键词或状态。" : "用户提交后会在这里显示。"}</p>
              </div>
            )}
            <div className="admin-data-table feedback-admin-table">
              <div className="admin-table-row admin-table-head">
                <span>用户</span>
                <span>标题</span>
                <span>状态</span>
                <span>更新时间</span>
                <span>回复情况</span>
              </div>
              {visibleFeedback.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={
                    selectedFeedback?.id === item.id
                      ? "admin-table-row feedback-admin-row is-active"
                      : "admin-table-row feedback-admin-row"
                  }
                  disabled={saving}
                  onClick={() => { if (!manualOperation.current && (editor.model.id !== item.id || editor.model.missing || editor.model.unconfirmed)) editor.select(item); }}
                >
                  <span>
                    <strong>{item.user_display_name || item.user_name}</strong>
                    <small>@{item.user_name}</small>
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.message.slice(0, 72)}</small>
                  </span>
                  <span>
                    <em
                      className={`status-pill ${item.status === "replied" ? "status-completed" : item.status === "closed" ? "status-failed" : "status-running"}`}
                    >
                      {item.status === "replied" ? "已回复" : item.status === "closed" ? "已关闭" : "待处理"}
                    </em>
                    <small>人工反馈 · {improvementLabels[item.improvement_status ?? "pending_analysis"]}</small>
                  </span>
                  <span>
                    <strong>{formatChinaMonthDayTime(item.updated_at)}</strong>
                    <small>{formatChinaMonthDayTime(item.created_at)}</small>
                  </span>
                  <span>
                    <strong>
                      {item.messages.some((message) => message.author_role === "admin") ? "已回复" : "待回复"}
                    </strong>
                    <small>{item.replied_by_user_name || "尚未认领"}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <aside className="admin-detail-panel">
            {selectedFeedback ? (
              <form className="admin-side-form" onSubmit={handleReply}>
                <div className="admin-detail-head">
                  <h2>{selectedFeedback.title}</h2>
                  <p>
                    {selectedFeedback.user_display_name || selectedFeedback.user_name} 于{" "}
                    {formatChinaMonthDayTime(selectedFeedback.created_at)} 发起了这条反馈。
                  </p>
                </div>

                <div className="feedback-detail-card">
                  <span>对话记录</span>
                  <FeedbackMessageList messages={selectedFeedback.messages} />
                </div>

                <label className="composer-menu-field">
                  <span>改进状态</span>
                  <select
                    value={improvement}
                    onChange={(event) => setImprovement(event.target.value as ImprovementStatus)}
                  >
                    {Object.entries(improvementLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={saving || editor.model.missing || editor.model.unconfirmed}
                    onClick={() => void handleSaveImprovement()}
                  >
                    保存改进状态
                  </button>
                </label>

                <label className="composer-menu-field">
                  <span>沟通状态（旧记录保留关闭状态）</span>
                  <select
                    value={replyDraft.status}
                    onChange={(event) =>
                      editor.setField("status", event.target.value as ReplyDraft["status"])
                    }
                  >
                    <option value="open">待回复</option>
                    <option value="replied">已回复</option>
                    <option value="closed">已关闭</option>
                  </select>
                </label>

                <label className="composer-menu-field">
                  <span>发送回复</span>
                  <textarea
                    className="feedback-textarea"
                    value={replyDraft.admin_reply}
                    onChange={(event) => editor.setField("admin_reply", event.target.value)}
                    placeholder="在这里回复问题原因、修复进展，或向用户追问更多信息。"
                  />
                </label>

                <div className="template-editor-actions">
                  <button type="submit" className="submit-button" disabled={saving || editor.model.missing || editor.model.unconfirmed}>
                    {saving ? "发送中..." : "发送回复"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="history-digest-empty">
                <strong>还没有选中反馈</strong>
                <p>请从左侧列表中选择一条反馈进行查看和回复。</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
