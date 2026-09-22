import { api } from "../../api";

export type ChatTelemetryEventName =
  | "chat.send.clicked"
  | "chat.send.blocked_busy"
  | "chat.stream.client_error"
  | "chat.stream.status"
  | "chat.conversation.switch"
  | "chat.attachment.upload.start"
  | "chat.attachment.upload.success"
  | "chat.attachment.upload.error";

type PendingTelemetryEvent = {
  event: ChatTelemetryEventName;
  detail?: string;
  correlation_id?: string;
  conversation_id?: number | null;
  client_ts_ms?: number;
};

const PRE_TURN_EVENTS = new Set<ChatTelemetryEventName>([
  "chat.send.clicked",
  "chat.send.blocked_busy",
  "chat.attachment.upload.start",
  "chat.attachment.upload.success",
  "chat.attachment.upload.error",
]);

const pendingEvents: PendingTelemetryEvent[] = [];
const bufferedPreTurnEvents: PendingTelemetryEvent[] = [];
let flushTimer: number | null = null;
let lastReportedStreamStatus = "";

export function rememberChatCorrelationId(correlationId: string | null | undefined) {
  const normalized = (correlationId || "").trim();
  if (!normalized) {
    return;
  }
  sessionStorage.setItem("qmdh.chat.last_correlation_id", normalized);

  if (bufferedPreTurnEvents.length > 0) {
    for (const item of bufferedPreTurnEvents.splice(0)) {
      pendingEvents.push({ ...item, correlation_id: normalized });
    }
    scheduleFlush();
  }
}

export function getLastChatCorrelationId(): string {
  return sessionStorage.getItem("qmdh.chat.last_correlation_id") || "";
}

export function reportChatTelemetry(event: PendingTelemetryEvent) {
  const item: PendingTelemetryEvent = {
    ...event,
    client_ts_ms: event.client_ts_ms ?? Date.now(),
  };
  const explicitCorrelationId = (event.correlation_id || "").trim();

  if (PRE_TURN_EVENTS.has(event.event) && !explicitCorrelationId) {
    bufferedPreTurnEvents.push(item);
    return;
  }

  const correlationId = explicitCorrelationId || getLastChatCorrelationId();
  if (!correlationId) {
    bufferedPreTurnEvents.push(item);
    return;
  }

  pendingEvents.push({ ...item, correlation_id: correlationId });
  scheduleFlush();
}

export function reportChatStreamStatus(label: string, conversationId: number | null | undefined) {
  const normalized = label.trim();
  if (!normalized || normalized === lastReportedStreamStatus) {
    return;
  }
  lastReportedStreamStatus = normalized;
  reportChatTelemetry({
    event: "chat.stream.status",
    detail: normalized.slice(0, 500),
    conversation_id: conversationId ?? null,
  });
}

export function resetChatStreamStatusTelemetry() {
  lastReportedStreamStatus = "";
}

function scheduleFlush() {
  if (flushTimer != null) {
    return;
  }
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushChatTelemetry();
  }, 400);
}

export async function flushChatTelemetry() {
  if (pendingEvents.length === 0) {
    return;
  }
  const batch = pendingEvents.splice(0, pendingEvents.length);
  const events = batch
    .filter((item) => Boolean(item.correlation_id))
    .map((item) => ({
      event: item.event,
      detail: item.detail || "",
      client_ts_ms: item.client_ts_ms,
      correlation_id: item.correlation_id as string,
      conversation_id: item.conversation_id ?? null,
    }));
  if (events.length === 0) {
    return;
  }
  try {
    await api.postChatTelemetry({ events });
  } catch {
    pendingEvents.unshift(...batch);
  }
}

export function mapClientStreamErrorMessage(message: string): string {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return "对话连接异常，请稍后重试。";
  }
  if (normalized.includes("network error") || normalized.includes("failed to fetch")) {
    return "网络连接中断，请等待当前处理结束后再试，不要重复点击发送。";
  }
  if (normalized.includes("aborted") || normalized.includes("abort")) {
    return "上一条请求已中断，请稍候再试。";
  }
  return message;
}
