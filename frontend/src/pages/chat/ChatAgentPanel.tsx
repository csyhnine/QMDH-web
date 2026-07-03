import type { ChatAgentPolicy } from "./chatAgentConstants";
import { CHAT_AGENT_SUGGESTED_PROMPTS, iconForToolKey } from "./chatAgentConstants";

type ChatAgentPanelProps = {
  policy: ChatAgentPolicy | null;
  loading: boolean;
  onSelectPrompt: (prompt: string) => void;
};

export default function ChatAgentPanel({ policy, loading, onSelectPrompt }: ChatAgentPanelProps) {
  if (loading) {
    return (
      <div className="chat-agent-panel">
        <p className="chat-agent-panel-loading">加载助手配置…</p>
      </div>
    );
  }

  if (!policy) {
    return null;
  }

  return (
    <div className="chat-agent-panel">
      <div className="chat-agent-panel-head">
        <div>
          <strong>QMDH 设计助手</strong>
          <p>{policy.capabilities_summary}</p>
        </div>
        <div className="chat-agent-panel-badges">
          <span className="chat-agent-badge">{policy.environment === "prod" ? "生产策略" : "测试策略"}</span>
          <span className="chat-agent-badge is-muted">{policy.policy_version}</span>
          {policy.release_display_name ? (
            <span className="chat-agent-badge is-muted">{policy.release_display_name}</span>
          ) : null}
        </div>
      </div>

      {policy.personalization_summary ? (
        <p className="chat-agent-drawer-highlight">{policy.personalization_summary}</p>
      ) : null}

      <div className="chat-agent-tool-chips" aria-label="当前可用工具">
        {policy.enabled_tools.map((tool) => (
          <span key={tool.key} className="chat-agent-tool-chip" title={tool.description}>
            <em>{iconForToolKey(tool.key)}</em>
            {tool.label}
          </span>
        ))}
      </div>

      <p className="chat-agent-scope-note">{policy.data_scope_note}</p>

      <div className="chat-agent-suggestions">
        <span>试试这样问：</span>
        <div className="chat-agent-suggestion-list">
          {CHAT_AGENT_SUGGESTED_PROMPTS.map((prompt) => (
            <button key={prompt} type="button" className="chat-agent-suggestion" onClick={() => onSelectPrompt(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
