import { useState, useEffect } from "react";
import { api } from "../../api";
import { useAuth } from "../../context/AuthContext";

/* ─── Types ─── */

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

/* ─── Component ─── */

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

  useEffect(() => {
    api.getChatModels().then(setChatModels).catch(() => {});
    api.getChatConversations().then(setConversations).catch(() => {});
  }, []);

  return (
    <section className="chat-page">
      {/* Left sidebar - conversations */}
      <aside className="chat-sidebar">
        <button type="button" className="chat-new-btn" onClick={async () => {
          if (!selectedModel) { alert("请先选择模型"); return; }
          const conv = await api.createChatConversation(selectedModel);
          setConversations((prev) => [conv, ...prev]);
          setActiveChatId(conv.id);
          setMessages([]);
        }}>
          <span>＋</span> 新对话
        </button>
        <div className="chat-conv-list">
          {conversations.map((conv) => (
            <div key={conv.id} className={`chat-conv-item ${activeChatId === conv.id ? "active" : ""}`} onClick={() => { setActiveChatId(conv.id); api.getChatMessages(conv.id).then(setMessages).catch(() => {}); }}>
              <span className="chat-conv-title">{conv.title}</span>
              <button type="button" className="chat-conv-del" onClick={(e) => { e.stopPropagation(); api.deleteChatConversation(conv.id).then(() => { setConversations((prev) => prev.filter((c) => c.id !== conv.id)); if (activeChatId === conv.id) { setActiveChatId(null); setMessages([]); } }); }}>×</button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="chat-main">
        <header className="chat-topbar">
          <select className="chat-model-select" value={selectedModel || ""} onChange={(e) => { const v = parseInt(e.target.value, 10); setSelectedModel(v); localStorage.setItem("qmdh_chat_model", String(v)); }}>
            <option value="" disabled>选择模型</option>
            {chatModels.map((m) => <option key={m.provider_id} value={m.provider_id}>{m.model_name}</option>)}
          </select>
          {activeChatId ? <span className="chat-topbar-title">{conversations.find((c) => c.id === activeChatId)?.title || ""}</span> : null}
        </header>

        {activeChatId ? (
          <>
            <div className="chat-messages" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
              {messages.map((msg, i) => (
                <div key={msg.id || i} className={`chat-msg ${msg.role}`}>
                  {msg.role === "assistant" ? <div className="chat-msg-avatar">AI</div> : null}
                  <div className="chat-msg-bubble">
                    <div className="chat-msg-content">{msg.content || (streaming && i === messages.length - 1 ? "●" : "")}</div>
                  </div>
                  {msg.role === "user" ? <div className="chat-msg-avatar chat-msg-avatar-user">{(currentUser?.display_name || "U").slice(0, 1)}</div> : null}
                </div>
              ))}
            </div>

            <div className="chat-input-area">
              <div className="chat-input-box">
                <textarea className="chat-textarea" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); document.getElementById("chat-send-btn")?.click(); } }} placeholder="和我聊聊天吧" rows={1} disabled={streaming} />
                <button id="chat-send-btn" type="button" className="chat-send-btn" disabled={streaming || !chatInput.trim()} onClick={async () => {
                  if (!chatInput.trim() || !activeChatId) return;
                  const content = chatInput.trim();
                  setChatInput("");
                  setMessages((prev) => [...prev, { role: "user", content }]);
                  setStreaming(true);
                  setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
                  try {
                    const token = localStorage.getItem("qmdh_token") || "";
                    const resp = await fetch(`/api/v1/chat/conversations/${activeChatId}/messages`, {
                      method: "POST",
                      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ content }),
                    });
                    if (!resp.ok) throw new Error("请求失败");
                    const reader = resp.body!.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      buffer += decoder.decode(value, { stream: true });
                      const lines = buffer.split("\n");
                      buffer = lines.pop() || "";
                      for (const line of lines) {
                        if (!line.startsWith("data: ")) continue;
                        const data = line.slice(6);
                        if (data === "[DONE]") break;
                        try {
                          const parsed = JSON.parse(data);
                          if (parsed.delta) {
                            setMessages((prev) => { const updated = [...prev]; const last = updated[updated.length - 1]; if (last && last.role === "assistant") { updated[updated.length - 1] = { ...last, content: last.content + parsed.delta }; } return updated; });
                          }
                          if (parsed.error) {
                            setMessages((prev) => { const updated = [...prev]; updated[updated.length - 1] = { role: "assistant", content: `⚠️ ${parsed.error}` }; return updated; });
                          }
                        } catch {}
                      }
                    }
                  } catch (err: any) {
                    setMessages((prev) => { const updated = [...prev]; updated[updated.length - 1] = { role: "assistant", content: `⚠️ 请求失败: ${err?.message || "未知错误"}` }; return updated; });
                  }
                  setStreaming(false);
                  api.getChatConversations().then(setConversations).catch(() => {});
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="chat-empty">
            {chatModels.length === 0 ? (
              <div className="chat-empty-inner"><h2>暂无可用模型</h2><p>请在后台模型管理中添加 capabilities 包含 &quot;chat.completions&quot; 的模型</p></div>
            ) : (
              <div className="chat-empty-inner"><h2>QMDH Chat</h2><p>选择模型，创建新对话开始聊天</p></div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
