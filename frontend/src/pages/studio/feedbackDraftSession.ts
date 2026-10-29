export type FeedbackAttachment = { localId?: string; fileName: string; previewUrl: string; storagePath: string };
export type FeedbackDraft = { title: string; message: string; attachments: FeedbackAttachment[] };
export type FeedbackSend = { token: object; promise: Promise<void> };
export type FeedbackUploadSlot = { id: string; order: number };
export type FeedbackUploadBatch = { epoch: number; slots: FeedbackUploadSlot[]; pending: Set<string>; completed: Set<string> };
export const freshFeedbackDraft = (): FeedbackDraft => ({ title: "", message: "", attachments: [] });

/** Page-local observation state; none of these identities are sent to the service. */
export class FeedbackDraftSession {
  active = false;
  intent = 0;
  draftVersion = 0;
  draft = freshFeedbackDraft();
  main: FeedbackSend | null = null;
  uploads = new Set<FeedbackUploadBatch>();
  threads = new Map<number, object>();
  followUps = new Map<number, { thread: object; operation: FeedbackSend }>();
  followUpDrafts: Record<number, { value: string }> = {};
  uploadIssue = "";
  private failedUploadBatches = 0;
  private attachmentEpoch = 0;
  private nextAttachment = 0;
  private attachmentOrder = new Map<string, number>();
  get availableUploadSlots(): number {
    let pending = 0;
    for (const batch of this.uploads) pending += batch.pending.size;
    return Math.max(0, 4 - this.draft.attachments.length - pending);
  }
  reserveUploads(requested: number): FeedbackUploadBatch {
    const count = this.active && Number.isFinite(requested) ? Math.min(this.availableUploadSlots, Math.max(0, Math.floor(requested))) : 0;
    const slots = Array.from({ length: count }, () => {
      const order = ++this.nextAttachment, id = `feedback-attachment-${order}`;
      this.attachmentOrder.set(id, order); return { id, order };
    });
    const batch = { epoch: this.attachmentEpoch, slots, pending: new Set(slots.map((slot) => slot.id)), completed: new Set<string>() };
    if (slots.length) {
      if (this.uploads.size === 0) { this.uploadIssue = ""; this.failedUploadBatches = 0; }
      this.uploads.add(batch); this.draftVersion += 1;
    }
    return batch;
  }
  isUploadCurrent(batch: FeedbackUploadBatch): boolean {
    return this.active && batch.epoch === this.attachmentEpoch && this.uploads.has(batch);
  }
  appendUpload(batch: FeedbackUploadBatch, slot: FeedbackUploadSlot, item: FeedbackAttachment): boolean {
    if (!this.isUploadCurrent(batch) || !batch.slots.includes(slot) || !batch.pending.has(slot.id)) return false;
    batch.pending.delete(slot.id); batch.completed.add(slot.id);
    const attachments = [...this.draft.attachments, { ...item, localId: slot.id }];
    attachments.sort((left, right) => (this.attachmentOrder.get(left.localId || "") ?? -1) - (this.attachmentOrder.get(right.localId || "") ?? -1));
    this.draft = { ...this.draft, attachments }; this.draftVersion += 1;
    return true;
  }
  recordUploadFailure(batch: FeedbackUploadBatch, message: string) {
    if (!this.isUploadCurrent(batch)) return;
    this.failedUploadBatches += 1;
    this.uploadIssue = `${this.failedUploadBatches > 1 ? `有 ${this.failedUploadBatches} 批截图未全部上传；` : ""}${message}`;
  }
  finishUpload(batch: FeedbackUploadBatch) {
    this.uploads.delete(batch);
    for (const id of batch.pending) this.attachmentOrder.delete(id);
    batch.pending.clear();
  }
  removeAttachment(item: FeedbackAttachment): boolean {
    const target = this.draft.attachments.find((entry) => item.localId ? entry.localId === item.localId : entry === item);
    if (!target) return false;
    this.draft = { ...this.draft, attachments: this.draft.attachments.filter((entry) => entry !== target) };
    if (target.localId) this.attachmentOrder.delete(target.localId);
    this.draftVersion += 1; this.intent += 1;
    return true;
  }
  cancelUploads() {
    this.attachmentEpoch += 1;
    for (const batch of this.uploads) this.finishUpload(batch);
  }
  resetDraft(userIntent = true) {
    this.cancelUploads(); this.attachmentOrder.clear();
    this.uploadIssue = ""; this.failedUploadBatches = 0;
    this.draft = freshFeedbackDraft(); this.draftVersion += 1;
    if (userIntent) this.intent += 1;
  }
  syncThreads(openIds: number[]) {
    const active = new Set(openIds);
    for (const id of this.threads.keys()) {
      if (!active.has(id)) { this.threads.delete(id); this.followUps.delete(id); }
    }
    for (const id of active) if (!this.threads.has(id)) this.threads.set(id, {});
  }
}

/** Owns acquired previews until neither their pending model nor committed view uses them. */
export class FeedbackPreviewOwner {
  private owned = new Set<string>();
  private released = new Set<string>();
  private pending = new Map<string, () => boolean>();
  constructor(private release: (url: string) => void) {}
  adopt(url: string, isPendingOwner: () => boolean) {
    if (url.startsWith("blob:") && !this.released.has(url)) { this.owned.add(url); this.pending.set(url, isPendingOwner); }
  }
  discard(url: string) { this.drop(url); }
  observe(draftUrls: string[], listUrls: string[]) {
    const live = new Set([...draftUrls, ...listUrls]);
    for (const url of draftUrls) if (url.startsWith("blob:") && !this.released.has(url)) this.owned.add(url);
    for (const url of this.owned) {
      if (live.has(url)) this.pending.delete(url);
      else if (!this.pending.get(url)?.()) this.drop(url);
    }
  }
  private drop(url: string) {
    this.owned.delete(url); this.pending.delete(url);
    if (!this.released.has(url)) { this.released.add(url); this.release(url); }
  }
  dispose() { for (const url of this.owned) this.drop(url); }
}
