import { useEffect, useMemo } from "react";
import type { AgentEditSessions } from "./useAgentEditSessions";

import { api, type AdminAgentTraceRecord, type AdminChatConversationRecord } from "../../api";

type AgentOpsChatObservabilityPanelProps = {
  owner: AgentEditSessions;
};

type ObservedMessage = Awaited<ReturnType<typeof api.adminChatConversationMessages>>[number];
type ConversationView = {
  conversationId: number;
  conversation: AdminChatConversationRecord | undefined;
  messages: ObservedMessage[];
  traces: AdminAgentTraceRecord[];
  loading: boolean;
  error: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function AgentOpsChatObservabilityPanel({ owner }: AgentOpsChatObservabilityPanelProps) {
  const ui = useMemo(() => ({
    conversations: [] as AdminChatConversationRecord[], overviewTraces: [] as AdminAgentTraceRecord[],
    loading: true, error: "", detail: null as ConversationView | null,
  }), [owner.scope]);
  const { conversations, loading } = ui;
  const selectedId = ui.detail?.conversationId ?? null;
  const messages = ui.detail?.messages ?? [], traces = ui.detail?.traces ?? [];

  useEffect(() => {
    const read = owner.read("chat-observation-overview");
    ui.loading = true; ui.error = ""; owner.publish();
    void Promise.all([api.adminChatConversations({ limit: 30 }), api.adminAgentTraces({ limit: 20 })])
      .then(([conversationRows, traceRows]) => {
        if (!read.allowed()) return;
        ui.conversations = conversationRows; ui.overviewTraces = traceRows; owner.publish();
      })
      .catch((error: unknown) => {
        if (!read.allowed()) return;
        ui.error = error instanceof Error ? error.message : "加载 Chat 可观测数据失败"; owner.publish();
      })
      .finally(() => {
        if (read.allowed()) { ui.loading = false; owner.publish(); }
      });
  }, [owner.scope]);

  async function handleSelectConversation(conversationId: number) {
    if (!owner.isCurrent()) return;
    const view: ConversationView = { conversationId, conversation: conversations.find((row) => row.id === conversationId), messages: [], traces: [], loading: true, error: "" };
    ui.detail = view; owner.touch(); owner.publish();
    const read = owner.read("chat-observation-detail"), allowed = () => read.allowed() && ui.detail === view;
    try {
      const [messageRows, traceRows] = await Promise.all([
        api.adminChatConversationMessages(conversationId),
        api.adminAgentTraces({ conversationId, limit: 20 }),
      ]);
      if (allowed()) { view.messages = messageRows; view.traces = traceRows; owner.publish(); }
    } catch (error: unknown) {
      if (allowed()) { view.error = error instanceof Error ? error.message : "加载会话详情失败"; owner.publish(); }
    } finally {
      if (allowed()) { view.loading = false; owner.publish(); }
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

      {ui.error ? <div className="floating-error" role="alert">{ui.error}</div> : null}
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
          {ui.detail?.conversation ? <p className="agent-policy-note">{ui.detail.conversation.title || "未命名"} · {ui.detail.conversation.user_display_name} ({ui.detail.conversation.user_name})</p> : null}
          {ui.detail?.loading ? <p role="status">正在加载会话 #{selectedId} 的消息与 trace…</p> : null}
          {ui.detail?.error ? <div className="floating-error" role="alert">{ui.detail.error}</div> : null}
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
