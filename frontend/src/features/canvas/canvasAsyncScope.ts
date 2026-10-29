import type { Edge } from "@xyflow/react";
import { nanoid } from "./canvasId";
import type { CanvasFlowNode, GenerateNodeData } from "./canvasTypes";

export type CanvasTaskObservation = { signal: AbortSignal; current: () => boolean };
export type CanvasAsyncRecord = {
  version: 1; id: string; ownerId: number; board: string; session: string; updatedAt: number;
  kind: "upload" | "annotate" | "drop" | "task"; nodeId?: string; nodeKind?: string; input: string;
  phase: "pending" | "ready" | "failed"; patch?: Partial<GenerateNodeData>; nodes?: CanvasFlowNode[]; error?: string;
};
export type CanvasAsyncOperation = { record: CanvasAsyncRecord; generation: number; readInput?: () => string };
const memory = new Map<string, CanvasAsyncRecord>();
const listeners = new Map<string, Set<() => void>>();
const namespace = (owner: number, board: string) => `qmdh:canvas-async:v1:${owner}:${board}:`;
const key = (record: CanvasAsyncRecord) => namespace(record.ownerId, record.board) + record.id;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function notify(owner: number, board: string) { listeners.get(namespace(owner, board))?.forEach(fn => fn()); }
export function subscribeCanvasAsync(owner: number | undefined, board: string, fn: () => void): () => void {
  if (owner == null) return () => undefined;
  const name = namespace(owner, board), entries = listeners.get(name) ?? new Set<() => void>();
  entries.add(fn); listeners.set(name, entries);
  return () => { entries.delete(fn); if (!entries.size) listeners.delete(name); };
}
export function canvasNodeInput(node: CanvasFlowNode | undefined): string {
  if (!node || node.data.kind !== "generate") return "missing";
  const data = node.data as GenerateNodeData;
  return JSON.stringify([data.nodeKind, data.taskId ?? null, data.referenceImages, data.assetUrls, data.previewImagePath, data.annotationStrokes]);
}
export async function waitCanvasObservation(ms: number, observation?: CanvasTaskObservation): Promise<boolean> {
  if (observation && !observation.current()) return false;
  return new Promise(resolve => {
    const finish = (allowed: boolean) => { window.clearTimeout(timer); observation?.signal.removeEventListener("abort", abort); resolve(allowed); };
    const abort = () => finish(false);
    const timer = window.setTimeout(() => finish(observation?.current() ?? true), ms);
    observation?.signal.addEventListener("abort", abort, { once: true });
    if (observation?.signal.aborted) abort();
  });
}

