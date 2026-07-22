import type { ChatStreamError } from "./types";

export type ChatToolCall = {
  name: string;
  summary: string;
};

export type ChatThinkingStep = {
  key: string;
  label: string;
  detail: string;
  status: string;
  agent_key?: string;
  agent_label?: string;
};

export type ChatTaskProposal = {
  proposal_id: string;
  workflow_key: string;
  title: string;
  project_code: string;
  requested_provider: string;
  provider_display_name: string;
  classification: string;
  payload: Record<string, unknown>;
  summary: string;
  status?: string;
  task_id?: number | null;
  task_status?: string | null;
  result_urls?: string[];
};

export type QmdhSsePayload = {
  delta?: string;
  error?: ChatStreamError | string;
  usage?: Record<string, number>;
  status?: string;
  label?: string;
  context?: {
    tokens?: number;
    window_tokens?: number;
    budget_tokens?: number;
    usage_percent?: number;
    compressed?: boolean;
    just_compressed?: boolean;
  };
  thinking_step?: ChatThinkingStep;
  tool_calls?: ChatToolCall[];
  tool_result?: ChatToolCall;
  task_proposals?: ChatTaskProposal[];
  policy_version?: string;
  release_display_name?: string;
};

export function parseQmdhSseLine(line: string): "skip" | "done" | QmdhSsePayload {
  if (!line.startsWith("data: ")) {
    return "skip";
  }
  const data = line.slice(6);
  if (data === "[DONE]") {
    return "done";
  }
  try {
    return JSON.parse(data) as QmdhSsePayload;
  } catch {
    return "skip";
  }
}
