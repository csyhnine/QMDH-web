import type { CanvasGraphJson, CanvasTemplateRecord } from "../../api";
import { nanoid } from "./canvasId";

export type TemplateDraftPhase = "dirty" | "rejected" | "uncertain" | "restored" | "conflict";
export type CanvasTemplateDraft = {
  version: 1; ownerId: number; templateId: number; draftId: string; saveId: string; revision: number;
  baseGraphVersion: string; baseTitle: string; baseUpdatedAt: string; updatedAt: number;
  graph?: CanvasGraphJson; title?: string; phase: TemplateDraftPhase;
};
export const newTemplateDraftId = () => nanoid(24);
export function templateGraphVersion(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
export function validTemplateGraph(value: unknown): value is CanvasGraphJson {
  return Boolean(value && typeof value === "object" && "nodes" in value && Array.isArray(value.nodes) && "edges" in value && Array.isArray(value.edges));
}
function prefix(ownerId: number | undefined, templateId: number): string {
  if (!Number.isSafeInteger(ownerId) || ownerId! <= 0) throw new Error("无法确定模板草稿备份的账号");
  return `qmdh:canvas-template-draft:v1:${ownerId}:${templateId}:`;
}
function key(ownerId: number | undefined, templateId: number, draftId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(draftId)) throw new Error("模板草稿标识无效");
  return prefix(ownerId, templateId) + draftId;
}
export function readTemplateDrafts(ownerId: number | undefined, templateId: number): { drafts: CanvasTemplateDraft[]; unreadable: number } {
  const starts = prefix(ownerId, templateId), storage = window.localStorage, drafts: CanvasTemplateDraft[] = [];
  let unreadable = 0;
  for (let index = 0; index < storage.length; index++) {
    const name = storage.key(index); if (!name?.startsWith(starts)) continue;
    try {
      const draft = JSON.parse(storage.getItem(name) || "null") as CanvasTemplateDraft;
      if (!draft || draft.version !== 1 || draft.ownerId !== ownerId || draft.templateId !== templateId ||
        typeof draft.draftId !== "string" || key(ownerId, templateId, draft.draftId) !== name || typeof draft.saveId !== "string" || !draft.saveId ||
        !Number.isSafeInteger(draft.revision) || draft.revision < 1 || typeof draft.baseUpdatedAt !== "string" || typeof draft.baseGraphVersion !== "string" || typeof draft.baseTitle !== "string" ||
        !Number.isFinite(draft.updatedAt) || !["dirty", "rejected", "uncertain", "restored", "conflict"].includes(draft.phase) ||
        (draft.graph !== undefined && !validTemplateGraph(draft.graph)) || (draft.title !== undefined && typeof draft.title !== "string") ||
        (draft.graph === undefined && draft.title === undefined)) throw Error("invalid draft");
      drafts.push(draft);
    } catch { unreadable += 1; }
  }
  return { drafts: drafts.sort((a, b) => b.updatedAt - a.updatedAt), unreadable };
}
export function writeTemplateDraft(draft: CanvasTemplateDraft): void {
  window.localStorage.setItem(key(draft.ownerId, draft.templateId, draft.draftId), JSON.stringify(draft));
}
export function removeTemplateDraft(draft: CanvasTemplateDraft): boolean {
  const name = key(draft.ownerId, draft.templateId, draft.draftId), raw = window.localStorage.getItem(name);
  if (raw && (JSON.parse(raw) as CanvasTemplateDraft).saveId !== draft.saveId) return false;
  window.localStorage.removeItem(name); return true;
}
export function templateWriteWasRejected(error: unknown): boolean {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  return typeof status === "number" && [400, 401, 403, 404, 409, 413, 422].includes(status);
}
// Template ids identify shared server records even when the active account changes.
const writes = new Map<number, Promise<CanvasTemplateRecord>>();
const uncertainWrites = new Set<number>();
export function confirmTemplateWrite(templateId: number): void {
  // Only the editor's explicit post-inspection confirmation may release this barrier.
  uncertainWrites.delete(templateId);
}
export async function serializeTemplateWrite(_ownerId: number | undefined, templateId: number, save: () => Promise<CanvasTemplateRecord>): Promise<CanvasTemplateRecord> {
  const previous = writes.get(templateId);
  const operation = (async () => {
    // A previous failure is propagated, never silently turned into a replay.
    if (previous) await previous;
    if (uncertainWrites.has(templateId)) throw new Error("同一模板此前的保存结果尚未确认，请先核对服务器并确认原请求已结束。");
    try { return await save(); }
    catch (error) {
      if (!templateWriteWasRejected(error) && !(error && typeof error === "object" && "notSent" in error)) uncertainWrites.add(templateId);
      throw error;
    }
  })();
  writes.set(templateId, operation);
  try { return await operation; } finally { if (writes.get(templateId) === operation) writes.delete(templateId); }
}
