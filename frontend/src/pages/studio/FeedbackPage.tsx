import { type FormEvent, useState } from "react";

import { api, type FeedbackRecord } from "../../api";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

type Draft = {
  title: string;
  message: string;
};

const defaultDraft: Draft = {
  title: "",
  message: "",
};

export type FeedbackPageProps = {
  feedbackItems: FeedbackRecord[];
  error: string;
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

export default function FeedbackPage({ feedbackItems, error, onRefresh, onSetError }: FeedbackPageProps) {
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [saving, setSaving] = useState(false);

  const repliedCount = feedbackItems.filter((item) => item.status === "replied").length;
  const openCount = feedbackItems.filter((item) => item.status === "open").length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    const message = draft.message.trim();
    if (!title || !message) {
      onSetError("Please describe the issue before submitting feedback.");
      return;
    }

    setSaving(true);
    try {
      await api.createFeedback({ title, message });
      setDraft(defaultDraft);
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="feedback-page">
      <div className="feedback-page-copy">
        <span className="workspace-kicker">Feedback</span>
        <h1>Share issues, blockers, or product suggestions</h1>
        <p>Your feedback goes straight to the admin console. Replies from the admin team will appear in your history below.</p>
      </div>

      <div className="stat-strip feedback-stat-strip">
        <article className="stat-card accent">
          <span>Total threads</span>
          <strong>{feedbackItems.length}</strong>
          <small>Everything you have submitted so far</small>
        </article>
        <article className="stat-card">
          <span>Waiting</span>
          <strong>{openCount}</strong>
          <small>Still waiting for an admin reply</small>
        </article>
        <article className="stat-card">
          <span>Replied</span>
          <strong>{repliedCount}</strong>
          <small>Already answered by an admin</small>
        </article>
      </div>

      <div className="feedback-layout">
        <section className="feedback-panel">
          <div className="feedback-panel-head">
            <div>
              <h2>New feedback</h2>
              <p>Use this for bugs, UI glitches, permission issues, workflow friction, or product ideas.</p>
            </div>
          </div>
          <form className="feedback-form" onSubmit={handleSubmit}>
            <label className="composer-menu-field">
              <span>Title</span>
              <input
                value={draft.title}
                maxLength={150}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Example: generation history overlaps after upload"
              />
            </label>
            <label className="composer-menu-field">
              <span>Message</span>
              <textarea
                className="feedback-textarea"
                value={draft.message}
                maxLength={4000}
                onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
                placeholder="Describe what happened, which account was affected, and what you expected instead."
              />
            </label>
            {error ? <div className="floating-error">{error}</div> : null}
            <div className="template-editor-actions">
              <button type="submit" className="submit-button" disabled={saving}>
                {saving ? "Submitting..." : "Send feedback"}
              </button>
              <button type="button" className="ghost-button" onClick={onRefresh}>
                Refresh history
              </button>
            </div>
          </form>
        </section>

        <section className="feedback-panel">
          <div className="feedback-panel-head">
            <div>
              <h2>Your history</h2>
              <p>Only your own feedback threads and admin replies appear here.</p>
            </div>
          </div>
          <div className="feedback-thread-list">
            {feedbackItems.length === 0 ? (
              <div className="history-digest-empty">
                <strong>No feedback yet</strong>
                <p>Once you send feedback, the admin reply will appear in this panel.</p>
              </div>
            ) : (
              feedbackItems.map((item) => (
                <article key={item.id} className="feedback-thread-card">
                  <div className="feedback-thread-top">
                    <div>
                      <strong>{item.title}</strong>
                      <small>{formatDate(item.created_at)}</small>
                    </div>
                    <em className={`status-pill ${item.status === "replied" ? "status-completed" : item.status === "closed" ? "status-failed" : "status-running"}`}>
                      {item.status}
                    </em>
                  </div>
                  <p>{item.message}</p>
                  {item.admin_reply ? (
                    <div className="feedback-reply-card">
                      <span>Admin reply</span>
                      <strong>{item.replied_by_user_name || "admin"}</strong>
                      <p>{item.admin_reply}</p>
                      <small>{item.replied_at ? formatDate(item.replied_at) : ""}</small>
                    </div>
                  ) : (
                    <div className="feedback-reply-card is-pending">
                      <span>Admin reply</span>
                      <p>No reply yet. The admin team will answer here.</p>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
