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
const STUDIO_ASSETS_LIMIT = 200;
const STUDIO_POLL_TASKS_LIMIT = 40;
const STUDIO_POLL_ASSETS_LIMIT = 40;
const POLL_ACTIVE_MS = 4000;
const POLL_IDLE_MS = 12000;

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

function mergeTasksPreservingHistory(existing: Task[], incoming: Task[], maxItems: number): Task[] {
  return sortTasksByCreatedDesc(mergeById(existing, incoming)).slice(0, maxItems);
}

function mergeAssetsPreservingHistory(existing: Asset[], incoming: Asset[], maxItems: number): Asset[] {
  return sortAssetsByCreatedDesc(mergeById(existing, incoming)).slice(0, maxItems);
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
        error: "",
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
      const [loadedTasks, loadedAssets] = await Promise.all([
        api.tasks({ limit: STUDIO_POLL_TASKS_LIMIT }),
        api.assets({ limit: STUDIO_POLL_ASSETS_LIMIT }),
      ]);

      if (requestId !== loadRequestIdRef.current) return;

      setState((current) => ({
        ...current,
        tasks: mergeTasksPreservingHistory(current.tasks, loadedTasks, STUDIO_TASKS_LIMIT),
        assets: mergeAssetsPreservingHistory(current.assets, loadedAssets, STUDIO_ASSETS_LIMIT),
        error: "",
      }));
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;

      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "同步失败",
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
        await pollStudioData(requestId);
      } finally {
        if (requestId === loadRequestIdRef.current) {
          isFetchingRef.current = false;
        }
      }
      return;
    }

    let templateLoadError = "";

    try {
      const [health, projects, providers, workflows, loadedTasks, assets, templates] = await Promise.all([
        api.health(),
        api.projects(),
        api.providers(),
        api.workflows(),
        api.tasks({ limit: STUDIO_TASKS_LIMIT }),
        api.assets({ limit: STUDIO_ASSETS_LIMIT }),
        api.promptTemplates().catch((error) => {
          templateLoadError = error instanceof Error ? error.message : "加载提示词失败";
          return [];
        }),
      ]);

      if (requestId !== loadRequestIdRef.current) return;

      setState({
        health: health.status,
        projects,
        providers,
        workflows,
        tasks: loadedTasks,
        assets,
        error: templateLoadError,
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
    } finally {
      if (requestId === loadRequestIdRef.current) {
        isFetchingRef.current = false;
      }
    }
  }

  useEffect(() => {
    if (isGuest) {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      void loadGuestData(requestId);
      return;
    }
    if (!currentUser) return;
    void loadData({ force: true });
  }, [isGuest, currentUser?.name]);

  useEffect(() => {
    if (isGuest || !currentUser) return;
    const hasRunningTask = tasks.some((task) => task.status === "pending" || task.status === "running");
    const intervalMs = hasRunningTask ? POLL_ACTIVE_MS : POLL_IDLE_MS;
    const timer = window.setInterval(() => {
      void loadData({ mode: hasRunningTask ? "poll" : "full" });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [currentUser?.name, isGuest, tasks]);

  return {
    lastSyncedAt,
    loadData,
  };
}
