import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, type GifToolResult } from "../../api";

type DetailRead = { base: GifToolResult; completed: boolean };
type Selection = {
  kind: "local" | "history" | "query"; record: GifToolResult | null;
  hydration: { base: GifToolResult; record: GifToolResult } | null; detail: DetailRead | null;
};
const selection = (kind: Selection["kind"], record: GifToolResult | null = null): Selection => ({ kind, record, hydration: null, detail: null });
function matchingRecord(item: GifToolResult, id: number): GifToolResult {
  if (!item || item.record_id !== id) throw new Error("压缩记录与当前选择不一致，请重新选择。");
  return item;
}

/** Display subscriptions are separate from the already accepted compression batch. */
export function useGifDisplay(scopeKey: string, recordId: number, localResult: GifToolResult | undefined, canRead: boolean) {
  const [, redraw] = useState(0);
  const scope = useMemo(() => ({ active: false, selection: selection("local"), local: undefined as GifToolResult | undefined, error: "", queryKey: "" }), [scopeKey]);
  const currentScope = useRef(scope);
  const isCurrent = () => scope.active && currentScope.current === scope;
  const owns = (value: Selection) => isCurrent() && scope.selection === value;
  function publish() { if (isCurrent()) redraw((value) => isCurrent() ? value + 1 : value); }
  useLayoutEffect(() => {
    currentScope.current.active = false; currentScope.current = scope; scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  useLayoutEffect(() => { scope.local = localResult; }, [scope, localResult]);
  const queryId = Number.isSafeInteger(recordId) && recordId > 0 ? recordId : 0;
  useLayoutEffect(() => {
    let cancelled = false;
    const queryKey = `${canRead}:${queryId}`;
    if (scope.queryKey === queryKey && scope.selection.kind !== "query") return;
    scope.queryKey = queryKey;
    const value = selection(queryId && canRead ? "query" : "local");
    scope.selection = value; scope.error = ""; publish();
    if (queryId && canRead) api.gifHistoryRecord(queryId).then(item => {
      if (!cancelled && owns(value)) { value.record = matchingRecord(item, queryId); publish(); }
    }).catch(err => {
      if (!cancelled && owns(value)) { scope.error = err instanceof Error ? err.message : "无法读取压缩记录。"; publish(); }
    });
    return () => { cancelled = true; };
  }, [scope, queryId, canRead]);
  const value = scope.selection;
  const base = value.kind === "local" ? localResult : value.record ?? undefined;
  useEffect(() => {
    if (!owns(value) || !canRead || !base?.record_id || (base.source_info && base.output_info)) return;
    if (value.detail && (value.kind !== "local" ? value.detail.completed : value.detail.base === base)) return;
    let cancelled = false;
    const attempt = { base, completed: false }; value.detail = attempt;
    const current = () => !cancelled && owns(value) && value.detail === attempt
      && (value.kind === "local" ? scope.local === base : value.record === base);
    api.gifHistoryRecord(base.record_id).then(item => {
      if (!current()) return;
      const record = matchingRecord(item, base.record_id); attempt.completed = true;
      if (value.kind === "local") value.hydration = { base, record };
      else value.record = record;
      publish();
    }).catch(err => {
      if (current()) { attempt.completed = true; scope.error = err instanceof Error ? err.message : "历史参数读取失败。"; publish(); }
    });
    return () => { cancelled = true; if (!attempt.completed && value.detail === attempt) value.detail = null; };
  }, [scope, value, base, canRead]);
  function showLocal() {
    if (!isCurrent()) return;
    scope.selection = selection("local"); scope.error = ""; publish();
  }
  function showHistory(record: GifToolResult) {
    if (!isCurrent()) return;
    scope.selection = selection("history", record); scope.error = ""; publish();
  }
  function beginDisplayOperation(record: GifToolResult): (() => boolean) | null {
    if (!isCurrent()) return null;
    const previous = scope.selection;
    const currentResult = previous.kind === "local"
      ? previous.hydration && previous.hydration.base === scope.local ? previous.hydration.record : scope.local
      : previous.record;
    if (currentResult !== record) return null;
    const value = { ...previous, detail: null }; scope.selection = value; scope.error = ""; publish();
    return () => owns(value);
  }
  return {
    result: value.kind === "local" ? value.hydration && value.hydration.base === localResult ? value.hydration.record : localResult : value.record ?? undefined,
    historyResult: value.kind === "local" ? null : value.record,
    displayError: scope.error, showLocal, showHistory, beginDisplayOperation,
  };
}
