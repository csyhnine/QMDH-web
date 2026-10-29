import { type SetStateAction, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, type InspirationPost } from "../../api";

/** One committed page/account owns every list read, including its initial read. */
export function useInspirationList(scopeKey: string) {
  const [, redraw] = useState(0);
  const scope = useMemo(() => ({
    active: false, category: "全部", posts: [] as InspirationPost[],
    selectedPostIds: [] as number[], actionError: "", isRefreshing: false,
    request: 0, errorIntent: 0,
  }), [scopeKey]);
  const currentScope = useRef(scope);
  const isCurrent = () => scope.active && currentScope.current === scope;
  function publish() {
    if (isCurrent()) redraw((value) => isCurrent() ? value + 1 : value);
  }
  function setActionError(message: string) {
    if (!isCurrent()) return;
    scope.errorIntent += 1; scope.actionError = message; publish();
  }
  function setSelectedPostIds(change: SetStateAction<number[]>) {
    if (!isCurrent()) return;
    scope.selectedPostIds = typeof change === "function" ? change(scope.selectedPostIds) : change;
    publish();
  }
  async function loadPosts() {
    if (!isCurrent()) return;
    const request = ++scope.request, category = scope.category, intent = ++scope.errorIntent;
    const ownsRequest = () => isCurrent() && scope.request === request && scope.category === category;
    scope.isRefreshing = true; scope.actionError = ""; publish();
    try {
      const posts = await api.inspiration(category);
      if (ownsRequest()) { scope.posts = posts; publish(); }
    } catch (err) {
      if (ownsRequest() && scope.errorIntent === intent) {
        scope.actionError = err instanceof Error ? err.message : "加载灵感库失败"; publish();
      }
    } finally {
      if (ownsRequest()) { scope.isRefreshing = false; publish(); }
    }
  }
  function selectCategory(category: string) {
    if (!isCurrent()) return;
    if (scope.category !== category) { scope.category = category; scope.posts = []; }
    void loadPosts();
  }
  useLayoutEffect(() => {
    currentScope.current.active = false;
    currentScope.current = scope; scope.active = true;
    void loadPosts();
    return () => { scope.active = false; scope.request += 1; };
  }, [scope]);
  return {
    category: scope.category, posts: scope.posts, actionError: scope.actionError,
    isRefreshing: scope.isRefreshing, selectedPostIds: scope.selectedPostIds,
    loadPosts, selectCategory, setActionError, setSelectedPostIds,
  };
}
