import type { ChatToolCall } from "../../lib/chat/qmdhSseParser";
import { iconForToolKey, labelForToolCall } from "./chatAgentConstants";

type ChatToolCallListProps = {
  toolCalls: ChatToolCall[];
  compact?: boolean;
  title?: string;
  policyVersion?: string | null;
};

export default function ChatToolCallList({
  toolCalls,
  compact = false,
  title = "助手检索",
  policyVersion,
}: ChatToolCallListProps) {
  if (toolCalls.length === 0) {
    return null;
  }

  return (
    <div className={`chat-tool-call-list${compact ? " is-compact" : ""}`} aria-live="polite">
      <div className="chat-tool-call-head">
        <strong>{title}</strong>
        {policyVersion ? <span className="chat-tool-call-policy">策略 {policyVersion}</span> : null}
      </div>
      {toolCalls.map((call, index) => (
        <div key={`${call.name}-${call.summary}-${index}`} className="chat-tool-call-card">
          <span className="chat-tool-call-icon" aria-hidden="true">
            {iconForToolKey(call.name)}
          </span>
          <div className="chat-tool-call-body">
            <span className="chat-tool-call-name">{labelForToolCall(call)}</span>
            <span className="chat-tool-call-summary">{call.summary}</span>
          </div>
          <span className="chat-tool-call-status">已完成</span>
        </div>
      ))}
    </div>
  );
}
