import { useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  type CanvasGraphJson,
  type CanvasProjectRecord,
  type CanvasProjectSummary,
} from "../../api";
import { parseCanvasGraph } from "./canvasGraphUtils";
import type { CanvasGraphState } from "./canvasTypes";
import { emptyCanvasGraph } from "./canvasTypes";

type UseCanvasProjectResult = {
  projects: CanvasProjectSummary[];
  activeProject: CanvasProjectRecord | null;
  loading: boolean;
  saving: boolean;
  error: string;
  reloadList: () => Promise<void>;
  openProject: (projectId: number) => Promise<void>;
  createProject: (title?: string, graphJson?: CanvasGraphJson) => Promise<CanvasProjectRecord>;
  renameProject: (title: string) => Promise<void>;
  deleteActiveProject: () => Promise<void>;
  queueSaveGraph: (graph: CanvasGraphState) => void;
  clearError: () => void;
};

export function useCanvasProject(enabled = true): UseCanvasProjectResult {
  const [projects, setProjects] = useState<CanvasProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<CanvasProjectRecord | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const saveTimerRef = useRef<number | null>(null);
  const activeIdRef = useRef<number | null>(null);
  const pendingGraphRef = useRef<CanvasGraphState | null>(null);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    activeIdRef.current = activeProject?.id ?? null;
  }, [activeProject?.id]);

  const reloadList = useCallback(async () => {
    if (!enabled) return;
    const rows = await api.canvasProjects();
    setProjects(rows);
  }, [enabled]);

  const openProject = useCallback(async (projectId: number) => {
    if (!enabled) return;
    setLoading(true);
    try {
      const project = await api.getCanvasProject(projectId);
      setActiveProject(project);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "打开画布失败");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const createProject = useCallback(async (title = "未命名画布", graphJson?: CanvasGraphJson) => {
    if (!enabled) {
      throw new Error("画布项目模式未启用");
    }
    const project = await api.createCanvasProject({
      title,
      graph_json: graphJson ?? emptyCanvasGraph(),
    });
    await reloadList();
    setActiveProject(project);
    return project;
  }, [enabled, reloadList]);

  const renameProject = useCallback(
    async (title: string) => {
      if (!activeProject) return;
      const updated = await api.updateCanvasProject(activeProject.id, { title });
      setActiveProject(updated);
      await reloadList();
    },
    [activeProject, reloadList]
  );

  const deleteActiveProject = useCallback(async () => {
    if (!activeProject) return;
    await api.deleteCanvasProject(activeProject.id);
    setActiveProject(null);
    await reloadList();
  }, [activeProject, reloadList]);

  const flushSaveGraph = useCallback(async () => {
    if (!enabled) return;
    const projectId = activeIdRef.current;
    const graph = pendingGraphRef.current;
    if (!projectId || !graph || saveInFlightRef.current) return;

    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const updated = await api.updateCanvasProject(projectId, { graph_json: graph as CanvasGraphJson });
      // Ignore stale responses when a newer graph is already queued.
      if (activeIdRef.current === projectId && pendingGraphRef.current === graph) {
        pendingGraphRef.current = null;
        setActiveProject((current) =>
          current && current.id === projectId
            ? { ...current, graph_json: updated.graph_json, updated_at: updated.updated_at }
            : current
        );
        setError("");
      }
    } catch (err) {
      if (pendingGraphRef.current === graph) {
        setError(err instanceof Error ? err.message : "保存画布失败");
      }
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
      // A newer graph may have been queued while this request was in flight.
      if (pendingGraphRef.current && pendingGraphRef.current !== graph && activeIdRef.current === projectId) {
        void flushSaveGraph();
      }
    }
  }, [enabled]);

  const queueSaveGraph = useCallback(
    (graph: CanvasGraphState) => {
      if (!enabled) return;
      if (!activeIdRef.current) return;
      pendingGraphRef.current = graph;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void flushSaveGraph();
      }, 700);
    },
    [enabled, flushSaveGraph]
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setProjects([]);
      setActiveProject(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await api.canvasProjects();
        if (cancelled) return;
        setProjects(rows);
        if (rows.length > 0) {
          const project = await api.getCanvasProject(rows[0]!.id);
          if (!cancelled) setActiveProject(project);
        } else {
          const project = await api.createCanvasProject({ title: "我的画布", graph_json: emptyCanvasGraph() });
          if (!cancelled) {
            setActiveProject(project);
            setProjects([{ id: project.id, title: project.title, created_at: project.created_at, updated_at: project.updated_at }]);
          }
        }
        setError("");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载画布失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // Flush pending graph so navigating away does not drop the latest node status.
      const projectId = activeIdRef.current;
      const graph = pendingGraphRef.current;
      if (projectId && graph) {
        pendingGraphRef.current = null;
        void api.updateCanvasProject(projectId, { graph_json: graph as CanvasGraphJson }).catch(() => {
          /* best-effort flush on unmount */
        });
      }
    };
  }, [enabled]);

  return {
    projects,
    activeProject,
    loading,
    saving,
    error,
    reloadList,
    openProject,
    createProject,
    renameProject,
    deleteActiveProject,
    queueSaveGraph,
    clearError: () => setError(""),
  };
}

export function graphFromActiveProject(project: CanvasProjectRecord | null): CanvasGraphState {
  if (!project) return emptyCanvasGraph();
  return parseCanvasGraph(project.graph_json);
}
