import { useEffect, useMemo, useState } from "react";

import { api, type AgentMemoryRecord } from "../../api";

type ChatAgentMemoryDrawerProps = {
  open: boolean;
  onClose: () => void;
};

const LONG_TERM_TYPES = new Set(["preference", "feedback", "thought", "fact"]);

function memoryTypeLabel(memoryType: string): string {
  switch (memoryType) {
    case "preference":
      return "偏好";
    case "feedback":
      return "反馈";
    case "thought":
      return "想法";
    case "fact":
      return "事实";
    case "summary":
      return "摘要";
    default:
      return memoryType;
  }
}

export default function ChatAgentMemoryDrawer({ open, onClose }: ChatAgentMemoryDrawerProps) {
  const [entries, setEntries] = useState<AgentMemoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void api
      .listChatAgentMemory()
      .then((rows) => {
        if (!cancelled) {
          setEntries(rows);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载记忆失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const longTerm = useMemo(
    () => entries.filter((entry) => LONG_TERM_TYPES.has(entry.memory_type)),
    [entries],
  );
  const summaries = useMemo(
    () => entries.filter((entry) => !LONG_TERM_TYPES.has(entry.memory_type)),
    [entries],
  );

  if (!open) {
    return null;
  }

  async function handlePause(entry: AgentMemoryRecord, paused: boolean) {
    const updated = await api.pauseChatAgentMemory(entry.id, paused);
    setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function handleDelete(entry: AgentMemoryRecord) {
    await api.deleteChatAgentMemory(entry.id);
    setEntries((current) => current.filter((item) => item.id !== entry.id));
  }

  function renderList(rows: AgentMemoryRecord[]) {
    return (
      <div className="chat-agent-memory-list">
        {rows.map((entry) => (
          <article key={entry.id} className={`chat-agent-memory-card${entry.is_paused ? " is-paused" : ""}`}>
            <div className="chat-agent-memory-meta">
              <span className="chat-agent-badge">{memoryTypeLabel(entry.memory_type)}</span>
              {entry.is_paused ? <span className="chat-agent-badge is-muted">已暂停</span> : null}
            </div>
            <p>{entry.content}</p>
            <div className="chat-agent-memory-actions">
              <button type="button" className="ghost-button" onClick={() => void handlePause(entry, !entry.is_paused)}>
                {entry.is_paused ? "恢复注入" : "暂停"}
              </button>
              <button type="button" className="ghost-button" onClick={() => void handleDelete(entry)}>
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="chat-agent-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="chat-agent-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-agent-memory-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="chat-agent-drawer-head">
          <div>
            <h2 id="chat-agent-memory-title">我的记忆库</h2>
            <p>
              仅属于你的私有记忆：优先召回偏好 / 反馈 / 想法 / 事实；会话摘要次之。暂停后不再注入新对话；删除后不可恢复。
            </p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            关闭
          </button>
        </header>

        {loading ? <p className="chat-agent-scope-note">加载中…</p> : null}
        {error ? <p className="chat-task-proposal-result is-error">{error}</p> : null}

        <section className="chat-agent-drawer-section">
          <h3>长期记忆（{longTerm.length}）</h3>
          {longTerm.length === 0 && !loading ? <p className="chat-agent-scope-note">尚无偏好 / 反馈 / 想法 / 事实。</p> : null}
          {renderList(longTerm)}
        </section>

        <section className="chat-agent-drawer-section">
          <h3>会话与回合摘要（{summaries.length}）</h3>
          {summaries.length === 0 && !loading ? <p className="chat-agent-scope-note">尚无摘要条目。</p> : null}
          {renderList(summaries)}
        </section>
      </aside>
    </div>
  );
}
