import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";

import { api, type AuthUser, type PromptTemplateRecord, type Task } from "../../api";
import type { LoadState } from "./studioTypes";

type LoadDataOptions = {
  force?: boolean;
};

type UseStudioDataLoaderOptions = {
  currentUser: AuthUser | null;
  setPromptTemplates: (templates: PromptTemplateRecord[]) => void;
  setState: Dispatch<SetStateAction<LoadState>>;
  tasks: Task[];
};

export type StudioDataLoader = ReturnType<typeof useStudioDataLoader>;

export function useStudioDataLoader({
  currentUser,
  setPromptTemplates,
  setState,
  tasks,
}: UseStudioDataLoaderOptions) {
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const loadRequestIdRef = useRef(0);

  async function loadData(options: LoadDataOptions = {}) {
    if (isFetchingRef.current && !options.force) return;
    isFetchingRef.current = true;
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    let templateLoadError = "";

    try {
      const [health, projects, providers, workflows, loadedTasks, assets, templates] = await Promise.all([
        api.health(),
        api.projects(),
        api.providers(),
        api.workflows(),
        api.tasks(),
        api.assets(),
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
        ready: true
      });
      setPromptTemplates(templates);
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;

      setState((current) => ({
        ...current,
        health: "error",
        error: error instanceof Error ? error.message : "加载失败"
      }));
    } finally {
      if (requestId === loadRequestIdRef.current) {
        isFetchingRef.current = false;
      }
    }
  }

  useEffect(() => {
    if (!currentUser) return;
    void loadData({ force: true });
  }, [currentUser?.name]);

  useEffect(() => {
    if (!currentUser) return;
    const hasRunningTask = tasks.some((task) => task.status === "pending" || task.status === "running");
    const intervalMs = hasRunningTask ? 2500 : 8000;
    const timer = window.setInterval(() => {
      void loadData();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [currentUser?.name, tasks]);

  return {
    lastSyncedAt,
    loadData,
  };
}
