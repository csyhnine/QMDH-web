import { useEffect, useRef, useState } from "react";

import { api, buildApiUrl, getAuthHeaders } from "../../api";
import { useAuth } from "../../context/AuthContext";

const ACTIVE_CHAT_STORAGE_KEY = "qmdh.active.chat";

type ChatConversation = {
  id: number;
  title: string;
  model_provider_id: number | null;
  created_at: string;
  updated_at: string;
};

type ChatMessage = {
  id?: number;
  role: string;
  content: string;
  created_at?: string;
};

type ChatModel = {
  provider_id: number;
  provider_name: string;
  display_name: string;
  model_name: string;
  base_url: string;
};

type ChatStreamError = {
  code?: string;
  summary?: string;
  detail?: string;
  status_code?: number;
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

function formatStreamError(error: string | ChatStreamError) {
  if (typeof error === "string") {
    return `提示：${error}`;
  }

  const summary = (error.summary || "对话失败，请稍后重试。").trim();
  const detail = (error.detail || "").trim();
  const code = (error.code || "").trim();
  const lines = [summary];
  if (detail && detail !== summary) {
    lines.push(`排查线索：${detail}`);
  }
  if (code) {
    lines.push(`错误码：${code}`);
  }
  return lines.join("\n");
}

export default function ChatPage() {
  const { currentUser } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(() => {
    const saved = localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null;
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatModels, setChatModels] = useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<number | null>(() => {
    const saved = localStorage.getItem("qmdh_chat_model");
    return saved ? parseInt(saved, 10) : null;
  });
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState("");

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesBottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const pendingInitialScrollRef = useRef(false);

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
      setMessages([]);
      localStorage.removeItem(ACTIVE_CHAT_STORAGE_KEY);
    }
    return nextConversations;
  }

  async function loadConversation(conversationId: number) {
    setChatError("");
    setActiveChatId(conversationId);
    pendingInitialScrollRef.current = true;
    previousMessageCountRef.current = 0;
    try {
      const nextMessages = await api.getChatMessages(conversationId);
      setMessages(nextMessages);
    } catch (error) {
      setMessages([]);
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
          setMessages([]);
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

  const lastMessageContent = messages[messages.length - 1]?.content ?? "";

  useEffect(() => {
    const messageCount = messages.length;
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
  }, [activeChatId, lastMessageContent, messages.length]);

  async function handleCreateConversation() {
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
          setMessages([]);
        }
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "删除会话失败");
    }
  }

  async function handleSendMessage() {
    if (!chatInput.trim() || !activeChatId) {
      return;
    }

    const content = chatInput.trim();
    setChatInput("");
    setChatError("");
    setMessages((prev) => [...prev, { role: "user", content }, { role: "assistant", content: "" }]);
    setStreaming(true);
    shouldAutoScrollRef.current = true;

    try {
      const response = await fetch(buildApiUrl(`/chat/conversations/${activeChatId}/messages`), {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        let detail = "请求失败";
        try {
          const payload = await response.json();
          detail = payload?.detail || detail;
        } catch {
          // Ignore JSON parse failures.
        }
        throw new Error(detail);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("聊天响应流不可用");
      }
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) {
            continue;
          }
          const data = line.slice(6);
          if (data === "[DONE]") {
            break;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.delta) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: `${last.content}${parsed.delta}`,
                  };
                }
                return updated;
              });
            }
            if (parsed.error) {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: formatStreamError(parsed.error as string | ChatStreamError),
                };
                return updated;
              });
            }
          } catch {
            // Ignore malformed chunks.
          }
        }
      }

      await refreshConversations(activeChatId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `提示：请求失败，${message}`,
        };
        return updated;
      });
      setChatError(message);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <section className="chat-page">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-head">
          <button type="button" className="chat-new-btn" onClick={() => void handleCreateConversation()}>
            <span>+</span>
            新对话
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
              <strong>还没有对话</strong>
              <span>选择模型后，新建一个会话开始聊天。</span>
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
              <span className="chat-topbar-title">
                {conversations.find((conversation) => conversation.id === activeChatId)?.title || ""}
              </span>
            ) : null}
          </div>
        </header>

        {activeChatId ? (
          <>
            <div className="chat-messages" ref={messagesRef} onScroll={updateAutoScrollState}>
              {messages.map((message, index) => (
                <div key={message.id || `${message.role}-${index}`} className={`chat-msg ${message.role}`}>
                  {message.role === "assistant" ? <div className="chat-msg-avatar">AI</div> : null}
                  <div className="chat-msg-bubble">
                    <div className="chat-msg-content">
                      {message.content || (streaming && index === messages.length - 1 ? "..." : "")}
                    </div>
                  </div>
                  {message.role === "user" ? (
                    <div className="chat-msg-avatar chat-msg-avatar-user">
                      {(currentUser?.display_name || "U").slice(0, 1)}
                    </div>
                  ) : null}
                </div>
              ))}
              <div ref={messagesBottomRef} aria-hidden="true" />
            </div>

            <div className="chat-input-area">
              <div className="chat-input-box">
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
                  placeholder="和我聊聊吧"
                  rows={1}
                  disabled={streaming}
                />
                <button
                  type="button"
                  className="chat-send-btn"
                  disabled={streaming || !chatInput.trim()}
                  onClick={() => void handleSendMessage()}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13" />
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="chat-empty">
            {chatModels.length === 0 ? (
              <div className="chat-empty-inner">
                <h2>暂无可用模型</h2>
                <p>请先在后台模型管理里启用支持 chat.completions 的模型。</p>
              </div>
            ) : (
              <div className="chat-empty-inner">
                <h2>QMDH Chat</h2>
                <p>选择模型并创建新对话后，就可以开始聊天了。</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
