import { useEffect, useRef, useState } from "react";

import { api } from "../../api";

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatModel = {
  provider_id: number;
  provider_name: string;
  display_name: string;
  model_name: string;
};

const SUGGESTIONS = [
  "帮我找商业综合体相关的共享模板",
  "当前启用了哪些视频生成模型？",
  "总结一下可用的 workflow 和 provider",
];

const ASSISTANT_MODEL_STORAGE_KEY = "qmdh.studio-assistant.model";

export default function StudioAssistantPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chatModels, setChatModels] = useState<ChatModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(() => {
    const saved = localStorage.getItem(ASSISTANT_MODEL_STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null;
  });
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "我是 Studio 助手，可以帮你搜索灵感、共享模板，并解释当前可用的模型与 workflow。实际生图仍需在下方创作台提交任务。",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    // Scroll on each render while panel is open; transcript length changes without a stable dep Biome accepts.
  });

  useEffect(() => {
    if (!open || chatModels.length > 0) {
      return;
    }
    api
      .getChatModels()
      .then((models) => {
        setChatModels(models);
        if (selectedModelId === null && models[0]) {
          setSelectedModelId(models[0].provider_id);
        } else if (selectedModelId !== null && !models.some((model) => model.provider_id === selectedModelId)) {
          setSelectedModelId(models[0]?.provider_id ?? null);
        }
      })
      .catch(() => setChatModels([]));
  }, [chatModels.length, open, selectedModelId]);

  useEffect(() => {
    if (selectedModelId === null) {
      localStorage.removeItem(ASSISTANT_MODEL_STORAGE_KEY);
      return;
    }
    localStorage.setItem(ASSISTANT_MODEL_STORAGE_KEY, String(selectedModelId));
  }, [selectedModelId]);

  async function handleSend(message?: string) {
    const content = (message ?? input).trim();
    if (!content || loading) {
      return;
    }
    if (selectedModelId === null) {
      setError("请先选择助手模型。");
      return;
    }

    setInput("");
    setError("");
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content },
      { id: `assistant-${Date.now()}`, role: "assistant", content: "" },
    ]);
    setLoading(true);

    try {
      const result = await api.studioAgentAssist({ message: content, provider_id: selectedModelId });
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          updated[updated.length - 1] = {
            role: "assistant",
            content: `${result.reply}\n\n— ${result.provider_name} / ${result.model_name}`,
          };
        }
        return updated;
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "助手请求失败";
      setError(detail);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          updated[updated.length - 1] = { role: "assistant", content: `暂时无法回答：${detail}` };
        }
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`studio-assistant-root ${open ? "open" : ""}`}>
      <button
        type="button"
        className="studio-assistant-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "收起助手" : "Studio 助手"}
      </button>

      {open ? (
        <section className="studio-assistant-panel" aria-label="Studio 助手">
          <header className="studio-assistant-header">
            <div>
              <strong>Studio 助手</strong>
              <p>搜索灵感 / 模板，解释模型与 workflow；不直接代替生图提交。</p>
            </div>
            <button type="button" className="ghost-button" onClick={() => setOpen(false)}>
              关闭
            </button>
          </header>

          <label className="studio-assistant-model-select">
            <span>助手模型</span>
            <select
              value={selectedModelId ?? ""}
              onChange={(event) => setSelectedModelId(parseInt(event.target.value, 10))}
              disabled={loading || chatModels.length === 0}
            >
              {chatModels.length === 0 ? <option value="">暂无可用 chat 模型</option> : null}
              {chatModels.map((model) => (
                <option key={model.provider_id} value={model.provider_id}>
                  {model.display_name || model.model_name}
                </option>
              ))}
            </select>
          </label>

          <div className="studio-assistant-suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="studio-assistant-chip"
                disabled={loading || selectedModelId === null}
                onClick={() => void handleSend(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="studio-assistant-messages" ref={scrollRef}>
            {messages.map((message, index) => (
              <div key={message.id} className={`studio-assistant-message ${message.role}`}>
                <span className="studio-assistant-message-role">{message.role === "user" ? "你" : "助手"}</span>
                <div className="studio-assistant-message-body">
                  {message.content || (loading && index === messages.length - 1 ? "思考中..." : "")}
                </div>
              </div>
            ))}
          </div>

          {error ? <p className="studio-assistant-error">{error}</p> : null}

          <form
            className="studio-assistant-input"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="例如：帮我找夜景商业综合体模板"
              rows={2}
              disabled={loading || selectedModelId === null}
            />
            <button
              type="submit"
              className="primary-button"
              disabled={loading || !input.trim() || selectedModelId === null}
            >
              发送
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
