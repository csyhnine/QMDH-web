import { type FormEvent, useEffect, useState } from "react";

import { api, type FeedbackRecord } from "../../api";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

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
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

export default function FeedbackOpsPage({ feedbackItems, error, onRefresh, onSetError }: FeedbackOpsPageProps) {
  const [selectedId, setSelectedId] = useState<number | null>(feedbackItems[0]?.id ?? null);
  const [replyDraft, setReplyDraft] = useState<ReplyDraft>(defaultReply);
  const [saving, setSaving] = useState(false);

  const selectedFeedback = feedbackItems.find((item) => item.id === selectedId) ?? feedbackItems[0] ?? null;
  const openCount = feedbackItems.filter((item) => item.status === "open").length;
  const repliedCount = feedbackItems.filter((item) => item.status === "replied").length;
  const closedCount = feedbackItems.filter((item) => item.status === "closed").length;

  useEffect(() => {
    if (!selectedFeedback) {
      setSelectedId(null);
      setReplyDraft(defaultReply);
      return;
    }
    setSelectedId(selectedFeedback.id);
    setReplyDraft({
      status: (selectedFeedback.status as ReplyDraft["status"]) || "replied",
      admin_reply: selectedFeedback.admin_reply || "",
    });
  }, [selectedFeedback?.id]);

  async function handleReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFeedback) {
      onSetError("请先选择一条反馈记录。");
      return;
    }
    if (!replyDraft.admin_reply.trim()) {
      onSetError("请先填写回复内容。");
      return;
    }

    setSaving(true);
    try {
      await api.replyFeedback(selectedFeedback.id, {
        status: replyDraft.status,
        admin_reply: replyDraft.admin_reply.trim(),
      });
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "保存回复失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>反馈收件箱</h1>
          <p>这里只有管理员可见。在这里回复后，提交反馈的用户会在自己的反馈页看到你的回复。</p>
        </div>
        <button type="button" className="admin-primary-button" onClick={onRefresh}>
          刷新收件箱
        </button>
      </header>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card admin-blue">
          <div>
            <span>反馈总数</span>
            <strong>{feedbackItems.length}</strong>
            <small>全部用户反馈</small>
          </div>
          <i>FB</i>
        </article>
        <article className="admin-kpi-card admin-orange">
          <div>
            <span>待处理</span>
            <strong>{openCount}</strong>
            <small>等待管理员回复</small>
          </div>
          <i>OP</i>
        </article>
        <article className="admin-kpi-card admin-green">
          <div>
            <span>已回复</span>
            <strong>{repliedCount}</strong>
            <small>已经处理完成</small>
          </div>
          <i>RP</i>
        </article>
        <article className="admin-kpi-card admin-gray">
          <div>
            <span>已关闭</span>
            <strong>{closedCount}</strong>
            <small>已归档或关闭</small>
          </div>
          <i>CL</i>
        </article>
      </div>

      <div className="admin-split-layout">
        <section className="admin-table-panel">
          <div className="agent-ops-section-head">
            <div>
              <h2>用户反馈列表</h2>
              <p>最新反馈会排在最前面，方便后台优先处理。</p>
            </div>
          </div>
          <div className="admin-data-table feedback-admin-table">
            <div className="admin-table-row admin-table-head">
              <span>用户</span>
              <span>标题</span>
              <span>状态</span>
              <span>更新时间</span>
              <span>回复情况</span>
            </div>
            {feedbackItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={selectedFeedback?.id === item.id ? "admin-table-row feedback-admin-row is-active" : "admin-table-row feedback-admin-row"}
                onClick={() => setSelectedId(item.id)}
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
                  <em className={`status-pill ${item.status === "replied" ? "status-completed" : item.status === "closed" ? "status-failed" : "status-running"}`}>
                    {item.status === "replied" ? "已回复" : item.status === "closed" ? "已关闭" : "待处理"}
                  </em>
                </span>
                <span>
                  <strong>{formatDate(item.updated_at)}</strong>
                  <small>{formatDate(item.created_at)}</small>
                </span>
                <span>
                  <strong>{item.admin_reply ? "已回复" : "待回复"}</strong>
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
                <p>{selectedFeedback.user_display_name || selectedFeedback.user_name} 于 {formatDate(selectedFeedback.created_at)} 提交了这条反馈。</p>
              </div>

              <div className="feedback-detail-card">
                <span>用户描述</span>
                <p>{selectedFeedback.message}</p>
              </div>
              {selectedFeedback.attachment_paths.length > 0 ? (
                <div className="feedback-detail-card">
                  <span>用户截图</span>
                  <div className="feedback-thread-attachments">
                    {selectedFeedback.attachment_paths.map((path) => (
                      <a key={path} href={path} target="_blank" rel="noreferrer" className="feedback-thread-image">
                        <img src={path} alt="反馈截图" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="composer-menu-field">
                <span>状态</span>
                <select
                  value={replyDraft.status}
                  onChange={(event) =>
                    setReplyDraft((current) => ({
                      ...current,
                      status: event.target.value as ReplyDraft["status"],
                    }))
                  }
                >
                  <option value="open">待处理</option>
                  <option value="replied">已回复</option>
                  <option value="closed">已关闭</option>
                </select>
              </label>

              <label className="composer-menu-field">
                <span>管理员回复</span>
                <textarea
                  className="feedback-textarea"
                  value={replyDraft.admin_reply}
                  onChange={(event) => setReplyDraft((current) => ({ ...current, admin_reply: event.target.value }))}
                  placeholder="在这里回复问题原因、修复进展，或需要用户补充的信息。"
                />
              </label>

              {error ? <div className="floating-error">{error}</div> : null}

              <div className="template-editor-actions">
                <button type="submit" className="submit-button" disabled={saving}>
                  {saving ? "保存中..." : "保存回复"}
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
    </section>
  );
}
