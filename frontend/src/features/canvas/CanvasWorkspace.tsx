import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  applyEdgeChanges,
  applyNodeChanges,
  addEdge,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";

import { api, type CanvasGraphJson, type CanvasTemplateSummary, type Provider } from "../../api";
import MediaComparePanel from "../../components/shared/MediaComparePanel";
import { useAuth } from "../../context/AuthContext";
import { usePromptPolishEnabled } from "../../lib/usePromptPolishEnabled";
import { isRuntimeUpscaleProvider, publicProviderDisplayName } from "../studio/modelAdminUtils";
import { downloadMediaUrl } from "../studio/studioMediaDownload";
import { uniqueMediaPaths } from "../studio/studioCompareUtils";
import { firstCanvasProviderName } from "./canvasProviderGroups";
import { prepareReferenceUploadFiles, uploadReferenceFiles } from "../studio/studioReferenceUtils";
import { exportAnnotatedDataUrl } from "./annotateDraw";
import CanvasBoard from "./CanvasBoard";
import CanvasNodeInspector from "./CanvasNodeInspector";
import CanvasProjectLibrary from "./CanvasProjectLibrary";
import { CanvasNodeActionsProvider } from "./canvasNodeContext";
import {
  collectUpstreamDeliverables,
  createUploadImageNode,
  duplicateCanvasSelection,
  groupSelectedNodes,
  isRunnableCanvasNode,
  listRunnableNodeIdsForSelection,
  listRunnableNodeIdsInTopoOrder,
  pasteCanvasSnapshot,
  serializeCanvasGraph,
  snapshotCanvasSelection,
  ungroupSelectedNodes,
  type CanvasNodeDefaults,
} from "./canvasGraphUtils";
import type {
  CanvasFlowNode,
  CanvasGenerateNode,
  GenerateNodeData,
  NoteNodeData,
} from "./canvasTypes";
import { isGenerateNode, isGroupNode } from "./canvasTypes";
import { graphFromActiveProject, useCanvasProject } from "./useCanvasProject";
import { graphFromTemplate, useCanvasTemplateEditor } from "./useCanvasTemplateEditor";
import {
  resumeCanvasNodeTaskPolls,
  syncCanvasNodeTask,
  useCanvasNodeGenerate,
  isResumableCanvasNodeTask,
  type PatchNodeOptions,
} from "./useCanvasNodeGenerate";
import { cloneCanvasSnapshot, useCanvasHistory } from "./useCanvasHistory";
import PublishCanvasTemplateDialog from "./PublishCanvasTemplateDialog";

const CONTENT_HISTORY_DEBOUNCE_MS = 400;

const DEBOUNCED_GENERATE_KEYS = new Set<keyof GenerateNodeData>([
  "prompt",
  "style",
  "aspectRatio",
  "resolution",
  "label",
  "classification",
  "creationMode",
  "requestedProvider",
  "projectCode",
  "upscaleStyle",
  "upscaleNoise",
  "upscaleScale",
  "annotationTool",
  "annotationColor",
  "annotationWidth",
  "annotationOpacity",
]);

function isDebouncedGeneratePatch(patch: Partial<GenerateNodeData>): boolean {
  const keys = Object.keys(patch) as (keyof GenerateNodeData)[];
  return keys.length > 0 && keys.every((key) => DEBOUNCED_GENERATE_KEYS.has(key));
}

function isStatusOnlyGeneratePatch(patch: Partial<GenerateNodeData>): boolean {
  const keys = Object.keys(patch);
  if (keys.length === 0) return false;
  return keys.every((key) => key === "status" || key === "errorMessage" || key === "taskId");
}

type CanvasWorkspaceProps = {
  editTemplateId?: number;
  onExit?: () => void;
};

