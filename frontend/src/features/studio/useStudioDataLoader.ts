import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";

import { api, type Asset, type AuthUser, type PromptTemplateRecord, type Task } from "../../api";
import { useAuth } from "../../context/AuthContext";
import type { LoadState } from "./studioTypes";

type LoadDataOptions = {
  force?: boolean;
  mode?: "full" | "poll";
};

type UseStudioDataLoaderOptions = {
  currentUser: AuthUser | null;
  setPromptTemplates: (templates: PromptTemplateRecord[]) => void;
  setState: Dispatch<SetStateAction<LoadState>>;
  tasks: Task[];
};

export type StudioDataLoader = ReturnType<typeof useStudioDataLoader>;

const STUDIO_TASKS_LIMIT = 120;
const STUDIO_POLL_TASKS_LIMIT = 40;
const POLL_ACTIVE_MS = 4000;
const POLL_IDLE_MS = 12000;
const CONFIG_REFRESH_MS = 5 * 60 * 1000;

function mergeById<T extends { id: number }>(existing: T[], incoming: T[]): T[] {
  const merged = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    merged.set(item.id, item);
  }
  return Array.from(merged.values());
}

function sortTasksByCreatedDesc(taskList: Task[]): Task[] {
  return [...taskList].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  );
}

function sortAssetsByCreatedDesc(assetList: Asset[]): Asset[] {
  return [...assetList].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  );
}

function mergeTasksPreservingHistory(existing: Task[], incoming: Task[]): Task[] {
  return sortTasksByCreatedDesc(mergeById(existing, incoming));
}

function mergeAssetsPreservingHistory(existing: Asset[], incoming: Asset[]): Asset[] {
  return sortAssetsByCreatedDesc(mergeById(existing, incoming));
}

async function assetsForTasks(taskList: Task[]): Promise<Asset[]> {
  const ids = [...new Set(taskList.map((task) => task.id))];
  const assets: Asset[] = [];
  for (let index = 0; index < ids.length; index += 120) {
    assets.push(...await api.assets({ task_ids: ids.slice(index, index + 120) }));
  }
  return assets;
}

