import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, type CanvasGraphJson, type CanvasTemplateRecord, type CanvasTemplateUpdatePayload } from "../../api";
import { parseCanvasGraph } from "./canvasGraphUtils";
import type { CanvasGraphState } from "./canvasTypes";
import { emptyCanvasGraph } from "./canvasTypes";
import { newTemplateDraftId, templateGraphVersion, validTemplateGraph, readTemplateDrafts, writeTemplateDraft,
  removeTemplateDraft, serializeTemplateWrite, confirmTemplateWrite, templateWriteWasRejected, type CanvasTemplateDraft } from "./canvasTemplateDrafts";

type EditorContext = {
  id: number | null; ownerId: number | undefined; generation: number; active: boolean; closed: boolean;
  template: CanvasTemplateRecord | null; server: CanvasTemplateRecord | null; pending: CanvasTemplateDraft | null;
  recoveries: CanvasTemplateDraft[]; inspected: CanvasTemplateRecord | null; revision: number; viewRevision: number;
  timer: number | null; flight: Promise<void> | null; loading: boolean; leaving: boolean; error: string; backupError: string; loadSequence: number; inspectSequence: number;
};
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function createContext(id: number | null, ownerId: number | undefined, generation: number): EditorContext {
  return { id, ownerId, generation, active: true, closed: false, template: null, server: null, pending: null, recoveries: [], inspected: null,
    revision: 0, viewRevision: 0, timer: null, flight: null, loading: id !== null, leaving: false, error: "", backupError: "", loadSequence: 0, inspectSequence: 0 };
}
export function useCanvasTemplateEditor(templateId: number | null, ownerId?: number) {
  const [, redraw] = useState(0), mounted = useRef(true);
  const generation = useRef(0);
  const context = useMemo(() => createContext(templateId, ownerId, ++generation.current), [templateId, ownerId]);
  const currentRef = useRef<EditorContext>(context);
  function stopTimer(item: EditorContext) { if (item.timer !== null) window.clearTimeout(item.timer); item.timer = null; }
  useLayoutEffect(() => {
    const previous = currentRef.current;
    if (previous !== context) { previous.active = false; stopTimer(previous); }
    currentRef.current = context; context.active = true;
    return () => { context.active = false; stopTimer(context); };
  }, [context]);
  function current(item: EditorContext) { return mounted.current && currentRef.current === item && item.active && !item.closed; }
  function publish(item: EditorContext) { if (current(item)) redraw(n => n + 1); }
  function persist(item: EditorContext): boolean {
    if (!item.pending) return true;
    try { writeTemplateDraft(item.pending); item.backupError = ""; return true; }
    catch { item.backupError = "本地模板草稿备份不可用，请保持页面打开并保存；关闭后可能无法恢复。"; return false; }
  }
  function validateRecord(record: CanvasTemplateRecord, id: number): void {
    if (!record || record.id !== id || typeof record.title !== "string" || !validTemplateGraph(record.graph_json)) throw new Error("模板响应身份或图数据不完整，结果尚未确认。");
  }
  async function flushContext(item: EditorContext): Promise<void> {
    if (!current(item)) return;
    if (item.recoveries.length) throw new Error("请先选择要恢复的本地模板草稿。");
    if (item.flight) { await item.flight; if (current(item) && item.pending) await flushContext(item); return; }
    if (!item.pending || item.id === null) return;
    if (["uncertain", "restored", "conflict"].includes(item.pending.phase)) {
      item.error = "请先只读核对服务器，再确认原请求已结束，不能直接重发。"; publish(item); throw new Error(item.error);
    }
    stopTimer(item);
    const request = (async () => {
      while (current(item) && item.pending) {
        const draft = item.pending;
        const payload: CanvasTemplateUpdatePayload = {};
        if (draft.graph !== undefined) payload.graph_json = copy(draft.graph);
        if (draft.title !== undefined) payload.title = draft.title;
        try {
          const updated = await serializeTemplateWrite(item.ownerId, item.id!, async () => {
            if (!current(item)) throw Object.assign(new Error("模板视图已切换，草稿已保留。"), { notSent: true });
            const response = await api.updateAdminCanvasTemplate(draft.templateId, payload);
            validateRecord(response, draft.templateId);
            if ((payload.graph_json !== undefined && templateGraphVersion(response.graph_json) !== templateGraphVersion(payload.graph_json)) ||
                (payload.title !== undefined && response.title !== payload.title)) throw new Error("返回版本未确认本次模板提交，结果尚未确认。");
            return response;
          });
          const previousServer = item.server ?? updated;
          item.server = { ...previousServer, ...(payload.graph_json !== undefined ? { graph_json: updated.graph_json } : {}),
            ...(payload.title !== undefined ? { title: updated.title } : {}), updated_at: updated.updated_at };
          if (item.pending === draft) {
            item.pending = null;
            try { if (!removeTemplateDraft(draft)) item.backupError = "提交已保存，另一版本的本地备份仍保留待核对。"; }
            catch { item.backupError = "提交已保存，本地备份清理失败；下次打开请核对。"; }
          } else if (current(item) && item.pending) {
            item.pending = { ...item.pending, baseGraphVersion: templateGraphVersion(item.server.graph_json), baseTitle: item.server.title, baseUpdatedAt: item.server.updated_at };
            persist(item);
          }
          if (item.template) item.template = { ...item.template, updated_at: updated.updated_at };
          item.error = "";
        } catch (error) {
          if (item.pending && !(error && typeof error === "object" && "notSent" in error)) {
            item.pending = { ...item.pending, phase: templateWriteWasRejected(error) ? "rejected" : "uncertain" };
            // Only this instance's current backup is rewritten; stale views retain their already-written copy.
            if (current(item)) persist(item);
          }
          item.error = error instanceof Error ? error.message : "保存模板工作流失败"; publish(item); throw error;
        }
      }
    })();
    item.flight = request; publish(item);
    try { await request; } finally { if (item.flight === request) item.flight = null; publish(item); }
  }
  function enqueue(item: EditorContext, patch: { graph?: CanvasGraphJson; title?: string }) {
    if (!current(item) || !item.template || item.loading || item.id === null || item.recoveries.length) return;
    const previous = item.pending, server = item.server ?? item.template;
    item.pending = { version: 1, ownerId: item.ownerId!, templateId: item.id, draftId: previous?.draftId ?? newTemplateDraftId(),
      saveId: newTemplateDraftId(), revision: ++item.revision, baseGraphVersion: previous?.baseGraphVersion ?? templateGraphVersion(server.graph_json),
      baseTitle: previous?.baseTitle ?? server.title, baseUpdatedAt: previous?.baseUpdatedAt ?? server.updated_at,
      updatedAt: Date.now(), phase: previous?.phase ?? "dirty", ...(previous?.graph !== undefined ? { graph: previous.graph } : {}),
      ...(previous?.title !== undefined ? { title: previous.title } : {}), ...copy(patch) };
    item.template = { ...item.template, ...(patch.graph !== undefined ? { graph_json: copy(patch.graph) } : {}), ...(patch.title !== undefined ? { title: patch.title } : {}) };
    item.inspected = null; persist(item); publish(item);
  }
  const queueSaveGraph = useCallback((graph: CanvasGraphState) => {
    enqueue(context, { graph: graph as CanvasGraphJson });
    if (!current(context) || !context.pending || context.pending.phase !== "dirty" || context.flight) return;
    stopTimer(context); context.timer = window.setTimeout(() => { context.timer = null; void flushContext(context).catch(() => undefined); }, 700);
  }, [context]);
  const renameTitle = useCallback(async (title: string) => {
    if (!current(context) || !title.trim()) return;
    enqueue(context, { title: title.trim() }); await flushContext(context);
  }, [context]);
  const flushSave = useCallback(() => flushContext(context), [context]);
  const leave = useCallback(async (onExit: () => void): Promise<boolean> => {
    if (!current(context) || context.leaving) return false;
    context.leaving = true; publish(context);
    try { await flushContext(context); if (!current(context) || context.pending || context.recoveries.length) return false; context.closed = true; stopTimer(context); onExit(); return true; }
    catch { return false; }
    finally { context.leaving = false; publish(context); }
  }, [context]);
  const leaveWithDraft = useCallback((onExit: () => void): boolean => {
    if (!current(context) || !persist(context)) { publish(context); return false; }
    context.closed = true; stopTimer(context); onExit(); return true;
  }, [context]);
  const discardAndLeave = useCallback((onExit: () => void): boolean => {
    if (!current(context) || !context.pending || !window.confirm("放弃当前本地草稿并返回？可能已发出的保存不会被撤回；其他备份仍保留。")) return false;
    try { if (!removeTemplateDraft(context.pending)) { context.error = "备份已有另一版本，未删除；请保留草稿后离开。"; publish(context); return false; } }
    catch { if (!window.confirm("无法清理本地备份。仍放弃内存更改并离开？旧备份可能保留。")) return false; }
    context.closed = true; stopTimer(context); context.pending = null; onExit(); return true;
  }, [context]);
  const restoreDraft = useCallback((draftId: string) => {
    if (!current(context) || !context.template) return;
    const draft = context.recoveries.find(row => row.draftId === draftId); if (!draft) return;
    const conflict = (draft.graph !== undefined && draft.baseGraphVersion !== templateGraphVersion(context.template.graph_json) && templateGraphVersion(draft.graph) !== templateGraphVersion(context.template.graph_json)) ||
      (draft.title !== undefined && draft.baseTitle !== context.template.title && draft.title !== context.template.title);
    context.revision = Math.max(context.revision, draft.revision);
    context.pending = { ...copy(draft), draftId: newTemplateDraftId(), saveId: newTemplateDraftId(), revision: ++context.revision,
      updatedAt: Date.now(), phase: draft.phase === "uncertain" ? "uncertain" : conflict ? "conflict" : "restored" };
    const backedUp = persist(context);
    if (backedUp) { try { removeTemplateDraft(draft); } catch { context.backupError = "恢复草稿已备份，原备份未能清理。"; } }
    context.template = { ...context.template, ...(draft.graph !== undefined ? { graph_json: copy(draft.graph) } : {}), ...(draft.title !== undefined ? { title: draft.title } : {}) };
    context.recoveries = []; context.viewRevision += 1; context.inspected = null;
    context.error = "已恢复本地模板草稿；不会自动提交，请先只读核对服务器。"; publish(context);
  }, [context]);
  const discardRecovery = useCallback((draftId: string) => {
    if (!current(context) || !window.confirm("只删除这份本地草稿？不会修改服务器模板或其他备份。")) return;
    const draft = context.recoveries.find(row => row.draftId === draftId); if (!draft) return;
    try { if (!removeTemplateDraft(draft)) throw new Error("备份版本已变化，未删除。"); context.recoveries = context.recoveries.filter(row => row !== draft); context.error = ""; }
    catch (error) { context.error = error instanceof Error ? error.message : "删除备份失败"; } publish(context);
  }, [context]);
  const inspectServer = useCallback(async () => {
    if (!current(context) || context.id === null || !context.pending || context.flight) return;
    const pending = context.pending, sequence = ++context.inspectSequence;
    try { const detail = await api.getCanvasTemplate(context.id); validateRecord(detail, context.id); if (!current(context) || context.pending !== pending || sequence !== context.inspectSequence) return; context.inspected = detail; context.error = "核对只展示服务器快照，不能证明原请求未受理或已结束。"; }
    catch (error) { if (current(context) && context.pending === pending && sequence === context.inspectSequence) { context.inspected = null; context.error = error instanceof Error ? error.message : "核对服务器失败"; } } publish(context);
  }, [context]);
  const confirmInspectedSave = useCallback(async () => {
    if (!current(context) || !context.pending || !context.inspected || context.flight) return;
    context.pending = { ...context.pending, phase: "dirty", baseGraphVersion: templateGraphVersion(context.inspected.graph_json), baseTitle: context.inspected.title,
      baseUpdatedAt: context.inspected.updated_at, saveId: newTemplateDraftId(), revision: ++context.revision, updatedAt: Date.now() };
    context.server = context.inspected; context.inspected = null; persist(context); confirmTemplateWrite(context.id!); await flushContext(context);
  }, [context]);
  useEffect(() => {
    mounted.current = true;
    const warn = (event: BeforeUnloadEvent) => { const item = currentRef.current; if (item.pending || item.flight || item.recoveries.length) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { mounted.current = false; const item = currentRef.current; item.active = false; stopTimer(item); window.removeEventListener("beforeunload", warn); };
  }, []);
  useEffect(() => {
    const item = context, sequence = ++item.loadSequence; item.active = true;
    const valid = () => current(item) && item.loadSequence === sequence;
    if (item.id === null) { item.loading = false; publish(item); return; }
    void (async () => {
      try {
        try { const local = readTemplateDrafts(item.ownerId, item.id!); item.recoveries = local.drafts; if (local.unreadable) item.backupError = "存在无法读取的本地备份，已原样保留，未自动覆盖。"; }
        catch { item.backupError = "本地模板草稿备份不可用，当前只读取服务器；编辑后请保持页面打开。"; }
        const detail = await api.getCanvasTemplate(item.id!); validateRecord(detail, item.id!);
        if (!valid()) return; item.server = detail; item.template = detail; item.viewRevision += 1;
        item.error = item.recoveries.length ? "发现本地模板草稿，请选择恢复或明确放弃；不会自动重发。" : "";
      } catch (error) { if (valid()) item.error = error instanceof Error ? error.message : "加载画布模板失败"; }
      finally { if (valid()) { item.loading = false; publish(item); } }
    })();
    return () => { item.active = false; item.loadSequence += 1; stopTimer(item); };
  }, [context]);
  const phase = context.recoveries.length ? "recovery" : context.pending?.phase ?? "ready";
  const statusLabel = context.loading ? "加载中…" : context.id !== null && !context.template ? "模板未加载" : phase === "recovery" ? "有本地草稿待选择" : phase === "uncertain" ? "保存结果未确认" :
    phase === "conflict" ? "草稿与服务器有冲突" : phase === "restored" ? "本地草稿待核对" : context.flight ? "保存中…" : context.pending ? "未同步" : "已同步";
  return { template: context.template, loading: context.loading, saving: Boolean(context.flight), leaving: context.leaving,
    hasUnsavedChanges: Boolean(context.pending || context.recoveries.length), phase, statusLabel, error: context.error || context.backupError,
    backupError: context.backupError, recoveryDrafts: context.recoveries, inspection: context.inspected,
    viewKey: `${ownerId ?? "none"}:${templateId ?? "none"}:${context.generation}:${context.viewRevision}`, blocked: context.recoveries.length > 0 || (context.id !== null && !context.template),
    queueSaveGraph, renameTitle, flushSave, leave, leaveWithDraft, discardAndLeave, restoreDraft, discardRecovery, inspectServer, confirmInspectedSave,
    clearError: () => { context.error = ""; publish(context); } };
}
export function graphFromTemplate(template: CanvasTemplateRecord | null): CanvasGraphState {
  if (!template) return emptyCanvasGraph();
  return parseCanvasGraph(template.graph_json);
}
