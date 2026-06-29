import { type ChangeEvent, type FormEvent, useRef, useState } from "react";

import { api, type FeedbackMessage, type FeedbackRecord } from "../../api";
import { formatChinaMonthDayTime } from "../../lib/datetime";
import { formatUploadSize, MAX_REFERENCE_UPLOAD_BYTES, validateReferenceImageSize } from "../../utils/uploads";

type FeedbackAttachment = {
  fileName: string;
  previewUrl: string;
  storagePath: string;
};

type Draft = {
  title: string;
  message: string;
  attachments: FeedbackAttachment[];
};

const defaultDraft: Draft = {
  title: "",
  message: "",
  attachments: [],
};

export type FeedbackPageProps = {
  feedbackItems: FeedbackRecord[];
  error: string;
  onRefresh: () => void;
  onSetError: (error: string) => void;
};

function messageAuthorLabel(message: FeedbackMessage): string {
  if (message.author_role === "admin") {
    return message.author_display_name || message.author_user_name || "管理员";
  }
  return message.author_display_name || message.author_user_name || "我";
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

export default function FeedbackPage({ feedbackItems, error, onRefresh, onSetError }: FeedbackPageProps) {
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<number, string>>({});
  const [followUpSavingId, setFollowUpSavingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const repliedCount = feedbackItems.filter((item) => item.status === "replied").length;
  const openCount = feedbackItems.filter((item) => item.status === "open").length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    const message = draft.message.trim();
    if (!title || !message) {
      onSetError("请先填写反馈标题和详细说明。");
      return;
    }
    if (uploading) {
      onSetError("截图仍在上传，请稍后再提交。");
      return;
    }

    setSaving(true);
    try {
      await api.createFeedback({
        title,
        message,
        attachment_paths: draft.attachments.map((item) => item.storagePath),
      });
      for (const item of draft.attachments) {
        URL.revokeObjectURL(item.previewUrl);
      }
      setDraft(defaultDraft);
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "提交反馈失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleFollowUpSubmit(event: FormEvent<HTMLFormElement>, feedbackId: number) {
    event.preventDefault();
    const message = (followUpDrafts[feedbackId] || "").trim();
    if (!message) {
      onSetError("请先填写补充说明。");
      return;
    }

    setFollowUpSavingId(feedbackId);
    try {
      await api.appendFeedbackMessage(feedbackId, { message });
      setFollowUpDrafts((current) => ({ ...current, [feedbackId]: "" }));
      onSetError("");
      onRefresh();
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "发送补充说明失败");
    } finally {
      setFollowUpSavingId(null);
    }
  }

  async function handleUploadFiles(files: File[]) {
    if (files.length === 0) return;
    const remainingSlots = 4 - draft.attachments.length;
    if (remainingSlots <= 0) {
      onSetError("最多只能上传 4 张截图。");
      return;
    }

    const validFiles = files.filter((file) => file.type.startsWith("image/"));
    if (validFiles.length !== files.length) {
      onSetError("仅支持上传图片截图。");
    }

    const selectedFiles = validFiles.slice(0, remainingSlots);
    if (selectedFiles.length === 0) return;

    setUploading(true);
    try {
      const nextAttachments = [...draft.attachments];
      for (const file of selectedFiles) {
        const sizeError = validateReferenceImageSize(file);
        if (sizeError) {
          throw new Error(`${file.name}: ${sizeError}`);
        }
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("读取截图失败"));
          reader.readAsDataURL(file);
        });
        const uploaded = await api.uploadReferenceImage({
          file_name: file.name,
          data_url: dataUrl,
        });
        nextAttachments.push({
          fileName: file.name,
          previewUrl: URL.createObjectURL(file),
          storagePath: uploaded.storage_path,
        });
      }
      setDraft((current) => ({ ...current, attachments: nextAttachments }));
      onSetError("");
    } catch (err) {
      onSetError(err instanceof Error ? err.message : "上传截图失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    void handleUploadFiles(files);
  }

  function handleRemoveAttachment(index: number) {
    setDraft((current) => {
      const target = current.attachments[index];
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return {
        ...current,
        attachments: current.attachments.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  }

  return (
    <section className="feedback-page">
      <div className="feedback-page-copy">
        <span className="workspace-kicker">反馈</span>
        <h1>把问题、建议和使用阻塞直接发给管理员</h1>
        <p>提交后可在同一条反馈里继续补充说明，管理员回复后也会在同一线程里显示。</p>
      </div>

      <div className="stat-strip feedback-stat-strip">
        <article className="stat-card accent">
          <span>反馈总数</span>
          <strong>{feedbackItems.length}</strong>
          <small>你提交过的全部反馈</small>
        </article>
        <article className="stat-card">
          <span>待回复</span>
          <strong>{openCount}</strong>
          <small>管理员尚未回复</small>
        </article>
        <article className="stat-card">
          <span>已回复</span>
          <strong>{repliedCount}</strong>
          <small>管理员已经处理</small>
        </article>
      </div>

      <div className="feedback-layout">
        <section className="feedback-panel">
          <div className="feedback-panel-head">
            <div>
              <h2>提交反馈</h2>
              <p>可以反馈 Bug、界面错位、权限异常、模型问题、工作流卡点，也可以直接附上截图。</p>
            </div>
          </div>
          <form className="feedback-form" onSubmit={handleSubmit}>
            <label className="composer-menu-field">
              <span>标题</span>
              <input
                value={draft.title}
                maxLength={150}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="例如：生成页历史卡片错位"
              />
            </label>
            <label className="composer-menu-field">
              <span>详细说明</span>
              <textarea
                className="feedback-textarea"
                value={draft.message}
                maxLength={4000}
                onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
                placeholder="请描述问题出现在哪个页面、用的是哪个账号、你期望看到什么结果。"
              />
            </label>
            <div className="feedback-upload-panel">
              <div className="feedback-upload-head">
                <span className="composer-menu-field">截图</span>
                <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()}>
                  + 上传截图
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleFileInputChange} />
              {draft.attachments.length > 0 ? (
                <div className="feedback-attachment-grid">
                  {draft.attachments.map((item, index) => (
                    <div key={item.storagePath} className="feedback-attachment-card">
                      <img src={item.previewUrl} alt={item.fileName} />
                      <div>
                        <strong>{item.fileName}</strong>
                        <button type="button" onClick={() => handleRemoveAttachment(index)}>
                          移除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="feedback-upload-empty">{`最多上传 4 张截图，单张不超过 ${formatUploadSize(MAX_REFERENCE_UPLOAD_BYTES)}。`}</div>
              )}
            </div>
            {error ? <div className="floating-error">{error}</div> : null}
            <div className="template-editor-actions">
              <button type="submit" className="submit-button" disabled={saving || uploading}>
                {saving ? "提交中..." : uploading ? "上传截图中..." : "发送反馈"}
              </button>
              <button type="button" className="ghost-button" onClick={onRefresh}>
                刷新记录
              </button>
            </div>
          </form>
        </section>

        <section className="feedback-panel">
          <div className="feedback-panel-head">
            <div>
              <h2>我的反馈记录</h2>
              <p>每条反馈都是一条对话线程，你可以继续追问，管理员也会在同一线程里回复。</p>
            </div>
          </div>
          <div className="feedback-thread-list">
            {feedbackItems.length === 0 ? (
              <div className="history-digest-empty">
                <strong>还没有反馈记录</strong>
                <p>提交第一条反馈后，后续讨论会显示在这里。</p>
              </div>
            ) : (
              feedbackItems.map((item) => (
                <article key={item.id} className="feedback-thread-card">
                  <div className="feedback-thread-top">
                    <div>
                      <strong>{item.title}</strong>
                      <small>{formatChinaMonthDayTime(item.updated_at)}</small>
                    </div>
                    <em className={`status-pill ${item.status === "replied" ? "status-completed" : item.status === "closed" ? "status-failed" : "status-running"}`}>
                      {item.status === "replied" ? "已回复" : item.status === "closed" ? "已关闭" : "待处理"}
                    </em>
                  </div>

                  <FeedbackMessageList messages={item.messages} />

                  {item.status === "closed" ? (
                    <div className="feedback-reply-card is-pending">
                      <span>对话状态</span>
                      <p>这条反馈已关闭。如需继续讨论，请提交一条新的反馈。</p>
                    </div>
                  ) : (
                    <form className="feedback-followup-form" onSubmit={(event) => void handleFollowUpSubmit(event, item.id)}>
                      <label className="composer-menu-field">
                        <span>继续补充</span>
                        <textarea
                          className="feedback-textarea"
                          value={followUpDrafts[item.id] || ""}
                          maxLength={4000}
                          onChange={(event) =>
                            setFollowUpDrafts((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder="管理员回复后，你可以在这里继续补充现象、截图说明或新的复现步骤。"
                        />
                      </label>
                      <div className="template-editor-actions">
                        <button type="submit" className="ghost-button" disabled={followUpSavingId === item.id}>
                          {followUpSavingId === item.id ? "发送中..." : "发送补充说明"}
                        </button>
                      </div>
                    </form>
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
