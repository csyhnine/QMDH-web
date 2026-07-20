import { useChat, type UIMessage } from "@ai-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { getPersistedMessageId, getUiMessageAttachments, getUiMessageText, toUiMessages } from "../../lib/chat/qmdhChatMessageUtils";
import { chatRoundElementId, extractChatRounds } from "../../lib/chat/chatRoundUtils";
import { QmdhChatTransport } from "../../lib/chat/qmdhChatTransport";
import { useChatAttachments } from "../../lib/chat/useChatAttachments";
import ChatConversationNav from "./ChatConversationNav";

const ACTIVE_CHAT_STORAGE_KEY = "qmdh.active.chat";

type ChatConversation = {
  id: number;
  title: string;
  model_provider_id: number | null;
  has_context_summary?: boolean;
  context_usage_percent?: number;
  context_tokens?: number;
  context_window_tokens?: number;
  created_at: string;
  updated_at: string;
};

type ChatModel = {
  provider_id: number;
  provider_name: string;
  display_name: string;
  model_name: string;
  base_url: string;
};

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ChatPage() {
  const { currentUser, isGuest } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(() => {
    const saved = localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null;
  });
  const [chatInput, setChatInput] = useState("");
  const [chatModels, setChatModels] = useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<number | null>(() => {
    const saved = localStorage.getItem("qmdh_chat_model");
    return saved ? parseInt(saved, 10) : null;
  });
  const [chatError, setChatError] = useState("");
  const [exportingMessageId, setExportingMessageId] = useState<string | null>(null);
  const [streamStatusLabel, setStreamStatusLabel] = useState("");
  const [contextUsagePercent, setContextUsagePercent] = useState<number | null>(null);
  const [contextTokens, setContextTokens] = useState<number | null>(null);
  const [contextWindowTokens, setContextWindowTokens] = useState<number | null>(null);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesBottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const pendingInitialScrollRef = useRef(false);
  const activeChatIdRef = useRef<number | null>(activeChatId);
  activeChatIdRef.current = activeChatId;

  const transport = useMemo(
    () =>
      new QmdhChatTransport(() => activeChatIdRef.current, (meta) => {
        if (meta.label) {
          setStreamStatusLabel(meta.label);
        }
        if (meta.context?.usage_percent != null) {
          setContextUsagePercent(meta.context.usage_percent);
        }
        if (meta.context?.tokens != null) {
          setContextTokens(meta.context.tokens);
        }
        if (meta.context?.window_tokens != null) {
          setContextWindowTokens(meta.context.window_tokens);
        }
        if (meta.context?.compressed) {
          setConversations((current) =>
            current.map((conversation) =>
              conversation.id === activeChatIdRef.current
                ? {
                    ...conversation,
                    has_context_summary: true,
                    context_usage_percent: meta.context?.usage_percent ?? conversation.context_usage_percent,
                    context_tokens: meta.context?.tokens ?? conversation.context_tokens,
                    context_window_tokens: meta.context?.window_tokens ?? conversation.context_window_tokens,
                  }
                : conversation,
            ),
          );
        }
      }),
    [],
  );

  const {
    messages: chatMessages,
    sendMessage,
    status,
    setMessages: setChatMessages,
    error: streamError,
  } = useChat({
    id: activeChatId ? String(activeChatId) : "chat-disabled",
    transport,
    // Keep React paints responsive while tokens arrive.
    experimental_throttle: 50,
    onFinish: () => {
      setStreamStatusLabel("");
      const conversationId = activeChatIdRef.current;
      if (conversationId == null) {
        return;
      }
      // Refresh sidebar metadata only. Avoid reloading the whole transcript here —
      // that replaces streaming content with a one-shot DB snapshot and feels like
      // "full dump after thinking". Soft-sync message ids in the background.
      void refreshConversations(conversationId);
      void (async () => {
        try {
          const nextMessages = await api.getChatMessages(conversationId);
          setChatMessages(toUiMessages(nextMessages));
        } catch {
          // Keep the streamed transcript if sync fails.
        }
      })();
    },
  });

  const streaming = status === "streaming" || status === "submitted";
  const activeConversation = conversations.find((conversation) => conversation.id === activeChatId) ?? null;
  const displayUsagePercent = contextUsagePercent ?? activeConversation?.context_usage_percent ?? 0;
  const displayContextTokens = contextTokens ?? activeConversation?.context_tokens ?? 0;
  const displayContextWindow = contextWindowTokens ?? activeConversation?.context_window_tokens ?? 0;
  const attachmentState = useChatAttachments({
    disabled: isGuest || streaming || activeChatId == null,
  });

  function updateAutoScrollState() {
    const element = messagesRef.current;
    if (!element) {
      return;
    }
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= 96;
  }

  function scrollMessagesToBottom(behavior: ScrollBehavior = "auto") {
    messagesBottomRef.current?.scrollIntoView({ block: "end", behavior });
  }

  function resizeTextarea() {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }

  async function refreshConversations(preferredConversationId?: number | null) {
    const nextConversations = await api.getChatConversations();
    setConversations(nextConversations);

    const pinnedConversationId = preferredConversationId ?? activeChatId;
    if (pinnedConversationId == null) {
      return nextConversations;
    }
    if (!nextConversations.some((conversation) => conversation.id === pinnedConversationId)) {
      setActiveChatId(null);
      setChatMessages([]);
      localStorage.removeItem(ACTIVE_CHAT_STORAGE_KEY);
    }
    return nextConversations;
  }

  async function loadConversation(conversationId: number) {
    setChatError("");
    setStreamStatusLabel("");
    setActiveChatId(conversationId);
    pendingInitialScrollRef.current = true;
    previousMessageCountRef.current = 0;
    const listed = conversations.find((item) => item.id === conversationId);
    if (listed) {
      setContextUsagePercent(listed.context_usage_percent ?? 0);
      setContextTokens(listed.context_tokens ?? 0);
      setContextWindowTokens(listed.context_window_tokens ?? 0);
    }
    try {
      const nextMessages = await api.getChatMessages(conversationId);
      setChatMessages(toUiMessages(nextMessages));
    } catch (error) {
      setChatMessages([]);
      setChatError(error instanceof Error ? error.message : "加载会话消息失败");
    }
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        const [models, nextConversations] = await Promise.all([api.getChatModels(), refreshConversations(null)]);
        setChatModels(models);
        setChatError("");

        const initialConversationId = nextConversations[0]?.id ?? null;

        if (initialConversationId !== null) {
          await loadConversation(initialConversationId);
        } else {
          setActiveChatId(null);
          setChatMessages([]);
        }
      } catch (error) {
        setChatError(error instanceof Error ? error.message : "加载 Chat 页面失败");
      }
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    if (activeChatId == null) {
      localStorage.removeItem(ACTIVE_CHAT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, String(activeChatId));
  }, [activeChatId]);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    pendingInitialScrollRef.current = true;
    previousMessageCountRef.current = 0;
  }, [activeChatId]);

  useEffect(() => {
    resizeTextarea();
  }, [chatInput]);

  useEffect(() => {
    if (!streamError) {
      return;
    }
    const message = streamError.message;
    setChatError((current) => (current === message ? current : message));
  }, [streamError]);

  const lastMessage = chatMessages[chatMessages.length - 1];
  const lastMessageContent = lastMessage ? getUiMessageText(lastMessage) : "";

  useEffect(() => {
    const messageCount = chatMessages.length;
    if (messageCount === 0) {
      previousMessageCountRef.current = 0;
      return;
    }

    const hasNewMessage = messageCount > previousMessageCountRef.current;
    const shouldScroll = pendingInitialScrollRef.current || shouldAutoScrollRef.current;

    if (shouldScroll) {
      const behavior: ScrollBehavior = hasNewMessage ? "smooth" : "auto";
      requestAnimationFrame(() => scrollMessagesToBottom(behavior));
      pendingInitialScrollRef.current = false;
    }

    previousMessageCountRef.current = messageCount;
  }, [activeChatId, chatMessages.length, lastMessageContent]);

  async function handleCreateConversation() {
    if (isGuest) {
      setChatError("访客模式无法新建对话，请先登录。");
      return;
    }
    if (!selectedModel) {
      setChatError("请先选择模型。");
      return;
    }

    try {
      const conversation = await api.createChatConversation(selectedModel);
      await refreshConversations(conversation.id);
      await loadConversation(conversation.id);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "创建新对话失败");
    }
  }

  async function handleDeleteConversation(conversationId: number) {
    if (isGuest) {
      setChatError("访客模式无法删除对话，请先登录。");
      return;
    }
    try {
      await api.deleteChatConversation(conversationId);
      const deletingActiveConversation = activeChatId === conversationId;
      const nextConversations = await refreshConversations(deletingActiveConversation ? null : activeChatId);

      if (deletingActiveConversation) {
        const fallbackConversationId = nextConversations[0]?.id ?? null;
        if (fallbackConversationId !== null) {
          await loadConversation(fallbackConversationId);
        } else {
          setActiveChatId(null);
          setChatMessages([]);
        }
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "删除会话失败");
    }
  }

  async function handleExportWord(message: UIMessage) {
    if (!activeChatId) {
      return;
    }
    const text = getUiMessageText(message).trim();
    if (!text) {
      return;
    }

    const messageId = getPersistedMessageId(message);
    setExportingMessageId(message.id);
    setChatError("");
    try {
      await api.exportChatMessageWord(activeChatId, {
        message_id: messageId ?? undefined,
        content: messageId ? undefined : text,
      });
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "导出 Word 失败");
    } finally {
      setExportingMessageId(null);
    }
  }

  async function handleSendMessage() {
    if (isGuest) {
      setChatError("访客模式无法发送消息，请先登录。");
      return;
    }
    const hasText = Boolean(chatInput.trim());
    const hasAttachments = attachmentState.attachments.length > 0;
    if ((!hasText && !hasAttachments) || !activeChatId || streaming || attachmentState.uploading) {
      return;
    }

    const content = chatInput.trim();
    const uiAttachments = attachmentState.attachments.map((item) => ({
      file_name: item.fileName,
      mime_type: item.mimeType,
      url: item.kind === "image" ? item.previewUrl || item.storagePath : item.storagePath,
      storage_path: item.storagePath,
      kind: item.kind,
    }));
    const attachments = attachmentState.toSendPayload();
    setChatInput("");
    setChatError("");
    setStreamStatusLabel("整理上下文…");
    attachmentState.setError("");
    shouldAutoScrollRef.current = true;

    try {
      // Do not await the full stream before showing tokens; useChat updates messages live.
      void sendMessage({ text: content }, { body: { attachments } }).then(() => {
        setChatMessages((current) => {
          const next = [...current];
          for (let index = next.length - 1; index >= 0; index -= 1) {
            if (next[index]?.role === "user") {
              next[index] = {
                ...next[index],
                metadata: {
                  ...(next[index].metadata ?? {}),
                  attachments: uiAttachments,
                },
              };
              break;
            }
          }
          return next;
        });
        attachmentState.clearAttachments();
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "未知错误";
        setChatError(message);
        setStreamStatusLabel("");
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setChatError(message);
      setStreamStatusLabel("");
    }
  }

  const canSendMessage =
    !isGuest &&
    Boolean(activeChatId) &&
    !streaming &&
    !attachmentState.uploading &&
    (Boolean(chatInput.trim()) || attachmentState.attachments.length > 0);

  const chatRounds = useMemo(() => extractChatRounds(chatMessages), [chatMessages]);

  return (
    <section className="chat-page">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-head">
          <button
            type="button"
            className="chat-new-btn"
            disabled={isGuest}
            onClick={() => void handleCreateConversation()}
          >
            <span>+</span>
            {isGuest ? "登录后新建" : "新对话"}
          </button>
          {chatError ? <p className="chat-sidebar-error">{chatError}</p> : null}
        </div>

        <div className="chat-conv-list">
          {conversations.length > 0 ? (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`chat-conv-item ${activeChatId === conversation.id ? "active" : ""}`}
                onClick={() => void loadConversation(conversation.id)}
              >
                <div className="chat-conv-copy">
                  <span className="chat-conv-title">{conversation.title}</span>
                  <small className="chat-conv-time">
                    {formatConversationTime(conversation.updated_at || conversation.created_at)}
                  </small>
                </div>
                <button
                  type="button"
                  className="chat-conv-del"
                  aria-label="删除会话"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteConversation(conversation.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))
          ) : (
            <div className="chat-conv-empty">
              <strong>{isGuest ? "登录后开始对话" : "还没有对话"}</strong>
              <span>{isGuest ? "访客模式可浏览对话界面与模型列表，登录后可新建会话。" : "选择模型后，新建一个会话开始聊天。"}</span>
            </div>
          )}
        </div>
      </aside>

      <div className="chat-main">
        <header className="chat-topbar">
          <div className="chat-topbar-inner">
            <select
              className="chat-model-select"
              value={selectedModel || ""}
              onChange={(event) => {
                const value = parseInt(event.target.value, 10);
                setSelectedModel(value);
                localStorage.setItem("qmdh_chat_model", String(value));
              }}
            >
              <option value="" disabled>
                选择模型
              </option>
              {chatModels.map((model) => (
                <option key={model.provider_id} value={model.provider_id}>
                  {model.display_name || model.model_name}
                </option>
              ))}
            </select>
            {activeChatId ? (
              <div className="chat-topbar-meta">
                <span className="chat-topbar-title">
                  {activeConversation?.title || ""}
                  {activeConversation?.has_context_summary ? (
                    <span className="chat-context-summary-hint" title="早期对话已压缩为摘要，近期消息仍完整保留">
                      已压缩
                    </span>
                  ) : null}
                </span>
                <div
                  className={`chat-context-meter${displayUsagePercent >= 85 ? " is-high" : ""}`}
                  title={`上下文约 ${displayContextTokens} / ${displayContextWindow || "?"} tokens`}
                >
                  <span className="chat-context-meter-label">上下文 {displayUsagePercent}%</span>
                  <span className="chat-context-meter-track" aria-hidden="true">
                    <span className="chat-context-meter-fill" style={{ width: `${Math.min(100, displayUsagePercent)}%` }} />
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </header>

        {activeChatId ? (
          <div
            className={`chat-compose${attachmentState.isDragging ? " is-dragging" : ""}`}
            onDragEnter={attachmentState.handleDragEnter}
            onDragLeave={attachmentState.handleDragLeave}
            onDragOver={attachmentState.handleDragOver}
            onDrop={attachmentState.handleDrop}
          >
            {attachmentState.isDragging ? (
              <div className="chat-drop-overlay" aria-hidden="true">
                <strong>松开鼠标上传</strong>
                <span>支持图片，或 PDF / TXT / MD / JSON / CSV / DOCX / XLSX</span>
              </div>
            ) : null}
            <div className="chat-messages-wrap">
              <div className="chat-messages" ref={messagesRef} onScroll={updateAutoScrollState}>
                {chatMessages.map((message, index) => (
                  <div
                    key={message.id || `${message.role}-${index}`}
                    id={message.role === "user" ? chatRoundElementId(message.id || `user-${index}`) : undefined}
                    className={`chat-msg ${message.role}`}
                  >
                  {message.role === "assistant" ? <div className="chat-msg-avatar">AI</div> : null}
                  <div className="chat-msg-bubble">
                    {getUiMessageAttachments(message).length > 0 ? (
                      <div className="chat-msg-attachments">
                        {getUiMessageAttachments(message).map((attachment) =>
                          attachment.kind === "file" ? (
                            <a
                              key={`${attachment.storage_path}-${attachment.url}`}
                              className="chat-msg-file"
                              href={attachment.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span className="chat-msg-file-icon">DOC</span>
                              <span className="chat-msg-file-name">{attachment.file_name}</span>
                            </a>
                          ) : (
                            <a
                              key={`${attachment.storage_path}-${attachment.url}`}
                              className="chat-msg-attachment"
                              href={attachment.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img src={attachment.url} alt={attachment.file_name || "图片附件"} loading="lazy" />
                            </a>
                          ),
                        )}
                      </div>
                    ) : null}
                    <div
                      className={`chat-msg-content${
                        streaming &&
                        message.role === "assistant" &&
                        index === chatMessages.length - 1 &&
                        !getUiMessageText(message)
                          ? " is-pending"
                          : ""
                      }`}
                    >
                      {getUiMessageText(message) ||
                        (streaming &&
                        message.role === "assistant" &&
                        index === chatMessages.length - 1
                          ? streamStatusLabel || "正在回复…"
                          : "")}
                    </div>
                    {message.role === "assistant" && getUiMessageText(message).trim() ? (
                      <div className="chat-msg-actions">
                        <button
                          type="button"
                          className="chat-export-word-btn"
                          disabled={
                            streaming && index === chatMessages.length - 1
                              ? true
                              : exportingMessageId === message.id
                          }
                          onClick={() => void handleExportWord(message)}
                        >
                          {exportingMessageId === message.id ? "导出中..." : "导出 Word"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {message.role === "user" ? (
                    <div className="chat-msg-avatar chat-msg-avatar-user">
                      {(currentUser?.display_name || "U").slice(0, 1)}
                    </div>
                  ) : null}
                </div>
                ))}
                {streaming && lastMessage?.role === "user" ? (
                  <div className="chat-msg assistant" aria-live="polite">
                    <div className="chat-msg-avatar">AI</div>
                    <div className="chat-msg-bubble">
                      <div className="chat-msg-content is-pending">
                        {streamStatusLabel || "正在回复…"}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div ref={messagesBottomRef} aria-hidden="true" />
              </div>
              <ChatConversationNav rounds={chatRounds} scrollContainerRef={messagesRef} />
            </div>

            <div className="chat-input-area">
              {attachmentState.attachments.length > 0 || attachmentState.error ? (
                <div className="chat-attachment-bar">
                  {attachmentState.attachments.length > 0 ? (
                    <div className="chat-attachment-list">
                      {attachmentState.attachments.map((attachment, index) => (
                        <div
                          key={attachment.storagePath}
                          className={`chat-attachment-chip ${attachment.kind === "file" ? "is-file" : ""}`}
                        >
                          {attachment.kind === "image" ? (
                            <img src={attachment.previewUrl} alt={attachment.fileName} />
                          ) : (
                            <div className="chat-attachment-file">
                              <span>DOC</span>
                              <small>{attachment.fileName}</small>
                            </div>
                          )}
                          <button
                            type="button"
                            className="chat-attachment-remove"
                            aria-label={`移除 ${attachment.fileName}`}
                            onClick={() => attachmentState.removeAttachment(index)}
                            disabled={streaming || attachmentState.uploading}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {attachmentState.error ? <p className="chat-attachment-error">{attachmentState.error}</p> : null}
                </div>
              ) : null}
              <div className="chat-input-box">
                <input
                  ref={attachmentState.fileInputRef}
                  type="file"
                  accept={attachmentState.accept}
                  multiple
                  className="chat-file-input"
                  onChange={attachmentState.handleFileInputChange}
                  disabled={streaming || attachmentState.uploading || !attachmentState.canAddMore}
                />
                <button
                  type="button"
                  className="chat-attach-btn"
                  aria-label="上传图片或文档"
                  disabled={streaming || attachmentState.uploading || !attachmentState.canAddMore}
                  onClick={() => attachmentState.fileInputRef.current?.click()}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none" />
                    <path d="M21 15l-5.2-5.2a1.5 1.5 0 0 0-2.1 0L7 16.5" />
                  </svg>
                </button>
                <textarea
                  ref={textareaRef}
                  className="chat-textarea"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                  placeholder={isGuest ? "登录后可发送消息" : "和我聊聊吧，可附带图片或文档"}
                  rows={1}
                  disabled={isGuest || streaming || attachmentState.uploading}
                />
                <button
                  type="button"
                  className="chat-send-btn"
                  disabled={!canSendMessage}
                  onClick={() => void handleSendMessage()}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13" />
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="chat-empty">
            {chatModels.length === 0 ? (
              <div className="chat-empty-inner">
                <h2>暂无可用模型</h2>
                <p>请先在后台模型管理里启用支持 chat.completions 的模型。</p>
              </div>
            ) : (
              <div className="chat-empty-inner">
                <h2>{isGuest ? "访客模式" : "QMDH Chat"}</h2>
                <p>{isGuest ? "登录后可选择模型并新建会话，与 AI 对话。" : "选择模型并创建新对话后，就可以开始聊天了。"}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
