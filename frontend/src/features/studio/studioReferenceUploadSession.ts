import type { ReferenceUploadItem } from "./studioTypes";

let nextIdentity = 0;
const identity = () => `reference-${++nextIdentity}`;
export const referenceItemIdentity = (item: ReferenceUploadItem) => item.localId ?? `${item.fileName}|${item.mediaPath ?? item.storagePath}|${item.previewUrl}`;
export const referenceItemContent = (item: ReferenceUploadItem) => `${referenceItemIdentity(item)}|${item.mediaPath ?? item.storagePath}|${item.previewUrl}`;
export type ReferenceUploadTicket = { epoch: number; ids: string[] };

/** Owns current previews and pending admission slots; uploaded media itself is never deleted. */
export class ReferenceUploadSession {
  active = true;
  epoch = 0;
  private current: ReferenceUploadItem[] = [];
  private order = new Map<string, number>();
  private nextOrder = 0;
  private batches = new Set<ReferenceUploadTicket>();
  constructor(private release: (url: string) => void) {}
  get items(): ReferenceUploadItem[] { return [...this.current]; }
  get pendingSlots(): number { return [...this.batches].reduce((n, batch) => n + batch.ids.length, 0); }
  get pendingBatches(): number { return this.batches.size; }
  find(id: string): ReferenceUploadItem | undefined { return this.current.find(item => item.localId === id); }
  isCurrent(epoch: number): boolean { return this.active && this.epoch === epoch; }
  private newId(): string { const id = identity(); this.order.set(id, ++this.nextOrder); return id; }
  private releaseUnused(previous: ReferenceUploadItem[], next: ReferenceUploadItem[]): void {
    const retained = new Set(next.map(item => item.previewUrl));
    for (const url of new Set(previous.map(item => item.previewUrl))) if (!retained.has(url)) this.release(url);
  }
  discard(items: ReferenceUploadItem[]): void { this.releaseUnused(items, this.current); }
  reset(items: ReferenceUploadItem[]): void {
    this.epoch += 1; this.batches.clear(); this.order.clear();
    const next = items.map(item => ({ ...item, localId: this.newId() }));
    this.releaseUnused(this.current, next); this.current = next;
  }
  dispose(): void { this.reset([]); this.active = false; }
  reserve(count: number): ReferenceUploadTicket {
    const ticket = { epoch: this.epoch, ids: Array.from({ length: count }, () => this.newId()) };
    this.batches.add(ticket); return ticket;
  }
  isPending(ticket: ReferenceUploadTicket): boolean { return this.isCurrent(ticket.epoch) && this.batches.has(ticket); }
  fail(ticket: ReferenceUploadTicket): void {
    if (!this.batches.delete(ticket)) return;
    for (const id of ticket.ids) if (!this.find(id)) this.order.delete(id);
  }
  finish(ticket: ReferenceUploadTicket, items: ReferenceUploadItem[]): boolean {
    if (!this.isPending(ticket)) { this.discard(items); return false; }
    this.batches.delete(ticket);
    const admitted = items.slice(0, ticket.ids.length).map((item, index) => ({ ...item, localId: ticket.ids[index] }));
    this.current = [...this.current, ...admitted].sort((a, b) => this.order.get(a.localId!)! - this.order.get(b.localId!)!);
    this.discard(items.slice(ticket.ids.length));
    for (const id of ticket.ids.slice(admitted.length)) this.order.delete(id);
    return true;
  }
  append(items: ReferenceUploadItem[], max: number): boolean {
    if (!this.active || this.current.length + this.pendingSlots + items.length > max) { this.discard(items); return false; }
    this.current = [...this.current, ...items.map(item => ({ ...item, localId: this.newId() }))]; return true;
  }
  remove(id: string): boolean {
    const item = this.find(id); if (!this.active || !item) return false;
    const next = this.current.filter(entry => entry.localId !== id);
    this.releaseUnused([item], next); this.current = next; this.order.delete(id); return true;
  }
  update(id: string, item: ReferenceUploadItem, expected?: ReferenceUploadItem): ReferenceUploadItem | undefined {
    const old = this.find(id);
    if (!this.active || !old || (expected && old !== expected)) return undefined;
    const next = { ...item, localId: id };
    this.current = this.current.map(entry => entry.localId === id ? next : entry);
    this.releaseUnused([old], this.current); return next;
  }
}
