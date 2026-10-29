import { type Dispatch, type SetStateAction, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";

export type AgentOperation = { key: object | string; intent: number; promise: Promise<void> };
type Callbacks = { onSetError: Dispatch<SetStateAction<string>>; onRefresh: (guard?: () => boolean) => void | Promise<void> };
export function useAgentEditSessions(callbacks: Callbacks) {
  const { currentUser, isGuest } = useAuth();
  const [, redraw] = useState(0);
  const scope = useMemo(() => ({ active: false, intent: 0, operations: new Map<object | string, AgentOperation>(), reads: new Map<string, object>() }), [currentUser?.id, currentUser?.name, isGuest]);
  const current = useRef(scope), latest = useRef(callbacks);
  const isCurrent = () => scope.active && current.current === scope;
  useLayoutEffect(() => {
    current.current.active = false; current.current = scope; scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  useLayoutEffect(() => { latest.current = callbacks; }, [callbacks.onSetError, callbacks.onRefresh]);
  function publish() { if (isCurrent()) redraw((value) => isCurrent() ? value + 1 : value); }
  function touch() { if (isCurrent()) scope.intent += 1; return scope.intent; }
  function report(message: string, intent = scope.intent, extra: () => boolean = () => true) {
    const allowed = () => isCurrent() && scope.intent === intent && extra();
    if (allowed()) latest.current.onSetError((value) => allowed() ? message : value);
  }
  function run(key: object | string, work: (operation: AgentOperation) => Promise<void>): Promise<void> {
    if (!isCurrent()) return Promise.resolve();
    const pending = scope.operations.get(key); if (pending) return pending.promise;
    const operation: AgentOperation = { key, intent: ++scope.intent, promise: Promise.resolve() };
    scope.operations.set(key, operation); publish();
    operation.promise = (async () => {
      try { await work(operation); }
      finally { if (scope.operations.get(key) === operation) scope.operations.delete(key); publish(); }
    })();
    return operation.promise;
  }
  function read(key: string) {
    const token = {}; scope.reads.set(key, token);
    return { intent: scope.intent, allowed: () => isCurrent() && scope.reads.get(key) === token };
  }
  async function refreshAfter(operation: AgentOperation) {
    if (!isCurrent()) return;
    try { await latest.current.onRefresh(() => isCurrent() && scope.intent === operation.intent); }
    catch { report("操作已完成，但列表刷新失败，请刷新列表查看。", operation.intent); }
  }
  async function refresh() {
    if (!isCurrent()) return;
    const intent = touch();
    try { await latest.current.onRefresh(() => isCurrent() && scope.intent === intent); }
    catch { report("列表刷新失败，请重试。", intent); }
  }
  return { scope, isCurrent, publish, touch, report, run, read, refreshAfter, refresh,
    isBusy: (key: object | string) => scope.operations.has(key) };
}
export type AgentEditSessions = ReturnType<typeof useAgentEditSessions>;

function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copy) as T;
  return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) as T : value;
}
type Editor<T> = { id: string | number | null; draft: T; revision: number; touched: Set<string>; notice: string };
const editor = <T,>(draft: T, id: string | number | null = null): Editor<T> => ({ id, draft: copy(draft), revision: 0, touched: new Set(), notice: "" });
export function useAgentEditor<T extends object>(owner: AgentEditSessions, initial: T) {
  const holder = useMemo(() => ({ current: editor(initial) }), [owner.scope]);
  const model = holder.current;
  function replace(draft: T, id: string | number | null = null, user = true) {
    if (!owner.isCurrent()) return;
    holder.current = editor(draft, id); if (user) owner.touch(); owner.publish();
  }
  function setDraft(change: SetStateAction<T>, user = true) {
    if (!owner.isCurrent() || holder.current !== model) return;
    const next = typeof change === "function" ? (change as (value: T) => T)(model.draft) : change;
    if (!user && next === model.draft) return;
    if (user) {
      for (const key of new Set([...Object.keys(model.draft), ...Object.keys(next)])) {
        if (!Object.is((model.draft as Record<string, unknown>)[key], (next as Record<string, unknown>)[key])) model.touched.add(key);
      }
      model.revision += 1; model.notice = ""; owner.touch();
    }
    model.draft = next; owner.publish();
  }
  function finish(original: Editor<T>, revision: number, reset: T) {
    if (!owner.isCurrent() || holder.current !== original) return;
    if (original.revision === revision) replace(reset, null, false);
    else { original.notice = "原提交已完成，当前修改已保留，尚未保存。"; owner.publish(); }
  }
  return { model, values: model.draft, id: model.id, notice: model.notice, replace, setDraft, finish,
    current: () => holder.current,
    key: (prefix: string, target = model) => target.id === null ? target : `${prefix}:${target.id}` };
}
