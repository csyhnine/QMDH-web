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

/** Collapse duplicate keys (keep latest) so persisted history never shows stuck "进行中". */
export function normalizeThinkingSteps(steps: ChatThinkingStep[]): ChatThinkingStep[] {
  const byKey = new Map<string, ChatThinkingStep>();
  const order: string[] = [];
  for (const step of steps) {
    if (!byKey.has(step.key)) {
      order.push(step.key);
    }
    byKey.set(step.key, step);
  }
  return order.map((key) => byKey.get(key)!);
}

export default function ChatAgentThinkingPanel({ steps, compact = false, live = false }: ChatAgentThinkingPanelProps) {
  const normalized = normalizeThinkingSteps(steps);
  if (normalized.length === 0) {
    return null;
  }

  const visibleSteps = compact ? normalized.slice(-4) : normalized;
  const allSettled = visibleSteps.every((step) => step.status === "done" || step.status === "error");
  const heading = live && !allSettled ? "思考中" : "思考过程";

  return (
    <div className={`chat-agent-thinking-panel${compact ? " is-compact is-dock" : ""}${live ? " is-live" : ""}`}>
      <div className={`chat-agent-thinking-head${compact ? " is-compact" : ""}`}>
        <strong>{compact ? heading : "助手思考过程"}</strong>
        {live && !allSettled ? <span className="chat-agent-thinking-live">实时</span> : null}
      </div>
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
