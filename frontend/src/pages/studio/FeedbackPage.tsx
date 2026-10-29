import { type ChangeEvent, type Dispatch, type FormEvent, type SetStateAction, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, type FeedbackMessage, type FeedbackRecord } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { formatChinaMonthDayTime } from "../../lib/datetime";
import { formatUploadSize, MAX_REFERENCE_UPLOAD_BYTES, validateReferenceImageSize } from "../../utils/uploads";

import { FeedbackDraftSession, FeedbackPreviewOwner, type FeedbackAttachment } from "./feedbackDraftSession";

export type FeedbackPageProps = {
  feedbackItems: FeedbackRecord[];
  error: string;
  onRefresh: (isErrorCurrent?: () => boolean) => void;
  onSetError: Dispatch<SetStateAction<string>>;
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
  const navigate = useNavigate();
  const { isGuest, currentUser } = useAuth();
  const [, redraw] = useState(0);
  const scope = useMemo(() => new FeedbackDraftSession(), [currentUser?.id, currentUser?.name, isGuest]);
  const currentScope = useRef(scope), callbacks = useRef({ onRefresh, onSetError });
  const previews = useRef(new FeedbackPreviewOwner((url) => URL.revokeObjectURL(url)));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draft = scope.draft, followUpDrafts = scope.followUpDrafts;
  const saving = Boolean(scope.main), uploading = scope.uploads.size > 0;
  const isCurrent = () => scope.active && currentScope.current === scope;
  function publish() { if (isCurrent()) redraw((value) => isCurrent() ? value + 1 : value); }
  useLayoutEffect(() => {
    currentScope.current.active = false;
    currentScope.current = scope; scope.active = true;
    return () => {
      scope.active = false;
      queueMicrotask(() => {
        if (!scope.active) scope.cancelUploads();
        if (!currentScope.current.active) previews.current.dispose();
      });
    };
  }, [scope]);
  useLayoutEffect(() => { callbacks.current = { onRefresh, onSetError }; }, [onRefresh, onSetError]);
  useLayoutEffect(() => {
    scope.syncThreads(feedbackItems.filter((item) => item.status !== "closed").map((item) => item.id));
    previews.current.observe(draft.attachments.map((item) => item.previewUrl),
      feedbackItems.flatMap((item) => item.messages.flatMap((message) => message.attachment_paths)));
  }, [scope, draft, feedbackItems]);
  function setDraft(change: SetStateAction<typeof scope.draft>) {
    if (!isCurrent()) return;
    scope.draft = typeof change === "function" ? change(scope.draft) : change;
    scope.draftVersion += 1; scope.intent += 1; publish();
  }
  function setError(message: string, intent: number, owns: () => boolean = () => true) {
    const allowed = () => isCurrent() && scope.intent === intent && owns();
    if (allowed()) callbacks.current.onSetError((current) => allowed() ? message : current);
  }
  function refreshAfterSend(intent: number, owns: () => boolean = () => true) {
    if (!isCurrent()) return;
    const failed = () => setError("反馈已发送，但记录刷新失败，请刷新记录查看。", intent, owns);
    try { void Promise.resolve(callbacks.current.onRefresh(() => isCurrent() && scope.intent === intent && owns())).catch(failed); }
    catch { failed(); }
  }
  function handleFollowUpChange(id: number, value: string) {
    if (!isCurrent() || !scope.threads.has(id)) return;
    scope.followUpDrafts = { ...scope.followUpDrafts, [id]: { value } };
    scope.intent += 1; publish();
  }

  const repliedCount = feedbackItems.filter((item) => item.status === "replied").length;
  const openCount = feedbackItems.filter((item) => item.status === "open").length;

  function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!isCurrent()) return Promise.resolve();
    if (scope.main) return scope.main.promise;
    const intent = ++scope.intent;
    if (isGuest) { setError("访客模式无法提交反馈，请先登录。", intent); return Promise.resolve(); }
    const source = scope.draft, version = scope.draftVersion;
    const title = source.title.trim(), message = source.message.trim();
    if (!title || !message) { setError("请先填写反馈标题和详细说明。", intent); return Promise.resolve(); }
    if (scope.uploads.size > 0) { setError("截图仍在上传，请稍后再提交。", intent); return Promise.resolve(); }
    const payload = { title, message, attachment_paths: source.attachments.map((item) => item.storagePath) };
    const operation = { token: {}, promise: Promise.resolve() };
    scope.main = operation; publish();
    operation.promise = (async () => {
      try {
        await api.createFeedback(payload);
        if (!isCurrent()) return;
        if (scope.main === operation && scope.draft === source && scope.draftVersion === version) {
          scope.resetDraft(false);
        }
        setError("", intent); refreshAfterSend(intent);
      } catch (err) { setError(err instanceof Error ? err.message : "提交反馈失败", intent); }
      finally { if (scope.main === operation) scope.main = null; publish(); }
    })();
    return operation.promise;
  }

  function handleFollowUpSubmit(event: FormEvent<HTMLFormElement>, feedbackId: number): Promise<void> {
    event.preventDefault();
    if (!isCurrent()) return Promise.resolve();
    const thread = scope.threads.get(feedbackId);
    if (!thread) return Promise.resolve();
    const existing = scope.followUps.get(feedbackId); if (existing) return existing.operation.promise;
    const intent = ++scope.intent;
    if (isGuest) { setError("访客模式无法回复反馈，请先登录。", intent); return Promise.resolve(); }
    const source = scope.followUpDrafts[feedbackId], message = (source?.value || "").trim();
    if (!message) { setError("请先填写补充说明。", intent); return Promise.resolve(); }
    const operation = { token: {}, promise: Promise.resolve() };
    const ownsThread = () => scope.threads.get(feedbackId) === thread;
    scope.followUps.set(feedbackId, { thread, operation }); publish();
    operation.promise = (async () => {
      try {
        await api.appendFeedbackMessage(feedbackId, { message });
        if (!isCurrent()) return;
        if (ownsThread() && scope.followUpDrafts[feedbackId] === source) {
          scope.followUpDrafts = { ...scope.followUpDrafts, [feedbackId]: { value: "" } };
        }
        setError("", intent, ownsThread); refreshAfterSend(intent, ownsThread);
      } catch (err) { setError(err instanceof Error ? err.message : "发送补充说明失败", intent, ownsThread); }
      finally {
        if (scope.followUps.get(feedbackId)?.operation === operation) scope.followUps.delete(feedbackId);
        publish();
      }
    })();
    return operation.promise;
  }

  async function handleUploadFiles(files: File[]) {
    if (!isCurrent()) return;
    const intent = ++scope.intent;
    if (isGuest) { setError("访客模式无法上传截图，请先登录。", intent); return; }
    if (files.length === 0) return;
    const remainingSlots = scope.availableUploadSlots;
    if (remainingSlots <= 0) { setError("最多只能上传 4 张截图。", intent); return; }
    const warnings: string[] = [];
    const validFiles = files.filter((file) => file.type.startsWith("image/"));
    if (validFiles.length !== files.length) warnings.push("仅支持上传图片截图，其他文件未上传。");
    const selectedFiles = validFiles.slice(0, remainingSlots);
    if (validFiles.length > remainingSlots) warnings.push("最多只能上传 4 张截图，超出的文件未上传。");
    if (warnings.length) setError(warnings.join(" "), intent);
    if (selectedFiles.length === 0) return;
    const batch = scope.reserveUploads(selectedFiles.length);
    const uploadCurrent = () => isCurrent() && scope.isUploadCurrent(batch);
    publish();
    try {
      for (let index = 0; index < selectedFiles.length; index += 1) {
        if (!uploadCurrent()) return;
        const file = selectedFiles[index], slot = batch.slots[index];
        if (!slot) return;
        const sizeError = validateReferenceImageSize(file);
        if (sizeError) throw new Error(`${file.name}: ${sizeError}`);
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("读取截图失败"));
          reader.readAsDataURL(file);
        });
        if (!uploadCurrent()) return;
        const uploaded = await api.uploadReferenceImage({ file_name: file.name, data_url: dataUrl });
        if (!uploadCurrent()) return;
        const storagePath = String(uploaded?.storage_path || "").trim();
        if (!storagePath) throw new Error("上传未返回有效截图路径");
        const previewUrl = URL.createObjectURL(file);
        previews.current.adopt(previewUrl, () => isCurrent() && scope.draft.attachments.some((item) => item.previewUrl === previewUrl));
        if (!scope.appendUpload(batch, slot, { fileName: file.name, previewUrl, storagePath })) {
          previews.current.discard(previewUrl);
          return;
        }
        publish();
      }
      setError(warnings.join(" "), intent);
    } catch (err) {
      if (uploadCurrent()) {
        const kept = scope.draft.attachments.filter((item) => item.localId && batch.completed.has(item.localId)).length;
        const detail = err instanceof Error ? err.message : "上传截图失败";
        scope.recordUploadFailure(batch, `${kept ? `已保留 ${kept} 张成功上传的截图；` : ""}${detail}。未完成的截图请重新选择。`);
        setError(scope.uploadIssue, intent);
      }
    } finally { scope.finishUpload(batch); publish(); }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (!isCurrent()) return;
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    void handleUploadFiles(files);
  }

  function handleRemoveAttachment(item: FeedbackAttachment) {
    if (isCurrent() && scope.removeAttachment(item)) publish();
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
                onChange={(event) => { const value = event.target.value; setDraft((current) => ({ ...current, title: value })); }}
                placeholder="例如：生成页历史卡片错位"
              />
            </label>
            <label className="composer-menu-field">
              <span>详细说明</span>
              <textarea
                className="feedback-textarea"
                value={draft.message}
                maxLength={4000}
                onChange={(event) => { const value = event.target.value; setDraft((current) => ({ ...current, message: value })); }}
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
                  {draft.attachments.map((item) => (
                    <div key={item.localId || item.storagePath} className="feedback-attachment-card">
                      <img src={item.previewUrl} alt={item.fileName} />
                      <div>
                        <strong>{item.fileName}</strong>
                        <button type="button" onClick={() => handleRemoveAttachment(item)}>
                          移除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="feedback-upload-empty">{`最多上传 4 张截图，单张不超过 ${formatUploadSize(MAX_REFERENCE_UPLOAD_BYTES)}。`}</div>
              )}
              {scope.uploadIssue && scope.uploadIssue !== error ? <div className="floating-error" role="status">{scope.uploadIssue}</div> : null}
            </div>
            {error ? <div className="floating-error">{error}</div> : null}
            <div className="template-editor-actions">
              <button
                type="submit"
                className="submit-button"
                disabled={isGuest || saving || uploading}
              >
                {isGuest ? "登录后发送反馈" : saving ? "提交中..." : uploading ? "上传截图中..." : "发送反馈"}
              </button>
              {!isGuest ? (
                <button type="button" className="ghost-button" onClick={() => onRefresh()}>
                  刷新记录
                </button>
              ) : (
                <button type="button" className="ghost-button" onClick={() => navigate("/login")}>
                  登录
                </button>
              )}
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
                <strong>{isGuest ? "登录后参与反馈" : "还没有反馈记录"}</strong>
                <p>{isGuest ? "访客模式可浏览反馈界面，登录后可提交问题并与管理员对话。" : "提交第一条反馈后，后续讨论会显示在这里。"}</p>
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
                          value={followUpDrafts[item.id]?.value || ""}
                          maxLength={4000}
                          onChange={(event) => handleFollowUpChange(item.id, event.target.value)}
                          placeholder="管理员回复后，你可以在这里继续补充现象、截图说明或新的复现步骤。"
                        />
                      </label>
                      <div className="template-editor-actions">
                        <button type="submit" className="ghost-button" disabled={scope.followUps.has(item.id)}>
                          {scope.followUps.has(item.id) ? "发送中..." : "发送补充说明"}
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
