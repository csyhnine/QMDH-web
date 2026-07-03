import { useEffect, useState } from "react";

import { api, type AdminAgentTraceRecord, type AdminChatConversationRecord } from "../../api";

type AgentOpsChatObservabilityPanelProps = {
  onSetError: (error: string) => void;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function AgentOpsChatObservabilityPanel({ onSetError }: AgentOpsChatObservabilityPanelProps) {
  const [conversations, setConversations] = useState<AdminChatConversationRecord[]>([]);
  const [traces, setTraces] = useState<AdminAgentTraceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<
    Array<{
      id: number;
      role: string;
      content: string;
      created_at: string;
      agent_tool_calls?: { name: string; summary: string }[];
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([api.adminChatConversations({ limit: 30 }), api.adminAgentTraces({ limit: 20 })])
      .then(([conversationRows, traceRows]) => {
        if (cancelled) return;
        setConversations(conversationRows);
        setTraces(traceRows);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        onSetError(error instanceof Error ? error.message : "加载 Chat 可观测数据失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onSetError]);

  async function handleSelectConversation(conversationId: number) {
    setSelectedId(conversationId);
    try {
      const [messageRows, traceRows] = await Promise.all([
        api.adminChatConversationMessages(conversationId),
        api.adminAgentTraces({ conversationId, limit: 20 }),
      ]);
      setMessages(messageRows);
      setTraces(traceRows);
    } catch (error: unknown) {
      onSetError(error instanceof Error ? error.message : "加载会话详情失败");
    }
  }

  return (
    <section className="admin-table-panel">
      <div className="agent-ops-section-head">
        <div>
          <h2>Chat 可观测（gov-001c）</h2>
          <p>Admin 只读查看设计师 Chat 会话与 Agent assist 审计 trace（基于 audit_logs，非 Langfuse）。</p>
        </div>
        <span>{loading ? "加载中…" : `${conversations.length} 个会话`}</span>
      </div>

      <div className="admin-data-table agent-client-table">
        <div className="admin-table-row admin-table-head">
          <span>会话</span>
          <span>用户</span>
          <span>消息数</span>
          <span>Thread</span>
          <span>更新时间</span>
          <span>操作</span>
        </div>
        {conversations.map((conversation) => (
          <div key={conversation.id} className="admin-table-row">
            <span>
              <strong>{conversation.title || "未命名"}</strong>
              <small>#{conversation.id}</small>
            </span>
            <span>
              <strong>{conversation.user_display_name}</strong>
              <small>{conversation.user_name}</small>
            </span>
            <span>{conversation.message_count}</span>
            <span>
              <small>{conversation.agent_thread_id || "—"}</small>
            </span>
            <span>{formatDate(conversation.updated_at)}</span>
            <span className="admin-row-actions">
              <button type="button" onClick={() => void handleSelectConversation(conversation.id)}>
                查看
              </button>
            </span>
          </div>
        ))}
      </div>

      {selectedId != null ? (
        <div className="agent-ops-subpanel">
          <h3>会话 #{selectedId} 消息（只读）</h3>
          <div className="agent-ops-message-list">
            {messages.map((message) => (
              <article key={message.id} className={`agent-ops-message is-${message.role}`}>
                <header>
                  <strong>{message.role === "user" ? "用户" : "助手"}</strong>
                  <small>{formatDate(message.created_at)}</small>
                </header>
                <p>{message.content || "（空）"}</p>
                {(message.agent_tool_calls?.length ?? 0) > 0 ? (
                  <ul>
                    {message.agent_tool_calls?.map((call) => (
                      <li key={`${call.name}-${call.summary}`}>
                        {call.name}: {call.summary}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>

          <h3>Agent assist traces</h3>
          <div className="admin-data-table agent-client-table">
            <div className="admin-table-row admin-table-head">
              <span>时间</span>
              <span>用户</span>
              <span>Route</span>
              <span>HITL</span>
              <span>Tools</span>
            </div>
            {traces.map((trace) => {
              const details = trace.details ?? {};
              const toolCalls = Array.isArray(details.tool_calls) ? details.tool_calls.join(", ") : "";
              return (
                <div key={trace.id} className="admin-table-row">
                  <span>{formatDate(trace.created_at)}</span>
                  <span>{trace.actor_name}</span>
                  <span>
                    <small>{String(details.route ?? "—")}</small>
                  </span>
                  <span>
                    <small>
                      {details.hitl_pending ? "pending" : details.graph_resumed ? "resumed" : "—"}
                    </small>
                  </span>
                  <span>
                    <small>{toolCalls || "—"}</small>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