export function useStudioDataLoader({
  currentUser,
  setPromptTemplates,
  setState,
  tasks,
}: UseStudioDataLoaderOptions) {
  const { isGuest } = useAuth();
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const accountEpochRef = useRef(0);
  const oldestTaskIdRef = useRef<number | undefined>(undefined);
  const pagingRef = useRef(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const lastConfigAttemptRef = useRef(0);
  const configurationLoadedRef = useRef(false);
  const configurationErrorRef = useRef("");
  const taskSyncErrorRef = useRef("");
  const resumeSyncPendingRef = useRef(false);
  const loadDataRef = useRef<(options?: LoadDataOptions) => Promise<void>>(async () => {});

  async function refreshConfiguration(requestId: number) {
    if (Date.now() - lastConfigAttemptRef.current < CONFIG_REFRESH_MS) return;
    lastConfigAttemptRef.current = Date.now();
    try {
      const [health, projects, providers, workflows, templates] = await Promise.all([
        api.health(), api.projects(), api.providers(), api.workflows(), api.promptTemplates(),
      ]);
      if (requestId !== loadRequestIdRef.current) return;
      configurationErrorRef.current = "";
      setState((current) => ({ ...current, health: health.status, projects, providers, workflows, error: taskSyncErrorRef.current }));
      setPromptTemplates(templates);
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      configurationErrorRef.current = error instanceof Error ? error.message : "配置刷新失败";
      setState((current) => ({ ...current, error: configurationErrorRef.current }));
    }
  }

  function finishLoad(requestId: number) {
    if (requestId !== loadRequestIdRef.current) return;
    isFetchingRef.current = false;
    if (resumeSyncPendingRef.current && !document.hidden) {
      resumeSyncPendingRef.current = false;
      void loadDataRef.current({ mode: configurationLoadedRef.current ? "poll" : "full" });
    }
  }

  async function loadGuestData(requestId: number) {
    try {
      const [health, providers, workflows, templates] = await Promise.all([
        api.health(),
        api.providers(),
        api.workflows(),
        api.promptTemplates().catch(() => []),
      ]);

      if (requestId !== loadRequestIdRef.current) return;

      setState({
        health: health.status,
        projects: [],
        providers,
        workflows,
        tasks: [],
        assets: [],
        error: configurationErrorRef.current,
        ready: true,
      });
      setPromptTemplates(templates);
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;

      setState((current) => ({
        ...current,
        health: "error",
        error: error instanceof Error ? error.message : "加载失败",
      }));
    }
  }

  async function pollStudioData(requestId: number) {
    try {
      const [recentTasks, activeTasks] = await Promise.all([
        api.tasks({ limit: STUDIO_POLL_TASKS_LIMIT }),
        api.tasks({ status: ["pending", "running"] }),
      ]);
      const loadedTasks = mergeById(recentTasks, activeTasks);
      const seenIds = new Set(loadedTasks.map((task) => task.id));
      const missingActive = tasks.filter((task) =>
        (task.status === "pending" || task.status === "running") && !seenIds.has(task.id));
      for (let index = 0; index < missingActive.length; index += 120) {
        loadedTasks.push(...await api.tasks({ task_ids: missingActive.slice(index, index + 120).map((task) => task.id) }));
      }
      const refreshedIds = new Set(loadedTasks.map((task) => task.id));
      const deletedIds = new Set(missingActive.filter((task) => !refreshedIds.has(task.id)).map((task) => task.id));
      const loadedAssets = await assetsForTasks(loadedTasks);

      if (requestId !== loadRequestIdRef.current) return;

      taskSyncErrorRef.current = "";
      setState((current) => ({
        ...current,
        tasks: mergeTasksPreservingHistory(current.tasks.filter((task) => !deletedIds.has(task.id)), loadedTasks),
        assets: mergeAssetsPreservingHistory(current.assets.filter((asset) => !deletedIds.has(asset.source_task_id ?? -1)), loadedAssets),
        error: configurationErrorRef.current,
      }));
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;

      taskSyncErrorRef.current = error instanceof Error ? error.message : "同步失败";
      setState((current) => ({
        ...current,
        error: taskSyncErrorRef.current,
      }));
    }
  }

  async function loadData(options: LoadDataOptions = {}) {
    if (isFetchingRef.current && !options.force) return;
    isFetchingRef.current = true;
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    if (options.mode === "poll") {
      try {
        await Promise.all([pollStudioData(requestId), refreshConfiguration(requestId)]);
      } finally {
        finishLoad(requestId);
      }
      return;
    }

    let templateLoadError = "";
    lastConfigAttemptRef.current = Date.now();

    try {
      const [health, projects, providers, workflows, pageTasks, activeTasks, templates] = await Promise.all([
        api.health(),
        api.projects(),
        api.providers(),
        api.workflows(),
        api.tasks({ limit: STUDIO_TASKS_LIMIT }),
        api.tasks({ status: ["pending", "running"] }),
        api.promptTemplates().catch((error) => {
          templateLoadError = error instanceof Error ? error.message : "加载提示词失败";
          return [];
        }),
      ]);
      const loadedTasks = mergeById(pageTasks, activeTasks);
      const assets = await assetsForTasks(loadedTasks);

      if (requestId !== loadRequestIdRef.current) return;
      configurationLoadedRef.current = true;
      configurationErrorRef.current = templateLoadError;
      taskSyncErrorRef.current = "";

      if (oldestTaskIdRef.current === undefined) {
        oldestTaskIdRef.current = pageTasks.length ? Math.min(...pageTasks.map((task) => task.id)) : undefined;
        setHasMoreHistory(pageTasks.length === STUDIO_TASKS_LIMIT);
      }
      setState((current) => ({
        health: health.status,
        projects,
        providers,
        workflows,
        tasks: mergeTasksPreservingHistory(current.tasks, loadedTasks),
        assets: mergeAssetsPreservingHistory(current.assets, assets),
        error: templateLoadError,
        ready: true,
      }));
      setPromptTemplates(templates);
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;

      setState((current) => ({
        ...current,
        health: "error",
        error: error instanceof Error ? error.message : "加载失败",
      }));
    } finally {
      finishLoad(requestId);
    }
  }
  loadDataRef.current = loadData;

  async function loadMoreHistory() {
    if (pagingRef.current || !hasMoreHistory || oldestTaskIdRef.current === undefined) return;
    pagingRef.current = true;
    setLoadingHistory(true);
    setHistoryError("");
    const accountRequestId = accountEpochRef.current;
    try {
      const page = await api.tasks({ limit: STUDIO_TASKS_LIMIT, before_id: oldestTaskIdRef.current });
      const assets = await assetsForTasks(page);
      if (accountRequestId !== accountEpochRef.current) return;
      setState((current) => ({ ...current,
        tasks: mergeTasksPreservingHistory(current.tasks, page),
        assets: mergeAssetsPreservingHistory(current.assets, assets),
      }));
      if (page.length) oldestTaskIdRef.current = Math.min(...page.map((task) => task.id));
      setHasMoreHistory(page.length === STUDIO_TASKS_LIMIT);
    } catch (error) {
      if (accountRequestId === accountEpochRef.current) {
        setHistoryError(error instanceof Error ? error.message : "历史记录加载失败，请重试");
      }
    } finally {
      if (accountRequestId === accountEpochRef.current) {
        pagingRef.current = false;
        setLoadingHistory(false);
      }
    }
  }

  useEffect(() => {
    accountEpochRef.current += 1;
    loadRequestIdRef.current += 1;
    oldestTaskIdRef.current = undefined;
    pagingRef.current = false;
    setLoadingHistory(false);
    setHasMoreHistory(false);
    setHistoryError("");
    setLastSyncedAt(null);
    configurationLoadedRef.current = false;
    configurationErrorRef.current = "";
    taskSyncErrorRef.current = "";
    lastConfigAttemptRef.current = 0;
    resumeSyncPendingRef.current = false;
    setState((current) => ({ ...current, tasks: [], assets: [] }));
    const invalidateRequests = () => {
      accountEpochRef.current += 1;
      loadRequestIdRef.current += 1;
      resumeSyncPendingRef.current = false;
    };
    if (isGuest) {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      void loadGuestData(requestId);
      return invalidateRequests;
    }
    if (!currentUser) return invalidateRequests;
    void loadData({ force: true });
    return invalidateRequests;
  }, [isGuest, currentUser?.name]);

  const hasRunningTask = tasks.some((task) => task.status === "pending" || task.status === "running");
  useEffect(() => {
    if (isGuest || !currentUser) return;
    const intervalMs = hasRunningTask ? POLL_ACTIVE_MS : POLL_IDLE_MS;
    let timer: number | undefined;
    const synchronize = () => {
      if (document.hidden) return;
      void loadDataRef.current({ mode: configurationLoadedRef.current ? "poll" : "full" });
    };
    const startTimer = () => {
      if (timer === undefined && !document.hidden) timer = window.setInterval(synchronize, intervalMs);
    };
    const stopTimer = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopTimer();
      } else {
        startTimer();
        if (isFetchingRef.current) resumeSyncPendingRef.current = true;
        else synchronize();
      }
    };
    startTimer();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [currentUser?.name, isGuest, hasRunningTask]);

  return {
    lastSyncedAt,
    loadData,
    loadMoreHistory,
    hasMoreHistory,
    loadingHistory,
    historyError,
  };
}
