import type { ChatPendingAttachment } from "./chatAttachmentUtils";
import type { QmdhChatRecord } from "./qmdhChatMessageUtils";

export type ChatSendScope = { owner: string; conversationId: number | null; generation: number };
export type ChatSendReceipt = {
  clientMessageId: string; conversationId: number;
  kind: "dispatch" | "accepted" | "http-error" | "not-sent" | "complete" | "incomplete";
  status?: number; userMessageId?: number | null; turnId?: number | null;
};
export type ChatSendFinish = { isError: boolean; isAbort: boolean; isDisconnect: boolean };
export type ChatSendEntry = {
  id: string; scope: Readonly<ChatSendScope>; conversationId: number; rawText: string;
  attachments: ReadonlyArray<Readonly<ChatPendingAttachment>>;
  held: ChatPendingAttachment[]; phase: "pending" | "rejected" | "unknown" | "accepted";
  dispatched: boolean; accepted: boolean; rejected: boolean; complete: boolean;
  settled: boolean; failed: boolean; error: string; userMessageId: number | null;
  checked: boolean; checking: boolean; inspectedMessages: QmdhChatRecord[];
};
export function chatSendScopeKey(scope: ChatSendScope): string {
  return JSON.stringify([scope.owner, scope.conversationId, scope.generation]);
}
export function createChatClientMessageId(): string {
  return `chat-send-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

/** Owns only detached composer previews; messages use durable uploaded URLs. */
export class ChatSendLifecycle {
  private entries = new Map<string, ChatSendEntry>();
  constructor(private releasePreviews: (items: ChatPendingAttachment[]) => void) {}

  begin(id: string, scope: ChatSendScope, rawText: string, attachments: ChatPendingAttachment[]): ChatSendEntry {
    if (scope.conversationId == null || this.blocking(scope.owner, scope.conversationId)) throw new Error("本会话仍有发送中或受理未知的消息，请先核对。");
    if (this.entries.has(id)) throw new Error("发送标识重复，请保留草稿后重试。");
    const copied = attachments.map(item => ({ ...item }));
    const entry: ChatSendEntry = { id, scope: Object.freeze({ ...scope }), conversationId: scope.conversationId,
      rawText, attachments: copied.map(item => Object.freeze({ ...item })), held: copied,
      phase: "pending", dispatched: false, accepted: false, rejected: false, complete: false,
      settled: false, failed: false, error: "", userMessageId: null, checked: false, checking: false, inspectedMessages: [] };
    this.entries.set(id, entry);
    return entry;
  }
  get(id: string): ChatSendEntry | undefined { return this.entries.get(id); }
  forScope(scope: ChatSendScope): ChatSendEntry | undefined {
    return [...this.entries.values()].find(entry => !entry.settled && chatSendScopeKey(entry.scope) === chatSendScopeKey(scope));
  }
  blocking(owner: string, conversationId: number | null): boolean {
    return [...this.entries.values()].some(entry => entry.scope.owner === owner && entry.conversationId === conversationId && (entry.phase === "pending" || entry.phase === "unknown"));
  }
  recoveries(owner: string, conversationId: number | null): ChatSendEntry[] {
    return [...this.entries.values()].filter(entry => entry.scope.owner === owner && entry.conversationId === conversationId && (entry.phase === "rejected" || entry.phase === "unknown"));
  }
  receipt(receipt: ChatSendReceipt): void {
    const entry = this.entries.get(receipt.clientMessageId);
    if (!entry || entry.settled || entry.conversationId !== receipt.conversationId) return;
    if (receipt.kind === "dispatch") entry.dispatched = true;
    if (receipt.kind === "accepted") { entry.accepted = true; entry.userMessageId = receipt.userMessageId ?? null; }
    if (receipt.kind === "not-sent") entry.rejected = true;
    if (receipt.kind === "http-error" && [400, 401, 403, 404, 409, 413, 422].includes(receipt.status ?? 0)) entry.rejected = true;
    if (receipt.kind === "complete") entry.complete = true;
    if (receipt.kind === "incomplete") entry.complete = false;
  }
  error(scope: ChatSendScope, error: unknown): void {
    const entry = this.forScope(scope);
    if (entry) entry.error = error instanceof Error ? error.message : String(error);
  }
  finish(id: string, finish: ChatSendFinish): ChatSendEntry | null {
    const entry = this.entries.get(id);
    if (!entry || entry.settled) return null;
    entry.settled = true;
    entry.failed = finish.isError || finish.isAbort || finish.isDisconnect || !entry.complete;
    if (entry.accepted) {
      entry.phase = "accepted";
      this.release(entry);
      this.entries.delete(id);
    } else entry.phase = entry.rejected || !entry.dispatched ? "rejected" : "unknown";
    return entry;
  }
  takeRejected(id: string): { rawText: string; attachments: ChatPendingAttachment[] } | null {
    const entry = this.entries.get(id);
    if (!entry || entry.phase !== "rejected") return null;
    const result = { rawText: entry.rawText, attachments: entry.held.map(item => ({ ...item })) };
    entry.held = []; // Ownership transfers back to the composer.
    this.entries.delete(id);
    return result;
  }
  discard(id: string): void {
    const entry = this.entries.get(id);
    if (entry) this.release(entry);
    this.entries.delete(id);
  }
  dispose(): void {
    for (const entry of this.entries.values()) this.release(entry);
    this.entries.clear();
  }
  private release(entry: ChatSendEntry): void {
    const held = entry.held;
    entry.held = [];
    this.releasePreviews(held);
  }
}
