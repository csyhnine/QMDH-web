import { useEffect, useRef, useState } from "react";

import { api, getStoredAuthToken } from "../../api";
import { useAuth } from "../../context/AuthContext";

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
  model_name: string;
  base_url: string;
};

type ChatStreamError = {
  code?: string;
  summary?: string;
  detail?: string;
  status_code?: number;
};

export default function ChatPage() {
  const { currentUser } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatModels, setChatModels] = useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<number | null>(() => {
    const saved = localStorage.getItem("qmdh_chat_model");
    return saved ? parseInt(saved, 10) : null;
  });
  const [streaming, setStreaming] = useState(false);

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

  useEffect(() => {
    api.getChatModels().then(setChatModels).catch(() => {});
    api.getChatConversations().then(setConversations).catch(() => {});
  }, []);

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

  return (
    <section className="chat-page">
      <aside className="chat-sidebar">
        <button
          type="button"
          className="chat-new-btn"
          onClick={async () => {
            if (!selectedModel) {
              alert("请先选择模型");
              return;
            }
            const conversation = await api.createChatConversation(selectedModel);
            setConversations((prev) => [conversation, ...prev]);
            setActiveChatId(conversation.id);
            setMessages([]);
          }}
        >
          <span>+</span>
          新对话
        </button>

        <div className="chat-conv-list">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`chat-conv-item ${activeChatId === conversation.id ? "active" : ""}`}
              onClick={() => {
                setActiveChatId(conversation.id);
                api.getChatMessages(conversation.id).then(setMessages).catch(() => {});
              }}
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
                  api.deleteChatConversation(conversation.id).then(() => {
                    setConversations((prev) => prev.filter((item) => item.id !== conversation.id));
                    if (activeChatId === conversation.id) {
                      setActiveChatId(null);
                      setMessages([]);
                    }
                  });
                }}
              >
                ×
              </button>
            </div>
          ))}
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
                  {model.model_name}
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
                <div key={message.id || index} className={`chat-msg ${message.role}`}>
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
                      document.getElementById("chat-send-btn")?.click();
                    }
                  }}
                  placeholder="和我聊聊天吧"
                  rows={1}
                  disabled={streaming}
                />
                <button
                  id="chat-send-btn"
                  type="button"
                  className="chat-send-btn"
                  disabled={streaming || !chatInput.trim()}
                  onClick={async () => {
                    if (!chatInput.trim() || !activeChatId) {
                      return;
                    }

                    const content = chatInput.trim();
                    setChatInput("");
                    setMessages((prev) => [...prev, { role: "user", content }]);
                    setStreaming(true);
                    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

                    try {
                      const token = getStoredAuthToken();
                      const response = await fetch(`/api/v1/chat/conversations/${activeChatId}/messages`, {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${token}`,
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
                          // ignore JSON parse failures
                        }
                        throw new Error(detail);
                      }

                      const reader = response.body!.getReader();
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
                                    content: last.content + parsed.delta,
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
                            // ignore malformed stream chunks
                          }
                        }
                      }
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
                    }

                    setStreaming(false);
                    api.getChatConversations().then(setConversations).catch(() => {});
                  }}
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
