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
import { nanoid } from "./canvasId";
import { readProjectDraft, removeProjectDraft, serializeProjectSave, writeProjectDraft, type CanvasProjectDraft } from "./canvasProjectDrafts";

type CanvasProjectCreateOptions = { isCurrent?: () => boolean; onActivated?: (project: CanvasProjectRecord) => void };

type UseCanvasProjectResult = {
  projects: CanvasProjectSummary[];
  activeProject: CanvasProjectRecord | null;
  activeOwnerId: number | undefined;
  viewKey: string;
  isCurrentView: () => boolean;
  loading: boolean;
  saving: boolean;
  hasUnsavedChanges: boolean;
  error: string;
  reloadList: () => Promise<void>;
  openProject: (projectId: number) => Promise<void>;
  createProject: (title?: string, graphJson?: CanvasGraphJson, options?: CanvasProjectCreateOptions) => Promise<CanvasProjectRecord>;
  renameProject: (title: string) => Promise<void>;
  deleteActiveProject: () => Promise<void>;
  queueSaveGraph: (graph: CanvasGraphState) => void;
  retrySave: () => Promise<void>;
  clearError: () => void;
};

export function useCanvasProject(enabled = true, ownerId?: number): UseCanvasProjectResult {
  const [projects, setProjects] = useState<CanvasProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<CanvasProjectRecord | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const activeRef = useRef<CanvasProjectRecord | null>(null);
  const activeViewRef = useRef<{ ownerId: number | undefined; version: number }>({ ownerId: undefined, version: 0 });
  const pendingRef = useRef<(CanvasProjectDraft & { ownerId: number | undefined }) | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const revisionRef = useRef(0);
  const viewRequestRef = useRef(0);
  const listRequestRef = useRef(0);
  const lifetimeRef = useRef(0);
  const mountedRef = useRef(false);

  const activateProject = useCallback((project: CanvasProjectRecord) => {
    let restored = project;
    let message = "";
    try {
      const draft = readProjectDraft(ownerId, project.id);
      if (draft) {
        revisionRef.current = Math.max(revisionRef.current, draft.revision);
        const serverChanged = draft.baseGraphJson !== JSON.stringify(project.graph_json) &&
          JSON.stringify(draft.graph) !== JSON.stringify(project.graph_json);
        if (!serverChanged || window.confirm("发现本地未保存草稿，服务器画布也已更新。是否恢复本地草稿？取消会保留服务器内容和本地备份。")) {
          pendingRef.current = { ...draft, ownerId };
          restored = { ...project, graph_json: draft.graph };
          message = "已恢复未保存的画布草稿，请重试保存。";
        } else {
          message = "本地草稿已保留，当前使用服务器内容。重新打开画布可再次选择恢复。";
        }
      }
    } catch {
      message = "画布草稿备份不可用，请保持页面打开并重试保存。";
    }
    activeViewRef.current = { ownerId, version: activeViewRef.current.version + 1 };
    activeRef.current = restored;
    setActiveProject(restored);
    setHasUnsavedChanges(Boolean(pendingRef.current));
    setError(message);
  }, [ownerId]);

  const flushSaveGraph = useCallback(async (): Promise<void> => {
    const lifetime = lifetimeRef.current;
    if (saveInFlightRef.current) {
      await saveInFlightRef.current;
      if (mountedRef.current && lifetimeRef.current === lifetime && pendingRef.current) await flushSaveGraph();
      return;
    }
    if (!pendingRef.current) return;
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const current = () => mountedRef.current && lifetimeRef.current === lifetime;
    if (current()) setSaving(true);
    const request = (async () => {
      while (pendingRef.current && lifetimeRef.current === lifetime) {
        const item = pendingRef.current;
        let updated: CanvasProjectRecord;
        try {
          updated = await serializeProjectSave(item.ownerId, item.projectId, () => {
            if (lifetimeRef.current !== lifetime) throw new Error("草稿已保留，重新打开画布后可重试保存。");
            return api.updateCanvasProject(item.projectId, { graph_json: item.graph });
          });
        } catch (err) {
          if (current()) setError(err instanceof Error ? err.message : "保存画布失败");
          throw err;
        }
        let message = "";
        try {
          removeProjectDraft(item.ownerId, item.projectId, item.saveId);
        } catch {
          message = "画布已保存，本地草稿备份清理失败。";
        }
        if (pendingRef.current === item) {
          pendingRef.current = null;
          if (current()) {
            if (activeRef.current?.id === item.projectId) {
              activeRef.current = { ...activeRef.current, graph_json: updated.graph_json, updated_at: updated.updated_at };
              setActiveProject(activeRef.current);
            }
            setHasUnsavedChanges(false);
            setError(message);
          }
        }
      }
    })();
    saveInFlightRef.current = request;
    try {
      await request;
    } finally {
      if (saveInFlightRef.current === request) saveInFlightRef.current = null;
      if (current()) setSaving(false);
    }
  }, []);

  const reloadList = useCallback(async () => {
    if (!enabled) return;
    const request = ++listRequestRef.current;
    const lifetime = lifetimeRef.current;
    const rows = await api.canvasProjects();
    if (mountedRef.current && lifetimeRef.current === lifetime && listRequestRef.current === request) setProjects(rows);
  }, [enabled]);

  const openProject = useCallback(async (projectId: number) => {
    if (!enabled) return;
    const request = ++viewRequestRef.current;
    const lifetime = lifetimeRef.current;
    const current = () => mountedRef.current && lifetimeRef.current === lifetime && viewRequestRef.current === request;
    setLoading(true);
    try {
      await flushSaveGraph();
      if (!current()) return;
      const readRevision = revisionRef.current;
      const project = await api.getCanvasProject(projectId);
      if (!current()) return;
      await flushSaveGraph();
      if (current()) {
        const latest = revisionRef.current !== readRevision && activeRef.current?.id === projectId
          ? activeRef.current : project;
        activateProject(latest);
      }
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : "打开画布失败");
      throw err;
    } finally {
      if (current()) setLoading(false);
    }
  }, [enabled, flushSaveGraph, activateProject]);

  const createProject = useCallback(async (title = "未命名画布", graphJson?: CanvasGraphJson, options: CanvasProjectCreateOptions = {}) => {
    if (!enabled) {
      throw new Error("画布项目模式未启用");
    }
    const request = ++viewRequestRef.current;
    const lifetime = lifetimeRef.current;
    const ownerCurrent = () => mountedRef.current && lifetimeRef.current === lifetime;
    const ownsView = () => ownerCurrent() && viewRequestRef.current === request;
    const current = () => ownsView() && (options.isCurrent?.() ?? true);
    setLoading(true);
    try {
      await flushSaveGraph();
      if (!current()) throw new Error("画布新建操作已取消");
      const project = await api.createCanvasProject({ title, graph_json: graphJson ?? emptyCanvasGraph() });
      if (current()) {
        await flushSaveGraph();
        if (current()) { activateProject(project); options.onActivated?.(project); }
      }
      if (ownerCurrent() && (options.isCurrent?.() ?? true)) await reloadList();
      return project;
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : "新建画布失败");
      throw err;
    } finally {
      if (ownsView()) setLoading(false);
    }
  }, [enabled, reloadList, flushSaveGraph, activateProject]);

  const renameProject = useCallback(
    async (title: string) => {
      const projectId = activeRef.current?.id;
      if (!projectId) return;
      const request = viewRequestRef.current;
      const lifetime = lifetimeRef.current;
      const updated = await api.updateCanvasProject(projectId, { title });
      if (mountedRef.current && lifetimeRef.current === lifetime && viewRequestRef.current === request && activeRef.current?.id === projectId) {
        activeRef.current = { ...activeRef.current, title: updated.title, updated_at: updated.updated_at };
        setActiveProject(activeRef.current);
      }
      await reloadList();
    },
    [reloadList]
  );

  const deleteActiveProject = useCallback(async () => {
    const projectId = activeRef.current?.id;
    if (!projectId) return;
    const request = ++viewRequestRef.current;
    const lifetime = lifetimeRef.current;
    const current = () => mountedRef.current && lifetimeRef.current === lifetime && viewRequestRef.current === request;
    setLoading(true);
    try {
      await flushSaveGraph();
      if (!current()) return;
      await api.deleteCanvasProject(projectId);
      try { removeProjectDraft(ownerId, projectId); } catch { /* The server deletion has succeeded. */ }
      if (current()) {
        pendingRef.current = null;
        activeRef.current = null;
        setActiveProject(null);
        setHasUnsavedChanges(false);
        setError("");
      }
      if (!current()) return;
      const rows = await api.canvasProjects();
      if (!current()) return;
      setProjects(rows);
      const next = rows[0]
        ? await api.getCanvasProject(rows[0].id)
        : await api.createCanvasProject({ title: "我的工作流", graph_json: emptyCanvasGraph() });
      if (current()) {
        activateProject(next);
        if (!rows.length) setProjects([next]);
      }
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : "删除画布失败");
      throw err;
    } finally {
      if (current()) setLoading(false);
    }
  }, [flushSaveGraph, ownerId, activateProject]);

  const queueSaveGraph = useCallback(
    (graph: CanvasGraphState) => {
      if (!enabled) return;
      const projectId = activeRef.current?.id;
      if (!projectId) return;
      const item = {
        projectId, revision: ++revisionRef.current, saveId: nanoid(24), ownerId,
        baseUpdatedAt: activeRef.current!.updated_at, baseGraphJson: JSON.stringify(activeRef.current!.graph_json),
        graph: JSON.parse(JSON.stringify(graph)) as CanvasGraphJson,
      };
      pendingRef.current = item;
      setHasUnsavedChanges(true);
      try { writeProjectDraft(ownerId, item); } catch {
        setError("画布草稿备份不可用，请保持页面打开并重试保存。");
      }
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void flushSaveGraph().catch(() => { /* Keep the draft and reported error for retry. */ });
      }, 700);
    },
    [enabled, flushSaveGraph, ownerId]
  );

  useEffect(() => {
    const lifetime = ++lifetimeRef.current;
    const request = ++viewRequestRef.current;
    mountedRef.current = true;
    activeRef.current = null;
    pendingRef.current = null;
    setActiveProject(null);
    setHasUnsavedChanges(false);
    setSaving(false);
    const current = () => mountedRef.current && lifetimeRef.current === lifetime && viewRequestRef.current === request;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingRef.current || saveInFlightRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    if (!enabled) {
      setLoading(false);
      setProjects([]);
    } else void (async () => {
      setLoading(true);
      try {
        const rows = await api.canvasProjects();
        if (!current()) return;
        setProjects(rows);
        if (rows.length > 0) {
          const project = await api.getCanvasProject(rows[0]!.id);
          if (current()) activateProject(project);
        } else {
          const project = await api.createCanvasProject({ title: "我的画布", graph_json: emptyCanvasGraph() });
          if (current()) {
            activateProject(project);
            setProjects([{ id: project.id, title: project.title, created_at: project.created_at, updated_at: project.updated_at }]);
          }
        }
      } catch (err) {
        if (current()) setError(err instanceof Error ? err.message : "加载画布失败");
      } finally {
        if (current()) setLoading(false);
      }
    })();
    return () => {
      mountedRef.current = false;
      lifetimeRef.current += 1;
      viewRequestRef.current += 1;
      listRequestRef.current += 1;
      window.removeEventListener("beforeunload", warnBeforeUnload);
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // Queueing already backed up the draft. Do not race an in-flight PATCH
      // with another write during unmount; reopening restores the same draft.
    };
  }, [enabled, activateProject]);

  const renderedView = activeViewRef.current;
  return {
    projects,
    activeProject,
    isCurrentView: () => mountedRef.current && activeViewRef.current === renderedView && renderedView.ownerId === ownerId && activeRef.current?.id === activeProject?.id,
    activeOwnerId: activeViewRef.current.ownerId,
    viewKey: `${activeViewRef.current.ownerId ?? "none"}:${activeProject?.id ?? "none"}:${activeViewRef.current.version}`,
    loading,
    saving,
    hasUnsavedChanges,
    error,
    reloadList,
    openProject,
    createProject,
    renameProject,
    deleteActiveProject,
    queueSaveGraph,
    retrySave: flushSaveGraph,
    clearError: () => setError(""),
  };
}

export function graphFromActiveProject(project: CanvasProjectRecord | null): CanvasGraphState {
  if (!project) return emptyCanvasGraph();
  return parseCanvasGraph(project.graph_json);
}
