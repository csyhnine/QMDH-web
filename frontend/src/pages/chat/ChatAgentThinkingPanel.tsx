import type { ChatThinkingStep } from "../../lib/chat/qmdhSseParser";

type ChatAgentThinkingPanelProps = {
  steps: ChatThinkingStep[];
  compact?: boolean;
  live?: boolean;
};

function statusLabel(status: string) {
  if (status === "done") {
    return "完成";
  }
  if (status === "error") {
    return "失败";
  }
  if (status === "running") {
    return "进行中";
  }
  if (status === "waiting") {
    return "待确认";
  }
  return status;
}

export default function ChatAgentThinkingPanel({ steps, compact = false, live = false }: ChatAgentThinkingPanelProps) {
  if (steps.length === 0) {
    return null;
  }

  const visibleSteps = compact ? steps.slice(-4) : steps;

  return (
    <div className={`chat-agent-thinking-panel${compact ? " is-compact is-dock" : ""}${live ? " is-live" : ""}`}>
      {!compact ? (
        <div className="chat-agent-thinking-head">
          <strong>助手思考过程</strong>
          {live ? <span className="chat-agent-thinking-live">实时</span> : null}
        </div>
      ) : (
        <div className="chat-agent-thinking-head is-compact">
          <strong>思考中</strong>
          {live ? <span className="chat-agent-thinking-live">实时</span> : null}
        </div>
      )}
      <ol className="chat-agent-thinking-steps">
        {visibleSteps.map((step) => (
          <li
            key={step.key}
            className={`chat-agent-thinking-step is-${step.status}`}
          >
            <span className="chat-agent-thinking-step-marker" aria-hidden="true" />
            <div className="chat-agent-thinking-step-body">
              <div className="chat-agent-thinking-step-title">
                <span>
                  {step.agent_label ? `${step.agent_label} · ${step.label}` : step.label}
                </span>
                <small>{statusLabel(step.status)}</small>
              </div>
              {step.detail ? <p>{step.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function mergeThinkingSteps(steps: ChatThinkingStep[], incoming: ChatThinkingStep): ChatThinkingStep[] {
  const index = steps.findIndex((step) => step.key === incoming.key);
  if (index === -1) {
    return [...steps, incoming];
  }
  const next = [...steps];
  next[index] = incoming;
  return next;
}
