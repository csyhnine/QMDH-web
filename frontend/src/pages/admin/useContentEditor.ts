import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";

type Entity = { id: number };
type Editor<D, R> = { id: number | null; record: R | null; draft: D; baseline: D; revision: number;
  versions: Map<keyof D, number>; dirty: Set<keyof D>; conflicts: Set<keyof D>; missing: boolean; unconfirmed: boolean; notice: string };
export type ContentOperation<D, R> = { editor: Editor<D, R>; id: number | null; values: D; baselines: D; revision: number;
  versions: Map<keyof D, number>; intent: number; kind: "save" | "delete"; promise: Promise<void>;
  followup?: { editor: Editor<D, R>; intent: number } };
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Flat content fields, scoped to the mounted account and each explicit editor session. */
export function useContentEditor<D extends object, R extends Entity>(rows: R[], toDraft: (row: R | null) => D, refresh: () => void | Promise<void>, contentName = "公告") {
  const { currentUser, isGuest } = useAuth();
  const [, redraw] = useState(0);
  function editor(row: R | null): Editor<D, R> {
    const draft = toDraft(row);
    return { id: row?.id ?? null, record: row, draft: copy(draft), baseline: copy(draft), revision: 0,
      versions: new Map((Object.keys(draft) as (keyof D)[]).map(key => [key, 0])), dirty: new Set(), conflicts: new Set(), missing: false, unconfirmed: false, notice: "" };
  }
  const scope = useMemo(() => ({ active: false, editor: editor(rows[0] ?? null), autoSelect: !rows.length,
    intent: 0, error: "", operations: new Map<number | object, ContentOperation<D, R>>() }), [currentUser?.id, currentUser?.name, isGuest]);
  const current = useRef(scope), latest = useRef({ rows, toDraft, refresh });
  const isCurrent = () => scope.active && current.current === scope;
  function publish() { if (isCurrent()) redraw(value => isCurrent() ? value + 1 : value); }
  useLayoutEffect(() => {
    current.current.active = false; current.current = scope; scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  useLayoutEffect(() => { latest.current = { rows, toDraft, refresh }; }, [rows, toDraft, refresh]);
  useLayoutEffect(() => {
    if (!isCurrent()) return;
    const model = scope.editor;
    if (scope.autoSelect && rows.length && !model.dirty.size && !scope.operations.size) {
      scope.editor = editor(rows[0]); scope.autoSelect = false; publish(); return;
    }
    if (model.id === null) return;
    const row = rows.find(item => item.id === model.id);
    if (!row) { if (!model.missing) { model.missing = true; publish(); } return; }
    const incoming = toDraft(row); model.record = row; model.missing = false;
    for (const key of Object.keys(incoming) as (keyof D)[]) {
      const value = incoming[key];
      if (model.dirty.has(key)) {
        if (Object.is(value, model.draft[key])) model.conflicts.delete(key);
        else if (!Object.is(value, model.baseline[key])) model.conflicts.add(key);
      } else model.draft = { ...model.draft, [key]: value };
      model.baseline = { ...model.baseline, [key]: value };
    }
    publish();
  }, [scope, rows]);

  function select(row: R | null) {
    if (!isCurrent()) return;
    scope.editor = editor(row); scope.autoSelect = false; scope.intent += 1; scope.error = ""; publish();
  }
  const renderedEditor = scope.editor;
  function setField<K extends keyof D>(key: K, value: D[K]) {
    if (!isCurrent() || scope.editor !== renderedEditor) return;
    const model = scope.editor;
    model.draft = { ...model.draft, [key]: value }; model.versions.set(key, (model.versions.get(key) ?? 0) + 1);
    model.dirty.add(key); model.revision += 1; model.notice = "";
    if (Object.is(value, model.baseline[key])) model.conflicts.delete(key);
    scope.autoSelect = false; scope.intent += 1; scope.error = ""; publish();
  }
  function report(message: string, operation?: ContentOperation<D, R>) {
    if (!isCurrent() || (operation && (scope.editor !== operation.editor || scope.intent !== operation.intent))) return;
    scope.error = message; publish();
  }
  function saved(operation: ContentOperation<D, R>, row: R) {
    if (!isCurrent() || scope.editor !== operation.editor) return;
    const model = operation.editor;
    if (model.missing) { model.notice = `保存已返回，但原${contentName}已从当前列表移除，当前草稿与原身份已保留，请刷新核对。`; publish(); return; }
    if (!Number.isSafeInteger(row?.id) || row.id <= 0 || (operation.id !== null && row.id !== operation.id)) {
      model.unconfirmed = true; model.notice = `保存已响应，但${contentName}身份待确认；草稿已保留，请刷新列表核对后重新选择。`; publish(); return;
    }
    model.id = row.id;
    const incoming = latest.current.toDraft(row);
    let remoteChanged = false;
    for (const key of Object.keys(incoming) as (keyof D)[]) {
      if (!Object.is(model.baseline[key], operation.baselines[key]) && !Object.is(model.baseline[key], incoming[key])) {
        model.conflicts.add(key); remoteChanged = true; continue;
      }
      model.baseline = { ...model.baseline, [key]: incoming[key] };
      if (model.versions.get(key) === operation.versions.get(key)) {
        model.draft = { ...model.draft, [key]: incoming[key] }; model.dirty.delete(key); model.conflicts.delete(key);
      }
    }
    if (!remoteChanged || !model.record) model.record = row;
    model.notice = remoteChanged ? "原提交已保存，期间的服务器变化与当前草稿已保留，请核对冲突。"
      : model.revision === operation.revision ? `${contentName}已保存。` : "原提交已保存，后续编辑已保留，尚未保存。"; publish();
  }
  function deleted(operation: ContentOperation<D, R>) {
    if (!isCurrent() || scope.editor !== operation.editor) return;
    if (operation.editor.revision === operation.revision) {
      select(null); scope.editor.notice = `${contentName}已删除。`;
      operation.followup = { editor: scope.editor, intent: scope.intent }; publish();
    }
    else { operation.editor.missing = true; operation.editor.notice = `原${contentName}已删除，后续编辑已保留；可复制内容后新建${contentName}。`; publish(); }
  }
  async function refreshAfter(operation: ContentOperation<D, R>) {
    if (!isCurrent()) return;
    try { await latest.current.refresh(); }
    catch {
      const target = scope.editor === operation.editor ? operation.editor
        : operation.followup?.editor === scope.editor && operation.followup.intent === scope.intent ? scope.editor : null;
      if (isCurrent() && target) { target.notice = "操作已完成，但列表刷新失败，草稿和已确认身份已保留。"; publish(); }
    }
  }
  function pendingFor(model: Editor<D, R>) {
    return scope.operations.get(model.id ?? model) ?? [...scope.operations.values()].find(operation =>
      operation.editor === model || (model.id !== null && operation.editor.id === model.id));
  }
  function run(work: (operation: ContentOperation<D, R>) => Promise<void>, kind: "save" | "delete" = "save"): Promise<void> {
    if (!isCurrent() || scope.editor !== renderedEditor) return Promise.resolve();
    const model = scope.editor, key = model.id ?? model;
    const pending = pendingFor(model); if (pending) return pending.promise;
    if (model.missing || model.unconfirmed) { report(`原${contentName}已缺失或保存身份待确认，请刷新核对；当前草稿已保留。`); return Promise.resolve(); }
    const operation: ContentOperation<D, R> = { editor: model, id: model.id, values: copy(model.draft), baselines: copy(model.baseline), revision: model.revision,
      versions: new Map(model.versions), intent: ++scope.intent, kind, promise: Promise.resolve() };
    scope.operations.set(key, operation); scope.error = ""; publish();
    operation.promise = (async () => {
      try { await work(operation); }
      finally { if (scope.operations.get(key) === operation) scope.operations.delete(key); publish(); }
    })();
    return operation.promise;
  }
  async function refreshList() {
    if (!isCurrent()) return;
    const intent = ++scope.intent; scope.error = ""; publish();
    try { await latest.current.refresh(); }
    catch (error) { if (isCurrent() && scope.intent === intent) report(error instanceof Error ? error.message : "刷新列表失败"); }
  }
  function loadRemote() {
    if (!isCurrent() || scope.editor !== renderedEditor) return;
    const row = latest.current.rows.find(item => item.id === scope.editor.id);
    if (!row) { report(`服务器列表中未找到原${contentName}，当前草稿已保留。`); return; }
    select(row);
  }
  function isCurrentEditor() { return isCurrent() && scope.editor === renderedEditor; }
  function captureField<K extends keyof D>(key: K) {
    const model = renderedEditor, sourceId = model.id, version = model.versions.get(key);
    const value = model.draft[key], baseline = model.baseline[key];
    const allowed = () => isCurrentEditor() && !model.missing && !model.unconfirmed && model.id === sourceId
      && model.versions.get(key) === version && Object.is(model.draft[key], value) && Object.is(model.baseline[key], baseline);
    return { owner: model as object, sourceId, current: allowed,
      canRecover: () => isCurrent() && !scope.editor.missing && !scope.editor.unconfirmed
        && (sourceId !== null ? scope.editor.id === sourceId : scope.editor === model),
      apply: (next: D[K]) => { if (!allowed()) return false; setField(key, next); return true; } };
  }
  return { model: scope.editor, selectedId: scope.editor.id, draft: scope.editor.draft, error: scope.error,
    busy: Boolean(pendingFor(scope.editor)),
    saving: pendingFor(scope.editor)?.kind === "save",
    deleting: pendingFor(scope.editor)?.kind === "delete",
    select, setField, report, saved, deleted, refreshAfter, run, refreshList, loadRemote, isCurrentEditor, captureField };
}