export default function CanvasWorkspace({ editTemplateId, onExit }: CanvasWorkspaceProps = {}) {
  const isTemplateMode = editTemplateId != null;
  const navigate = useNavigate();
  const { isGuest, canUseOpsViews } = useAuth();
  const promptPolishEnabled = usePromptPolishEnabled();
  const canvas = useCanvasProject(!isTemplateMode);
  const templateEditor = useCanvasTemplateEditor(isTemplateMode ? editTemplateId : null);
  const [nodes, setNodes] = useState<CanvasFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [providers, setProviders] = useState<Provider[]>([]);
  const [projectCode, setProjectCode] = useState("QMDH-001");
  const [templates, setTemplates] = useState<CanvasTemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<number | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [bannerOk, setBannerOk] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [bannerError, setBannerError] = useState("");
  const [mediaPreview, setMediaPreview] = useState<{
    url: string;
    compareUrls?: string[];
    taskId?: number;
    assetId?: number;
  } | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const clipboardRef = useRef<{ nodes: CanvasFlowNode[]; edges: Edge[] } | null>(null);
  const runningAllRef = useRef(false);
  const history = useCanvasHistory();
  const interactionBaselineRef = useRef<ReturnType<typeof cloneCanvasSnapshot> | null>(null);
  const contentHistoryArmedRef = useRef(false);
  const contentHistoryTimerRef = useRef<number | null>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const viewportRef = useRef(viewport);

  const sessionLoading = isTemplateMode ? templateEditor.loading : canvas.loading;
  const sessionSaving = isTemplateMode ? templateEditor.saving : canvas.saving;
  const sessionError = isTemplateMode ? templateEditor.error : canvas.error;
  const boardKey = isTemplateMode
    ? templateEditor.template?.id ?? "template"
    : canvas.activeProject?.id ?? "empty";
  const boardTitle = isTemplateMode
    ? templateEditor.template?.title || "模板工作流"
    : canvas.activeProject?.title || "无限画布";

  useEffect(() => {
    if (contentHistoryTimerRef.current != null) {
      window.clearTimeout(contentHistoryTimerRef.current);
      contentHistoryTimerRef.current = null;
    }
    contentHistoryArmedRef.current = false;
    interactionBaselineRef.current = null;
    history.clear();

    if (isTemplateMode) {
      const graph = graphFromTemplate(templateEditor.template);
      nodesRef.current = graph.nodes;
      edgesRef.current = graph.edges;
      viewportRef.current = graph.viewport;
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setViewport(graph.viewport);
      setSelectedNodeIds([]);
      return;
    }
    const graph = graphFromActiveProject(canvas.activeProject);
    nodesRef.current = graph.nodes;
    edgesRef.current = graph.edges;
    viewportRef.current = graph.viewport;
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setViewport(graph.viewport);
    setSelectedNodeIds([]);
  }, [isTemplateMode, canvas.activeProject?.id, templateEditor.template?.id, history.clear]);

  useEffect(() => {
    if (isGuest) return;
    Promise.all([api.providers(), api.projects()])
      .then(([providerRows, projectRows]) => {
        setProviders(providerRows);
        setProjectCode(projectRows[0]?.code || "QMDH-001");
      })
      .catch(() => {
        setProviders([]);
        setProjectCode("QMDH-001");
      });
  }, [isGuest]);

  const nodeDefaults = useMemo<CanvasNodeDefaults>(
    () => ({
      projectCode,
      imageProvider: firstCanvasProviderName(providers, "image"),
      videoProvider: firstCanvasProviderName(providers, "video"),
      upscaleProvider:
        firstCanvasProviderName(providers, "upscale") ||
        providers.find((provider) => isRuntimeUpscaleProvider(provider))?.provider_name ||
        "",
    }),
    [projectCode, providers]
  );

  const persistGraph = useCallback(
    (nextNodes: CanvasFlowNode[], nextEdges: Edge[], nextViewport: Viewport) => {
      const graph = serializeCanvasGraph(nextNodes, nextEdges, nextViewport);
      if (isTemplateMode) {
        templateEditor.queueSaveGraph(graph);
      } else {
        canvas.queueSaveGraph(graph);
      }
    },
    [canvas.queueSaveGraph, isTemplateMode, templateEditor.queueSaveGraph]
  );

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const flushContentHistorySession = useCallback(() => {
    contentHistoryArmedRef.current = false;
    if (contentHistoryTimerRef.current != null) {
      window.clearTimeout(contentHistoryTimerRef.current);
      contentHistoryTimerRef.current = null;
    }
  }, []);

  const armContentHistory = useCallback(() => {
    if (!contentHistoryArmedRef.current) {
      history.push(nodesRef.current, edgesRef.current);
      contentHistoryArmedRef.current = true;
    }
    if (contentHistoryTimerRef.current != null) {
      window.clearTimeout(contentHistoryTimerRef.current);
    }
    contentHistoryTimerRef.current = window.setTimeout(() => {
      contentHistoryArmedRef.current = false;
      contentHistoryTimerRef.current = null;
    }, CONTENT_HISTORY_DEBOUNCE_MS);
  }, [history]);

  const applyGraph = useCallback(
    (
      nextNodes: CanvasFlowNode[],
      nextEdges: Edge[],
      options?: { recordHistory?: boolean }
    ) => {
      const recordHistory = options?.recordHistory !== false;
      if (recordHistory) {
        flushContentHistorySession();
        history.push(nodesRef.current, edgesRef.current);
      }
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;
      setNodes(nextNodes);
      setEdges(nextEdges);
      persistGraph(nextNodes, nextEdges, viewportRef.current);
    },
    [flushContentHistorySession, history, persistGraph]
  );

  const restoreGraph = useCallback(
    (snapshot: { nodes: CanvasFlowNode[]; edges: Edge[] }) => {
      history.isRestoringRef.current = true;
      flushContentHistorySession();
      interactionBaselineRef.current = null;
      nodesRef.current = snapshot.nodes;
      edgesRef.current = snapshot.edges;
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      persistGraph(snapshot.nodes, snapshot.edges, viewportRef.current);
      queueMicrotask(() => {
        history.isRestoringRef.current = false;
      });
    },
    [flushContentHistorySession, history, persistGraph]
  );

  const onUndo = useCallback(() => {
    if (sessionLoading || runningAllRef.current) return;
    const previous = history.undo({ nodes: nodesRef.current, edges: edgesRef.current });
    if (!previous) return;
    restoreGraph(previous);
  }, [history, restoreGraph, sessionLoading]);

  const onRedo = useCallback(() => {
    if (sessionLoading || runningAllRef.current) return;
    const next = history.redo({ nodes: nodesRef.current, edges: edgesRef.current });
    if (!next) return;
    restoreGraph(next);
  }, [history, restoreGraph, sessionLoading]);

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasFlowNode>[]) => {
      const onlySelect = changes.length > 0 && changes.every((change) => change.type === "select");
      const startingDrag = changes.some(
        (change) => change.type === "position" && change.dragging === true
      );
      const endingDrag = changes.some(
        (change) => change.type === "position" && change.dragging === false
      );
      const startingResize = changes.some(
        (change) => change.type === "dimensions" && change.resizing === true
      );
      const endingResize = changes.some(
        (change) => change.type === "dimensions" && change.resizing === false
      );
      const structural = changes.some(
        (change) => change.type === "remove" || change.type === "add" || change.type === "replace"
      );

      setNodes((current) => {
        if ((startingDrag || startingResize) && !interactionBaselineRef.current) {
          interactionBaselineRef.current = cloneCanvasSnapshot(current, edgesRef.current);
        }

        const next = applyNodeChanges(changes, current);

        if (onlySelect) {
          nodesRef.current = next;
          persistGraph(next, edgesRef.current, viewportRef.current);
          return next;
        }

        if (endingDrag || endingResize) {
          if (interactionBaselineRef.current) {
            flushContentHistorySession();
            history.pushSnapshot(interactionBaselineRef.current);
            interactionBaselineRef.current = null;
          }
          nodesRef.current = next;
          persistGraph(next, edgesRef.current, viewportRef.current);
          return next;
        }

        if (interactionBaselineRef.current) {
          nodesRef.current = next;
          persistGraph(next, edgesRef.current, viewportRef.current);
          return next;
        }

        if (structural) {
          flushContentHistorySession();
          history.push(current, edgesRef.current);
        }

        nodesRef.current = next;
        persistGraph(next, edgesRef.current, viewportRef.current);
        return next;
      });
    },
    [flushContentHistorySession, history, persistGraph]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const meaningful = changes.some((change) => change.type !== "select");
      setEdges((current) => {
        const next = applyEdgeChanges(changes, current);
        if (meaningful) {
          flushContentHistorySession();
          history.push(nodesRef.current, current);
        }
        edgesRef.current = next;
        persistGraph(nodesRef.current, next, viewportRef.current);
        return next;
      });
    },
    [flushContentHistorySession, history, persistGraph]
  );

  const onEdgesReplace = useCallback(
    (next: Edge[]) => {
      applyGraph(nodesRef.current, next);
    },
    [applyGraph]
  );

  const onAddNode = useCallback(
    (node: CanvasFlowNode) => {
      applyGraph(nodesRef.current.concat(node), edgesRef.current);
      setSelectedNodeIds([node.id]);
    },
    [applyGraph]
  );

  const onAddConnectedNode = useCallback(
    (node: CanvasFlowNode, connection: { source: string; target: string }) => {
      const nextNodes = nodesRef.current.concat(node);
      const nextEdges = addEdge(
        {
          ...connection,
          id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        },
        edgesRef.current
      );
      applyGraph(nextNodes, nextEdges);
      setSelectedNodeIds([node.id]);
    },
    [applyGraph]
  );

  const onViewportChange = useCallback(
    (next: Viewport) => {
      viewportRef.current = next;
      setViewport(next);
      persistGraph(nodesRef.current, edgesRef.current, next);
    },
    [persistGraph]
  );

  const patchNode = useCallback(
    (nodeId: string, patch: Partial<GenerateNodeData>, options?: PatchNodeOptions) => {
      const recordHistory = options?.recordHistory !== false;
      if (recordHistory) {
        if (isDebouncedGeneratePatch(patch)) {
          armContentHistory();
        } else if (!isStatusOnlyGeneratePatch(patch)) {
          flushContentHistorySession();
          history.push(nodesRef.current, edgesRef.current);
        }
      }

      setNodes((current) => {
        const next = current.map((node) =>
          node.id === nodeId && isGenerateNode(node)
            ? { ...node, data: { ...node.data, ...patch } }
            : node
        );
        nodesRef.current = next;
        persistGraph(next, edgesRef.current, viewportRef.current);
        return next;
      });
    },
    [armContentHistory, flushContentHistorySession, history, persistGraph]
  );

  const patchNodeRef = useRef(patchNode);
  useEffect(() => {
    patchNodeRef.current = patchNode;
  }, [patchNode]);

  const patchNodeSilent = useCallback((nodeId: string, patch: Partial<GenerateNodeData>) => {
    patchNodeRef.current(nodeId, patch, { recordHistory: false });
  }, []);

  const pendingTaskFingerprint = useMemo(
    () =>
      nodes
        .filter(isGenerateNode)
        .filter((node) => isResumableCanvasNodeTask(node.data))
        .map((node) => `${node.id}:${node.data.taskId}`)
        .sort()
        .join("|"),
    [nodes]
  );

  // Leaving canvas unmounts the page and kills in-flight pollers; resume any stuck tasks.
  useEffect(() => {
    if (sessionLoading) return;
    resumeCanvasNodeTaskPolls(nodesRef.current, patchNodeSilent);
  }, [boardKey, sessionLoading, pendingTaskFingerprint, patchNodeSilent]);

  const patchNoteNode = useCallback(
    (nodeId: string, patch: Partial<NoteNodeData>, options?: PatchNodeOptions) => {
      const recordHistory = options?.recordHistory !== false;
      if (recordHistory) {
        if (Object.keys(patch).every((key) => key === "text")) {
          armContentHistory();
        } else {
          flushContentHistorySession();
          history.push(nodesRef.current, edgesRef.current);
        }
      }

      setNodes((current) => {
        const next = current.map((node) =>
          node.id === nodeId && node.type === "note"
            ? { ...node, data: { ...node.data, ...patch } }
            : node
        );
        nodesRef.current = next;
        persistGraph(next, edgesRef.current, viewportRef.current);
        return next;
      });
    },
    [armContentHistory, flushContentHistorySession, history, persistGraph]
  );

  const canGroup = useMemo(() => {
    const selected = nodes.filter((node) => selectedNodeIds.includes(node.id));
    return selected.filter((node) => node.type !== "group" && !node.parentId).length >= 2;
  }, [nodes, selectedNodeIds]);

  const canUngroup = useMemo(() => {
    return selectedNodeIds.some((id) => {
      const node = nodes.find((item) => item.id === id);
      return Boolean(node && (isGroupNode(node) || node.parentId));
    });
  }, [nodes, selectedNodeIds]);

  const onGroupSelection = useCallback(() => {
    const current = nodesRef.current;
    const next = groupSelectedNodes(current, selectedNodeIds);
    if (!next) return;
    applyGraph(next, edgesRef.current);
    const group = next.find((node) => isGroupNode(node) && !current.some((item) => item.id === node.id));
    if (group) setSelectedNodeIds([group.id]);
  }, [applyGraph, selectedNodeIds]);

  const onUngroupSelection = useCallback(() => {
    const next = ungroupSelectedNodes(nodesRef.current, selectedNodeIds);
    if (!next) return;
    applyGraph(next, edgesRef.current);
  }, [applyGraph, selectedNodeIds]);

  const canDuplicate = selectedNodeIds.length > 0;

  const onDuplicateSelection = useCallback(() => {
    if (sessionLoading || selectedNodeIds.length === 0) return;
    const result = duplicateCanvasSelection(nodesRef.current, edgesRef.current, selectedNodeIds);
    if (!result) return;
    applyGraph(result.nodes, result.edges);
    setSelectedNodeIds(result.createdIds);
    setBannerError("");
    setBannerOk(`已复制 ${result.createdIds.length} 个节点`);
  }, [applyGraph, selectedNodeIds, sessionLoading]);

  const onCopySelection = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    const snapshot = snapshotCanvasSelection(nodesRef.current, edgesRef.current, selectedNodeIds);
    if (!snapshot) return;
    clipboardRef.current = snapshot;
    setBannerOk(`已复制 ${snapshot.nodes.length} 个节点（Ctrl+V 粘贴）`);
    setBannerError("");
  }, [selectedNodeIds]);

  const onPasteSelection = useCallback(() => {
    if (sessionLoading || !clipboardRef.current) return;
    const result = pasteCanvasSnapshot(nodesRef.current, edgesRef.current, clipboardRef.current);
    if (!result) return;
    applyGraph(result.nodes, result.edges);
    setSelectedNodeIds(result.createdIds);
    setBannerError("");
    setBannerOk(`已粘贴 ${result.createdIds.length} 个节点`);
  }, [applyGraph, sessionLoading]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (sessionLoading || runningAllRef.current) return;
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        onRedo();
      } else if (key === "z") {
        event.preventDefault();
        onUndo();
      } else if (key === "y") {
        event.preventDefault();
        onRedo();
      } else if (key === "g" && event.shiftKey) {
        event.preventDefault();
        onUngroupSelection();
      } else if (key === "g") {
        event.preventDefault();
        onGroupSelection();
      } else if (key === "d") {
        event.preventDefault();
        onDuplicateSelection();
      } else if (key === "c") {
        event.preventDefault();
        onCopySelection();
      } else if (key === "v") {
        event.preventDefault();
        onPasteSelection();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    sessionLoading,
    onCopySelection,
    onDuplicateSelection,
    onGroupSelection,
    onPasteSelection,
    onRedo,
    onUndo,
    onUngroupSelection,
  ]);

  const uploadNodeImage = useCallback(
    async (nodeId: string, file: File) => {
      const { acceptedFiles, errors } = prepareReferenceUploadFiles([file], 0, 1);
      if (errors[0]) {
        patchNode(nodeId, { status: "failed", errorMessage: errors[0] });
        return;
      }
      const accepted = acceptedFiles[0];
      if (!accepted) return;
      flushContentHistorySession();
      history.push(nodesRef.current, edgesRef.current);
      patchNode(nodeId, { status: "submitting", errorMessage: undefined }, { recordHistory: false });
      try {
        const uploaded = await uploadReferenceFiles([accepted], api.uploadReferenceImage);
        const path = uploaded[0]?.storagePath;
        if (!path) throw new Error("上传失败");
        patchNode(
          nodeId,
          {
            status: "completed",
            referenceImages: [path],
            assetUrls: [path],
            previewImagePath: path,
            errorMessage: undefined,
            ...(uploaded[0]?.fileName ? { label: `上传 · ${uploaded[0].fileName}` } : {}),
          },
          { recordHistory: false }
        );
        setBannerError("");
      } catch (err) {
        patchNode(
          nodeId,
          {
            status: "failed",
            errorMessage: err instanceof Error ? err.message : "上传失败",
          },
          { recordHistory: false }
        );
      }
    },
    [flushContentHistorySession, history, patchNode]
  );

  const saveAnnotation = useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((item) => item.id === nodeId);
      if (!node || !isGenerateNode(node) || node.data.nodeKind !== "annotate") return;
      const upstream = collectUpstreamDeliverables(nodeId, nodesRef.current, edgesRef.current);
      const baseUrl =
        upstream.images[0] ||
        node.data.referenceImages[0] ||
        node.data.previewImagePath ||
        node.data.assetUrls[0] ||
        "";
      if (!baseUrl) {
        patchNode(nodeId, { status: "failed", errorMessage: "请先连接上游图片作为标注底图。" });
        return;
      }
      if (node.data.annotationStrokes.length === 0) {
        patchNode(nodeId, { status: "failed", errorMessage: "请先在图上添加标注。" });
        return;
      }
      flushContentHistorySession();
      history.push(nodesRef.current, edgesRef.current);
      patchNode(nodeId, { status: "submitting", errorMessage: undefined }, { recordHistory: false });
      try {
        const dataUrlResult = await exportAnnotatedDataUrl(baseUrl, node.data.annotationStrokes);
        const uploaded = await api.uploadReferenceImage({
          file_name: dataUrlResult.fileName,
          data_url: dataUrlResult.dataUrl,
        });
        patchNode(
          nodeId,
          {
            status: "completed",
            assetUrls: [uploaded.storage_path],
            previewImagePath: uploaded.storage_path,
            errorMessage: undefined,
          },
          { recordHistory: false }
        );
        setBannerError("");
      } catch (err) {
        patchNode(
          nodeId,
          {
            status: "failed",
            errorMessage: err instanceof Error ? err.message : "保存标注失败",
          },
          { recordHistory: false }
        );
      }
    },
    [flushContentHistorySession, history, patchNode]
  );

  const onDropImages = useCallback(
    async (files: File[], position: { x: number; y: number }) => {
      const { acceptedFiles, errors } = prepareReferenceUploadFiles(files, 0, 8);
      for (const message of errors) setBannerError(message);
      if (acceptedFiles.length === 0) return;

      try {
        const uploaded = await uploadReferenceFiles(acceptedFiles, api.uploadReferenceImage);
        const created: CanvasGenerateNode[] = [];
        uploaded.forEach((item, index) => {
          created.push(
            createUploadImageNode(
              { x: position.x + index * 36, y: position.y + index * 36 },
              nodeDefaults,
              item.storagePath,
              item.fileName
            )
          );
        });
        applyGraph(nodesRef.current.concat(created), edgesRef.current);
        if (created[0]) setSelectedNodeIds([created[0].id]);
        setBannerError("");
      } catch (err) {
        setBannerError(err instanceof Error ? err.message : "图片上传失败");
      }
    },
    [applyGraph, nodeDefaults]
  );

  const runGenerate = useCanvasNodeGenerate(providers, nodes, edges, patchNodeSilent);

  const handleGenerate = useCallback(
    async (nodeId: string, data: GenerateNodeData) => {
      await runGenerate(nodeId, {
        ...data,
        projectCode: data.projectCode || projectCode,
        requestedProvider:
          data.requestedProvider ||
          (data.nodeKind === "video"
            ? nodeDefaults.videoProvider
            : data.nodeKind === "upscale"
              ? nodeDefaults.upscaleProvider
              : nodeDefaults.imageProvider),
      });
    },
    [nodeDefaults, projectCode, runGenerate]
  );

  const handleSyncNodeTask = useCallback(
    (nodeId: string, data: GenerateNodeData) => {
      void syncCanvasNodeTask(nodeId, data, patchNodeSilent);
    },
    [patchNodeSilent]
  );

  const runnableCount = useMemo(
    () => nodes.filter(isRunnableCanvasNode).length,
    [nodes]
  );

  const selectedRunnableCount = useMemo(
    () => listRunnableNodeIdsForSelection(nodes, edges, selectedNodeIds).order.length,
    [edges, nodes, selectedNodeIds]
  );

  const runWorkflow = useCallback(
    async (mode: "all" | "selection") => {
      if (sessionLoading || runningAllRef.current || isTemplateMode) return;

      const label = mode === "all" ? "全局运行" : "批量运行";
      const scoped =
        mode === "selection"
          ? listRunnableNodeIdsForSelection(nodesRef.current, edges, selectedNodeIds)
          : {
              ...listRunnableNodeIdsInTopoOrder(nodesRef.current, edges),
              expandedIds: new Set<string>(),
            };
      const { order, cycle } = scoped;

      if (cycle) {
        setBannerError(
          mode === "selection"
            ? "所选节点之间存在环状依赖，无法批量运行"
            : "工作流存在环状依赖，无法全局运行"
        );
        setBannerOk("");
        return;
      }
      if (order.length === 0) {
        setBannerError(
          mode === "selection"
            ? "所选范围内没有可运行的生成节点（文生图 / 图生图 / 视频 / 放大；选中编组会包含组内节点）"
            : "没有可运行的生成节点（文生图 / 图生图 / 视频 / 放大）"
        );
        setBannerOk("");
        return;
      }

      runningAllRef.current = true;
      setRunningAll(true);
      setBannerError("");
      setBannerOk(`${label} 0/${order.length}`);

      try {
        let finished = 0;
        for (const nodeId of order) {
          const latest = nodesRef.current.find((node) => node.id === nodeId);
          if (!latest || !isGenerateNode(latest) || !isRunnableCanvasNode(latest)) {
            finished += 1;
            continue;
          }
          const alreadyDone =
            latest.data.status === "completed" && latest.data.assetUrls.some((url) => Boolean(url));
          if (alreadyDone) {
            finished += 1;
            setBannerOk(`${label} ${finished}/${order.length}（已跳过有结果的节点）`);
            continue;
          }

          setBannerOk(`${label} ${finished + 1}/${order.length}：${latest.data.label || nodeId}`);
          await handleGenerate(nodeId, latest.data);

          const after = nodesRef.current.find((node) => node.id === nodeId);
          if (after && isGenerateNode(after) && after.data.status === "failed") {
            setBannerError(
              `节点「${after.data.label || nodeId}」失败：${after.data.errorMessage || "请检查配置"}，已停止后续节点`
            );
            setBannerOk("");
            return;
          }
          finished += 1;
          setBannerOk(`${label} ${finished}/${order.length}`);
        }
        setBannerOk(`${label}完成：${finished}/${order.length}`);
      } finally {
        runningAllRef.current = false;
        setRunningAll(false);
      }
    },
    [edges, handleGenerate, isTemplateMode, selectedNodeIds, sessionLoading]
  );

  const handleRunAll = useCallback(() => void runWorkflow("all"), [runWorkflow]);
  const handleRunSelection = useCallback(() => void runWorkflow("selection"), [runWorkflow]);

  const getUpstreamDeliverables = useCallback(
    (nodeId: string) => collectUpstreamDeliverables(nodeId, nodes, edges),
    [edges, nodes]
  );

  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0]! : null;
  const selectedNode = useMemo(() => {
    const node = selectedNodeId ? nodes.find((item) => item.id === selectedNodeId) : null;
    return node && isGenerateNode(node) ? node : null;
  }, [nodes, selectedNodeId]);

  const selectedUpstream = useMemo(
    () => (selectedNodeId ? getUpstreamDeliverables(selectedNodeId) : { images: [], videos: [] }),
    [getUpstreamDeliverables, selectedNodeId]
  );

  const providerHint = useMemo(() => {
    const provider = providers.find((item) => item.provider_name === nodeDefaults.imageProvider);
    return provider ? publicProviderDisplayName(provider) : "未配置模型";
  }, [nodeDefaults.imageProvider, providers]);

  const nodeActions = useMemo(
    () => ({
      providers,
      disabled: sessionLoading || runningAll,
      promptPolishEnabled,
      patchNode,
      patchNoteNode,
      generateNode: handleGenerate,
      syncNodeTask: handleSyncNodeTask,
      uploadNodeImage,
      saveAnnotation,
      getUpstreamDeliverables,
      previewMedia: (url: string, compareUrls?: string | string[] | null, options?: { taskId?: number; assetId?: number }) => {
        const list = Array.isArray(compareUrls)
          ? uniqueMediaPaths(compareUrls)
          : compareUrls
            ? [compareUrls.trim()].filter(Boolean)
            : [];
        setMediaPreview({ url, compareUrls: list, taskId: options?.taskId, assetId: options?.assetId });
      },
    }),
    [
      sessionLoading,
      runningAll,
      promptPolishEnabled,
      getUpstreamDeliverables,
      handleGenerate,
      handleSyncNodeTask,
      patchNode,
      patchNoteNode,
      providers,
      saveAnnotation,
      uploadNodeImage,
    ]
  );

  async function handleDeleteProject(projectId: number) {
    const wasActive = canvas.activeProject?.id === projectId;
    if (wasActive) {
      await canvas.deleteActiveProject();
    } else {
      await api.deleteCanvasProject(projectId);
      await canvas.reloadList();
    }
    const rows = await api.canvasProjects();
    if (rows[0]) await canvas.openProject(rows[0].id);
    else await canvas.createProject("我的工作流");
  }

  const refreshTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      setTemplates(await api.canvasTemplates());
      setBannerError("");
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "加载画布模板失败");
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  async function handleUseTemplate(templateId: number) {
    setApplyingTemplateId(templateId);
    setBannerOk("");
    try {
      const template = await api.getCanvasTemplate(templateId);
      const title = `${template.title}（副本）`;
      await canvas.createProject(title, template.graph_json);
      setBannerOk(`已从模板「${template.title}」创建私有项目`);
      setBannerError("");
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "使用模板失败");
    } finally {
      setApplyingTemplateId(null);
    }
  }

  async function handlePublishAsTemplate() {
    if (!canvas.activeProject) return;
    setBannerOk("");
    setBannerError("");
    setPublishDialogOpen(true);
  }

  const publishGraphJson = useMemo(
    () => serializeCanvasGraph(nodes, edges, viewport) as CanvasGraphJson,
    [edges, nodes, viewport]
  );

  if (isGuest) {
    return (
      <div className="qmdh-canvas-guest">
        <h2>无限画布需要登录</h2>
        <p>画布工作流保存在服务端，请先登录后使用。</p>
      </div>
    );
  }

  return (
    <CanvasNodeActionsProvider value={nodeActions}>
      <div className="qmdh-canvas-workspace">
        <header className="qmdh-canvas-toolbar">
          <div className="qmdh-canvas-toolbar-left">
            {isTemplateMode && onExit ? (
              <button type="button" className="qmdh-canvas-toolbar-back" onClick={onExit}>
                返回
              </button>
            ) : null}
            <strong className="qmdh-canvas-toolbar-title">{boardTitle}</strong>
            {isTemplateMode ? <span className="qmdh-canvas-toolbar-badge">模板编辑</span> : null}
          </div>
          <div className="qmdh-canvas-toolbar-center">
            <span className="qmdh-canvas-toolbar-hint">
              右键添加 · 框选 · 中键双击适应视图 · 缩略图拖拽移动 · 悬停/选中连线近节点处可断开 · Ctrl+Z 撤销 · Ctrl+C/V
              复制粘贴 · Ctrl+D 原地复制 · Ctrl+G 编组 · 选中后可「运行所选」
            </span>
          </div>
          <div className="qmdh-canvas-toolbar-right">
            {!isTemplateMode ? (
              <>
                <button
                  type="button"
                  className="qmdh-canvas-toolbar-run"
                  disabled={sessionLoading || runningAll || runnableCount === 0}
                  onClick={handleRunAll}
                  title="按连线顺序串行运行所有文生图/图生图/视频/放大节点；已有结果的节点会跳过"
                >
                  {runningAll ? "运行中…" : "全部运行"}
                </button>
                <button
                  type="button"
                  className="qmdh-canvas-toolbar-run is-secondary"
                  disabled={sessionLoading || runningAll || selectedRunnableCount === 0}
                  onClick={handleRunSelection}
                  title="只运行当前选中范围内的生成节点；选中编组会包含组内子节点"
                >
                  运行所选{selectedRunnableCount > 0 ? ` (${selectedRunnableCount})` : ""}
                </button>
              </>
            ) : null}
            <button
              type="button"
              disabled={!canDuplicate || sessionLoading || runningAll}
              onClick={onDuplicateSelection}
              title="复制所选节点（Ctrl+D）"
            >
              复制
            </button>
            {!isTemplateMode && canUseOpsViews ? (
              <button
                type="button"
                disabled={!canvas.activeProject || sessionLoading || publishDialogOpen || runningAll}
                onClick={() => void handlePublishAsTemplate()}
              >
                发布为模板
              </button>
            ) : null}
            <button type="button" disabled={!canGroup || sessionLoading || runningAll} onClick={onGroupSelection}>
              编组
            </button>
            <button type="button" disabled={!canUngroup || sessionLoading || runningAll} onClick={onUngroupSelection}>
              解散
            </button>
            <span>{providerHint}</span>
            <span>{sessionSaving ? "保存中…" : sessionLoading ? "加载中…" : "已同步"}</span>
          </div>
        </header>
        {bannerOk ? <p className="qmdh-canvas-banner-ok">{bannerOk}</p> : null}
        {sessionError || bannerError ? (
          <p className="qmdh-canvas-banner-error">{sessionError || bannerError}</p>
        ) : null}
        <div className="qmdh-canvas-main has-inspector">
          {isTemplateMode ? (
            <aside className="qmdh-canvas-project-library qmdh-canvas-template-editor-side">
              <header className="qmdh-canvas-project-library-head">
                <div>
                  <strong>模板工作流</strong>
                  <span>与设计师画布同一套编辑逻辑，保存后设计师可一键复制</span>
                </div>
              </header>
              <p className="qmdh-canvas-project-library-status">
                {sessionLoading ? "加载中…" : sessionSaving ? "保存中…" : "自动保存已开启"}
              </p>
              <div className="qmdh-canvas-template-editor-meta">
                <button
                  type="button"
                  disabled={sessionLoading || !templateEditor.template}
                  onClick={() => {
                    const next = window.prompt("模板标题", templateEditor.template?.title || "");
                    if (next && next.trim()) void templateEditor.renameTitle(next.trim());
                  }}
                >
                  重命名标题
                </button>
                {onExit ? (
                  <button type="button" onClick={onExit}>
                    返回模板库
                  </button>
                ) : null}
              </div>
            </aside>
          ) : (
            <CanvasProjectLibrary
              projects={canvas.projects}
              activeProjectId={canvas.activeProject?.id ?? null}
              loading={canvas.loading}
              saving={canvas.saving}
              disabled={canvas.loading}
              onSelect={(id) => void canvas.openProject(id)}
              onCreate={() => void canvas.createProject("未命名工作流")}
              onRename={(id, title) => {
                if (canvas.activeProject?.id === id) {
                  void canvas.renameProject(title);
                } else {
                  void api.updateCanvasProject(id, { title }).then(() => canvas.reloadList());
                }
              }}
              onDelete={(id) => void handleDeleteProject(id)}
              templates={templates}
              templatesLoading={templatesLoading}
              applyingTemplateId={applyingTemplateId}
              onRefreshTemplates={() => void refreshTemplates()}
              onUseTemplate={(id) => void handleUseTemplate(id)}
            />
          )}
          <CanvasBoard
            boardKey={boardKey}
            nodes={nodes}
            edges={edges}
            viewport={viewport}
            nodeDefaults={nodeDefaults}
            canGroup={canGroup}
            canUngroup={canUngroup}
            disabled={sessionLoading || runningAll}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onEdgesReplace={onEdgesReplace}
            onAddNode={onAddNode}
            onAddConnectedNode={onAddConnectedNode}
            onDropImages={(files, position) => void onDropImages(files, position)}
            onGroupSelection={onGroupSelection}
            onUngroupSelection={onUngroupSelection}
            onViewportChange={onViewportChange}
            onSelectedNodeIdsChange={setSelectedNodeIds}
          />
          <CanvasNodeInspector
            node={selectedNode}
            providers={providers}
            upstream={selectedUpstream}
            disabled={sessionLoading || runningAll}
            selectionCount={selectedNodeIds.length}
            selectedRunnableCount={selectedRunnableCount}
            onChange={patchNode}
            onGenerate={handleGenerate}
            onSyncTask={handleSyncNodeTask}
            onUploadImage={uploadNodeImage}
            onSaveAnnotation={saveAnnotation}
            onGroup={onGroupSelection}
            onUngroup={onUngroupSelection}
            onRunSelection={handleRunSelection}
            onClose={() => setSelectedNodeIds([])}
          />
        </div>
      </div>
      {mediaPreview ? (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={
            mediaPreview.compareUrls && mediaPreview.compareUrls.length > 0
              ? "画布媒体对比预览"
              : "画布媒体预览"
          }
          onClick={() => setMediaPreview(null)}
        >
          <div
            className={`media-lightbox-surface${
              mediaPreview.compareUrls && mediaPreview.compareUrls.length > 0 ? " is-compare" : ""
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="media-lightbox-head">
              <span className="media-lightbox-title">
                {mediaPreview.compareUrls && mediaPreview.compareUrls.length > 0
                  ? "生成图 · 原图对比"
                  : "预览"}
              </span>
              <button
                type="button"
                className="media-lightbox-close"
                aria-label="关闭"
                onClick={() => setMediaPreview(null)}
              >
                ×
              </button>
            </header>
            <div
              className={`media-lightbox-body${
                mediaPreview.compareUrls && mediaPreview.compareUrls.length > 0 ? " is-compare" : ""
              }`}
            >
              {/\.(mp4|webm|mov)(\?|$)/i.test(mediaPreview.url) ? (
                <video src={mediaPreview.url} controls autoPlay playsInline />
              ) : mediaPreview.compareUrls && mediaPreview.compareUrls.length > 0 ? (
                <MediaComparePanel leftSrc={mediaPreview.url} rightSrcs={mediaPreview.compareUrls} />
              ) : (
                <img src={mediaPreview.url} alt="" />
              )}
            </div>
            <footer className="media-lightbox-foot">
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  void downloadMediaUrl(
                    mediaPreview.url,
                    /\.(mp4|webm|mov)(\?|$)/i.test(mediaPreview.url)
                      ? "generated-video.mp4"
                      : "generated-image.png",
                    {
                      taskId: mediaPreview.taskId,
                      assetId: mediaPreview.assetId,
                    }
                  )
                }
              >
                {/\.(mp4|webm|mov)(\?|$)/i.test(mediaPreview.url) ? "下载视频" : "下载生成图"}
              </button>
              <button type="button" className="submit-button" onClick={() => setMediaPreview(null)}>
                关闭
              </button>
            </footer>
          </div>
        </div>
      ) : null}
      {!isTemplateMode && canUseOpsViews && canvas.activeProject ? (
        <PublishCanvasTemplateDialog
          open={publishDialogOpen}
          defaultTitle={canvas.activeProject.title || "未命名工作流"}
          graphJson={publishGraphJson}
          onClose={() => setPublishDialogOpen(false)}
          onCreated={(template) => {
            setBannerOk(`已发布模板「${template.title}」，正在打开模板画布…`);
            setBannerError("");
            navigate(`/admin/canvas-templates/${template.id}/edit`);
          }}
          onUpdated={(template) => {
            setBannerOk(`已覆盖更新模板「${template.title}」`);
            setBannerError("");
          }}
          onError={(message) => {
            setBannerError(message);
            setBannerOk("");
          }}
        />
      ) : null}
    </CanvasNodeActionsProvider>
  );
}