export class CanvasAsyncScope {
  readonly session = nanoid(24);
  active = false;
  backupError = "";
  private nodeRuns = new Map<string, { creating: boolean; promise: Promise<void> }>();
  private operations = new Map<string, CanvasAsyncOperation>();
  private generations = new Map<string, number>();
  private observers = new Map<string, { nodeId: string; controller: AbortController; current: () => boolean; promise: Promise<void> }>();
  constructor(readonly ownerId: number | undefined, readonly board: string, readonly enabled: boolean,
    private nodes: () => CanvasFlowNode[], private edges?: () => Edge[]) {}
  activate() { this.active = this.enabled; }
  dispose() { this.active = false; for (const row of this.observers.values()) row.controller.abort(); this.observers.clear(); }
  node(nodeId: string) { return this.nodes().find(node => node.id === nodeId); }
  graphNodes() { return this.nodes(); }
  graphEdges(fallback: Edge[]) { return this.edges?.() ?? fallback; }
  runningNode(nodeId: string): Promise<void> | undefined { return this.nodeRuns.get(nodeId)?.promise; }
  runNode(nodeId: string, run: (accepted: () => void) => Promise<void>, regenerate = false): Promise<void> {
    const prior=this.nodeRuns.get(nodeId);
    if(prior && (!regenerate || prior.creating))return prior.promise;
    let resolveRun!: () => void, rejectRun!: (reason: unknown) => void;
    const pending=new Promise<void>((resolve,reject)=>{resolveRun=resolve;rejectRun=reject;});
    const entry={creating:true,promise:pending};
    entry.promise=pending.finally(()=>{if(this.nodeRuns.get(nodeId)===entry)this.nodeRuns.delete(nodeId);});
    this.nodeRuns.set(nodeId,entry);
    try { Promise.resolve(run(()=>{entry.creating=false;})).then(resolveRun,rejectRun); }
    catch(error) { rejectRun(error); }
    return entry.promise;
  }
  release(operation: CanvasAsyncOperation) {
    const name=operation.record.nodeId ?? operation.record.id;
    if(this.operations.get(name)===operation)this.operations.delete(name);
    notify(operation.record.ownerId,operation.record.board);
  }
  private store(record: CanvasAsyncRecord) {
    memory.set(key(record), copy(record));
    try { window.localStorage.setItem(key(record), JSON.stringify(record)); }
    catch { this.backupError = "画布异步结果备份不可用，请保持页面打开；关闭后可能无法恢复。"; }
    notify(record.ownerId, record.board);
  }
  begin(kind: CanvasAsyncRecord["kind"], nodeId?: string, readInput?: () => string): CanvasAsyncOperation | null {
    if (!this.active || !Number.isSafeInteger(this.ownerId) || this.ownerId! <= 0) return null;
    const node = nodeId ? this.node(nodeId) : undefined;
    if (nodeId && (!node || node.data.kind !== "generate")) return null;
    const operation: CanvasAsyncOperation = { record: { version: 1, id: nanoid(24), ownerId: this.ownerId!, board: this.board,
      session: this.session, updatedAt: Date.now(), kind, nodeId, nodeKind: node?.data.kind === "generate" ? (node.data as GenerateNodeData).nodeKind : undefined,
      input: readInput?.() ?? "", phase: "pending" }, generation: 0, readInput };
    if (nodeId) {
      this.generations.set(nodeId, (this.generations.get(nodeId) ?? 0) + 1); operation.generation = this.generations.get(nodeId)!;
      for (const row of this.observers.values()) if (row.nodeId === nodeId) row.controller.abort();
    }
    this.operations.set(nodeId ?? operation.record.id, operation); this.store(operation.record); return operation;
  }
  guard(operation: CanvasAsyncOperation): () => boolean {
    return () => this.active && (!operation.record.nodeId || this.generations.get(operation.record.nodeId) === operation.generation);
  }
  current(operation: CanvasAsyncOperation): boolean {
    return this.active && this.operations.get(operation.record.nodeId ?? operation.record.id) === operation &&
      (!operation.readInput || operation.readInput() === operation.record.input);
  }
  complete(operation: CanvasAsyncOperation, result: Pick<CanvasAsyncRecord, "patch" | "nodes" | "error">) {
    operation.record = { ...operation.record, ...copy(result), phase: result.error ? "failed" : "ready", updatedAt: Date.now() };
    this.store(operation.record);
  }
  finish(operation: CanvasAsyncOperation) { this.discard(operation.record); const name=operation.record.nodeId ?? operation.record.id; if (this.operations.get(name) === operation) this.operations.delete(name); }
  discard(record: CanvasAsyncRecord) {
    try { window.localStorage.removeItem(key(record)); memory.delete(key(record)); }
    catch { this.backupError = "本地恢复记录未能清理，已保留供下次核对。"; }
    notify(record.ownerId, record.board);
  }
  recoveries(): CanvasAsyncRecord[] {
    if (!this.active || this.ownerId == null) return [];
    const starts=namespace(this.ownerId,this.board);
    try {
      const storage=window.localStorage;
      for(let i=0;i<storage.length;i++) {
        const name=storage.key(i); if(!name?.startsWith(starts)) continue;
        try {
          const record=JSON.parse(storage.getItem(name) || "null") as CanvasAsyncRecord;
          if(record?.version!==1 || record.ownerId!==this.ownerId || record.board!==this.board || typeof record.id!=="string" || key(record)!==name ||
            !["upload","annotate","drop","task"].includes(record.kind) || !["pending","ready","failed"].includes(record.phase) || typeof record.input!=="string" ||
            typeof record.session!=="string" || !Number.isFinite(record.updatedAt) ||
            (record.nodeId!==undefined && typeof record.nodeId!=="string") || (record.nodeKind!==undefined && typeof record.nodeKind!=="string") ||
            (record.patch!==undefined && (!record.patch || typeof record.patch!=="object" || Array.isArray(record.patch) ||
              (record.patch.assetUrls!==undefined && (!Array.isArray(record.patch.assetUrls) || !record.patch.assetUrls.every(url=>typeof url==="string"))) ||
              (record.patch.referenceImages!==undefined && (!Array.isArray(record.patch.referenceImages) || !record.patch.referenceImages.every(url=>typeof url==="string"))))) ||
            (record.nodes!==undefined && (!Array.isArray(record.nodes) || !record.nodes.every(node=>typeof node?.id==="string" && node.data?.kind==="generate" && Array.isArray((node.data as GenerateNodeData).assetUrls))))) throw Error("invalid");
          if(!memory.has(name) || memory.get(name)!.updatedAt<record.updatedAt) memory.set(name,record);
        } catch { this.backupError="存在无法读取的异步恢复记录，已原样保留。"; }
      }
    } catch { this.backupError="画布异步结果备份不可用，请保持页面打开；关闭后可能无法恢复。"; }
    return [...memory.values()].filter(row=>row.ownerId===this.ownerId && row.board===this.board &&
      ![...this.operations.values()].some(op=>op.record.id===row.id && this.current(op))).map(copy);
  }
  reconcile() { for(const [name,row] of this.observers) if(!row.current()) { row.controller.abort(); if(this.observers.get(name)===row)this.observers.delete(name); } }
  observeTask(nodeId: string, taskId: number, run: (observation: CanvasTaskObservation) => Promise<void>, lane="poll"): Promise<void> {
    this.reconcile();
    const blocked=this.operations.get(nodeId);
    if (!this.active || (blocked?.record.kind==="task" && blocked.record.phase==="pending")) return Promise.resolve();
    const name=`${lane}:${nodeId}:${taskId}`, prior=this.observers.get(name); if(prior)return prior.promise;
    const generation=this.generations.get(nodeId) ?? 0, controller=new AbortController();
    const nodeKind=(this.node(nodeId)?.data as GenerateNodeData | undefined)?.nodeKind;
    const current=()=>this.active && !controller.signal.aborted && (this.generations.get(nodeId) ?? 0)===generation &&
      this.node(nodeId)?.data.kind==="generate" && (this.node(nodeId)!.data as GenerateNodeData).taskId===taskId && (this.node(nodeId)!.data as GenerateNodeData).nodeKind===nodeKind;
    if(!current())return Promise.resolve();
    const row={nodeId,controller,current,promise:Promise.resolve()};
    row.promise=(async()=>{try{await run({signal:controller.signal,current});}finally{if(this.observers.get(name)===row)this.observers.delete(name);}})();
    this.observers.set(name,row);return row.promise;
  }
}
