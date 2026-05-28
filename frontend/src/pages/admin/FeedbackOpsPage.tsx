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
      onSetError("Select a feedback thread first.");
      return;
    }
    if (!replyDraft.admin_reply.trim()) {
      onSetError("Please write a reply before saving.");
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
      onSetError(err instanceof Error ? err.message : "Failed to save reply");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>Feedback Inbox</h1>
          <p>Only administrators can see this queue. Replies written here will be visible to the submitting user.</p>
        </div>
        <button type="button" className="admin-primary-button" onClick={onRefresh}>
          Refresh inbox
        </button>
      </header>

      <div className="admin-kpi-grid">
        <article className="admin-kpi-card admin-blue">
          <div>
            <span>Total threads</span>
            <strong>{feedbackItems.length}</strong>
            <small>All submitted user feedback</small>
          </div>
          <i>FB</i>
        </article>
        <article className="admin-kpi-card admin-orange">
          <div>
            <span>Open</span>
            <strong>{openCount}</strong>
            <small>Still waiting for admin response</small>
          </div>
          <i>OP</i>
        </article>
        <article className="admin-kpi-card admin-green">
          <div>
            <span>Replied</span>
            <strong>{repliedCount}</strong>
            <small>Already answered</small>
          </div>
          <i>RP</i>
        </article>
        <article className="admin-kpi-card admin-gray">
          <div>
            <span>Closed</span>
            <strong>{closedCount}</strong>
            <small>Resolved or archived</small>
          </div>
          <i>CL</i>
        </article>
      </div>

      <div className="admin-split-layout">
        <section className="admin-table-panel">
          <div className="agent-ops-section-head">
            <div>
              <h2>User threads</h2>
              <p>Newest feedback stays at the top so admins can answer quickly.</p>
            </div>
          </div>
          <div className="admin-data-table feedback-admin-table">
            <div className="admin-table-row admin-table-head">
              <span>User</span>
              <span>Title</span>
              <span>Status</span>
              <span>Updated</span>
              <span>Reply</span>
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
                    {item.status}
                  </em>
                </span>
                <span>
                  <strong>{formatDate(item.updated_at)}</strong>
                  <small>{formatDate(item.created_at)}</small>
                </span>
                <span>
                  <strong>{item.admin_reply ? "Replied" : "Pending"}</strong>
                  <small>{item.replied_by_user_name || "No owner yet"}</small>
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
                <p>{selectedFeedback.user_display_name || selectedFeedback.user_name} submitted this on {formatDate(selectedFeedback.created_at)}.</p>
              </div>

              <div className="feedback-detail-card">
                <span>User message</span>
                <p>{selectedFeedback.message}</p>
              </div>

              <label className="composer-menu-field">
                <span>Status</span>
                <select
                  value={replyDraft.status}
                  onChange={(event) =>
                    setReplyDraft((current) => ({
                      ...current,
                      status: event.target.value as ReplyDraft["status"],
                    }))
                  }
                >
                  <option value="open">open</option>
                  <option value="replied">replied</option>
                  <option value="closed">closed</option>
                </select>
              </label>

              <label className="composer-menu-field">
                <span>Admin reply</span>
                <textarea
                  className="feedback-textarea"
                  value={replyDraft.admin_reply}
                  onChange={(event) => setReplyDraft((current) => ({ ...current, admin_reply: event.target.value }))}
                  placeholder="Reply with the fix, explanation, or follow-up request."
                />
              </label>

              {error ? <div className="floating-error">{error}</div> : null}

              <div className="template-editor-actions">
                <button type="submit" className="submit-button" disabled={saving}>
                  {saving ? "Saving..." : "Save reply"}
                </button>
              </div>
            </form>
          ) : (
            <div className="history-digest-empty">
              <strong>No feedback selected</strong>
              <p>Choose a feedback thread from the left to read and reply.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
