import type { CanvasGraphJson, CanvasProjectRecord } from "../../api";

export type CanvasProjectDraft = {
  projectId: number;
  revision: number;
  saveId: string;
  baseUpdatedAt: string;
  baseGraphJson: string;
  graph: CanvasGraphJson;
};

function key(ownerId: number | undefined, projectId: number): string {
  if (ownerId == null) throw new Error("无法确定画布草稿备份的账号");
  return `qmdh:canvas-draft:v1:${ownerId}:${projectId}`;
}

export function readProjectDraft(ownerId: number | undefined, projectId: number): CanvasProjectDraft | null {
  const raw = window.sessionStorage.getItem(key(ownerId, projectId));
  if (!raw) return null;
  const draft = JSON.parse(raw) as CanvasProjectDraft;
  if (draft.projectId !== projectId || !Number.isSafeInteger(draft.revision) || !draft.graph ||
      !Array.isArray(draft.graph.nodes) || !Array.isArray(draft.graph.edges)) {
    throw new Error("画布草稿备份无法读取");
  }
  return draft;
}

export function writeProjectDraft(ownerId: number | undefined, draft: CanvasProjectDraft): void {
  window.sessionStorage.setItem(key(ownerId, draft.projectId), JSON.stringify(draft));
}

export function removeProjectDraft(ownerId: number | undefined, projectId: number, saveId?: string): void {
  if (saveId == null || readProjectDraft(ownerId, projectId)?.saveId === saveId) {
    window.sessionStorage.removeItem(key(ownerId, projectId));
  }
}

// Keep a same-tab remount behind the previous instance's actual network write.
const projectSaves = new Map<string, Promise<CanvasProjectRecord>>();

export async function serializeProjectSave(
  ownerId: number | undefined,
  projectId: number,
  save: () => Promise<CanvasProjectRecord>,
): Promise<CanvasProjectRecord> {
  const storageKey = key(ownerId, projectId);
  const previous = projectSaves.get(storageKey);
  const operation = (async () => {
    if (previous) await previous.catch(() => undefined);
    return save();
  })();
  projectSaves.set(storageKey, operation);
  try {
    return await operation;
  } finally {
    if (projectSaves.get(storageKey) === operation) projectSaves.delete(storageKey);
  }
}
