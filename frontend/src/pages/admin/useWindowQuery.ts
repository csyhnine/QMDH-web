import { type SetStateAction, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";

type Query<P> = { params: P; started: boolean; sequence: number; loading: boolean; error: string };
type Snapshot<P, D> = { params: P; data: D; updatedAt: string };
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const query = <P,>(params: P): Query<P> => ({ params: copy(params), started: false, sequence: 0, loading: true, error: "" });

// Query params are plain window/date values. Data and its source are accepted together.
export function useWindowQuery<P, D>(initial: () => P, empty: D, load: (params: P) => Promise<D>, failure: string) {
  const { currentUser, isGuest } = useAuth();
  const [, redraw] = useState(0);
  const scope = useMemo(() => ({
    active: false, query: query(initial()), snapshot: null as Snapshot<P, D> | null,
    operations: new Map<string, Promise<void>>(), actionSequence: 0, actionMessage: "", actionError: "",
  }), [currentUser?.id, currentUser?.name, isGuest]);
  const current = useRef(scope), loader = useRef({ load, failure });
  const isCurrent = useCallback(() => scope.active && current.current === scope, [scope]);
  const publish = useCallback(() => { if (isCurrent()) redraw(value => isCurrent() ? value + 1 : value); }, [isCurrent]);
  useLayoutEffect(() => {
    current.current.active = false; current.current = scope; scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  useLayoutEffect(() => { loader.current = { load, failure }; }, [load, failure]);

  const refresh = useCallback(async () => {
    if (!isCurrent()) return;
    const target = scope.query, sequence = ++target.sequence;
    target.started = true; target.loading = true; target.error = ""; publish();
    const allowed = () => isCurrent() && scope.query === target && target.sequence === sequence;
    try {
      const data = await loader.current.load(copy(target.params));
      if (allowed()) scope.snapshot = { params: copy(target.params), data, updatedAt: new Date().toISOString() };
    } catch (error) {
      if (allowed()) target.error = error instanceof Error ? error.message : loader.current.failure;
    } finally {
      if (allowed()) { target.loading = false; publish(); }
    }
  }, [scope, isCurrent, publish]);

  function setParams(change: SetStateAction<P>) {
    if (!isCurrent()) return;
    const params = typeof change === "function" ? (change as (value: P) => P)(copy(scope.query.params)) : change;
    scope.query = query(params); scope.actionMessage = ""; scope.actionError = ""; publish();
  }
  const renderedQuery = scope.query;
  useEffect(() => { if (!renderedQuery.started) void refresh(); }, [renderedQuery, refresh]);

  function runAction(key: string, work: () => Promise<string>): Promise<void> {
    if (!isCurrent()) return Promise.resolve();
    const pending = scope.operations.get(key); if (pending) return pending;
    const origin = scope.query, sequence = ++scope.actionSequence;
    scope.actionMessage = ""; scope.actionError = "";
    const allowed = () => isCurrent() && scope.query === origin && scope.actionSequence === sequence;
    // Schedule work after registering its promise, including synchronous re-entry.
    const operation = Promise.resolve().then(async () => {
      try {
        if (!isCurrent()) return;
        const message = await work();
        if (allowed()) scope.actionMessage = message;
        if (isCurrent()) await refresh();
      } catch (error) {
        if (allowed()) scope.actionError = error instanceof Error ? error.message : "操作失败";
      } finally {
        if (scope.operations.get(key) === operation) scope.operations.delete(key);
        publish();
      }
    });
    scope.operations.set(key, operation); publish(); return operation;
  }
  return { params: renderedQuery.params, setParams, data: scope.snapshot?.data ?? empty, snapshot: scope.snapshot,
    loading: renderedQuery.loading, error: renderedQuery.error, refresh, runAction,
    actionMessage: scope.actionMessage, actionError: scope.actionError, isActionBusy: (key: string) => scope.operations.has(key) };
}
