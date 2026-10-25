import { inheritPromptDraft } from "../../lib/promptPolishOwnership";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { isCanvasNodeTaskBusy } from "./canvasTaskProgressUtils";
import { graphFromActiveProject, useCanvasProject } from "./useCanvasProject";
import { graphFromTemplate, useCanvasTemplateEditor } from "./useCanvasTemplateEditor";
import {
  resumeCanvasNodeTaskPolls,
  syncCanvasNodeTask,
  useCanvasNodeGenerate,
  isResumableCanvasNodeTask,
  type PatchNodeOptions,
  type CanvasGenerateOptions,
} from "./useCanvasNodeGenerate";
import { CanvasAsyncScope, canvasNodeInput, subscribeCanvasAsync, type CanvasAsyncRecord } from "./canvasAsyncScope";
import { cloneCanvasSnapshot, useCanvasHistory } from "./useCanvasHistory";
import PublishCanvasTemplateDialog, { createCanvasPublishSession, type CanvasPublishSession } from "./PublishCanvasTemplateDialog";

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
  const { isGuest, canUseOpsViews, currentUser } = useAuth();
  const promptPolishEnabled = usePromptPolishEnabled();
  const canvas = useCanvasProject(!isTemplateMode && currentUser != null, currentUser?.id);
  const templateEditor = useCanvasTemplateEditor(isTemplateMode ? editTemplateId : null, currentUser?.id);
  const [nodes, setNodes] = useState<CanvasFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [providers, setProviders] = useState<Provider[]>([]);
  const [projectCode, setProjectCode] = useState("QMDH-001");
  const [templates, setTemplates] = useState<CanvasTemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<number | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishSession,setPublishSession]=useState<CanvasPublishSession | null>(null);
  const publishSessionRef=useRef<CanvasPublishSession | null>(null),publishOpenRef=useRef(false);
  const copyRunRef=useRef<{ownerId:number;viewKey:string;stage:"get"|"creating";activated:boolean} | null>(null);
  const copyNavigationRef=useRef({ownerId:currentUser?.id,viewKey:canvas.viewKey,mounted:false});
  useLayoutEffect(()=>{
    copyNavigationRef.current={ownerId:currentUser?.id,viewKey:canvas.viewKey,mounted:true};
    return()=>{copyNavigationRef.current.mounted=false;};
  },[currentUser?.id,canvas.viewKey]);
  useLayoutEffect(()=>{publishOpenRef.current=publishDialogOpen;},[publishDialogOpen]);
  useLayoutEffect(()=>{
    if(publishSessionRef.current && publishSessionRef.current.source.ownerId!==currentUser?.id){
      publishSessionRef.current.phase="abandoned";publishSessionRef.current=null;setPublishSession(null);setPublishDialogOpen(false);
    }
    copyRunRef.current=null;setApplyingTemplateId(null);
  },[currentUser?.id]);
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
  const workflowRunRef = useRef<object | null>(null);
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
    ? templateEditor.viewKey
    : canvas.activeProject?.id ?? "empty";
  const boardTitle = isTemplateMode
    ? templateEditor.template?.title || "模板工作流"
    : canvas.activeProject?.title || "无限画布";

  const asyncBoard = isTemplateMode ? `template:${editTemplateId}` : `project:${canvas.activeProject?.id ?? "none"}`;
  const asyncScope = useMemo(() => new CanvasAsyncScope(currentUser?.id, asyncBoard,
    !sessionLoading && currentUser != null && (isTemplateMode ? !templateEditor.blocked : (canvas.activeProject != null && canvas.activeOwnerId === currentUser.id)), () => nodesRef.current, () => edgesRef.current),
    [currentUser?.id, asyncBoard, boardKey, sessionLoading, canvas.activeOwnerId, canvas.viewKey, templateEditor.blocked]);
  const [, refreshAsync] = useState(0);
  useLayoutEffect(() => { asyncScope.activate(); return () => asyncScope.dispose(); }, [asyncScope]);
  useLayoutEffect(() => { workflowRunRef.current=null;runningAllRef.current=false;setRunningAll(false); },[asyncScope]);
  useEffect(() => subscribeCanvasAsync(currentUser?.id, asyncBoard, () => refreshAsync(n => n + 1)), [currentUser?.id, asyncBoard]);

  useLayoutEffect(() => {
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
  }, [isTemplateMode, canvas.activeProject?.id, isTemplateMode ? templateEditor.viewKey : canvas.viewKey, history.clear]);

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
      const allowed=()=>options?.isCurrent?.() ?? true;
      const matches=(items:CanvasFlowNode[])=>!options?.expectedData || items.some(node=>node.id===nodeId && isGenerateNode(node) && node.data===options.expectedData);
      if(!allowed() || !matches(nodesRef.current))return;
      const recordChange=()=>{
        if(options?.recordHistory!==false){
          if(isDebouncedGeneratePatch(patch))armContentHistory();
          else if(!isStatusOnlyGeneratePatch(patch)){flushContentHistorySession();history.push(nodesRef.current,edgesRef.current);}
        }
      };
      const apply=(items:CanvasFlowNode[])=>items.map(node=>node.id===nodeId && isGenerateNode(node)
        ? {...node,data:inheritPromptDraft(node.data,{...node.data,...patch},Boolean(options?.expectedData))} : node);
      if(options?.expectedData){
        setNodes(current=>{
          if(!allowed() || !matches(current))return current;
          recordChange();const next=apply(current);nodesRef.current=next;
          persistGraph(next,edgesRef.current,viewportRef.current);return next;
        });return;
      }
      recordChange();const next=apply(nodesRef.current);nodesRef.current=next;
      setNodes(current=>allowed() ? next : current);
      persistGraph(next,edgesRef.current,viewportRef.current);
    },
    [armContentHistory, flushContentHistorySession, history, persistGraph]
  );

  const patchNodeSilent = useCallback((nodeId: string, patch: Partial<GenerateNodeData>, options?: PatchNodeOptions) => {
    const current = () => asyncScope.active && (options?.isCurrent?.() ?? true);
    if(current()) patchNode(nodeId, patch, {recordHistory:false,isCurrent:current});
  }, [asyncScope, patchNode]);

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

  // Each committed view owns its observers; returning attaches to the original task ids.
  useEffect(() => {
    if (sessionLoading) return;
    resumeCanvasNodeTaskPolls(nodesRef.current, patchNodeSilent, asyncScope);
  }, [boardKey, sessionLoading, pendingTaskFingerprint, patchNodeSilent, asyncScope]);

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

  const nodeAsyncInput = useCallback((nodeId: string) => {
    const node=nodesRef.current.find(row=>row.id===nodeId);
    const upstream=node && isGenerateNode(node) && node.data.nodeKind === "annotate"
      ? collectUpstreamDeliverables(nodeId,nodesRef.current,edgesRef.current).images[0] || null : null;
    return JSON.stringify([canvasNodeInput(node),upstream]);
  }, []);
  const uploadNodeImage = useCallback(async (nodeId: string, file: File) => {
    const operation=asyncScope.begin("upload",nodeId,()=>nodeAsyncInput(nodeId)); if(!operation)return;
    const guard=asyncScope.guard(operation);
    const {acceptedFiles,errors}=prepareReferenceUploadFiles([file],0,1);
    if(errors[0] || !acceptedFiles[0]) {
      const message=errors[0] || "没有可上传的图片";
      asyncScope.complete(operation,{error:message});
      if(asyncScope.current(operation)) { patchNode(nodeId,{status:"failed",errorMessage:message},{isCurrent:guard}); asyncScope.finish(operation); }
      return;
    }
    flushContentHistorySession();history.push(nodesRef.current,edgesRef.current);
    patchNode(nodeId,{status:"submitting",errorMessage:undefined},{recordHistory:false,isCurrent:guard});
    try {
      const uploaded=await uploadReferenceFiles([acceptedFiles[0]],api.uploadReferenceImage),path=uploaded[0]?.storagePath;
      if(!path)throw new Error("上传失败");
      const patch: Partial<GenerateNodeData>={status:"completed",referenceImages:[path],assetUrls:[path],previewImagePath:path,errorMessage:undefined,
        ...(uploaded[0]?.fileName ? {label:`上传 · ${uploaded[0].fileName}`} : {})};
      asyncScope.complete(operation,{patch});
      if(!asyncScope.current(operation))return;
      patchNode(nodeId,patch,{recordHistory:false,isCurrent:guard});asyncScope.finish(operation);setBannerError("");
    } catch(err) {
      const message=err instanceof Error ? err.message : "上传失败";asyncScope.complete(operation,{error:message});
      if(asyncScope.current(operation)) { patchNode(nodeId,{status:"failed",errorMessage:message},{recordHistory:false,isCurrent:guard});asyncScope.finish(operation); }
    }
  },[asyncScope,nodeAsyncInput,flushContentHistorySession,history,patchNode]);

  const saveAnnotation = useCallback(async (nodeId: string) => {
    if(!asyncScope.active)return;
    const node=nodesRef.current.find(item=>item.id===nodeId);
    if(!node || !isGenerateNode(node) || node.data.nodeKind!=="annotate")return;
    const upstream=collectUpstreamDeliverables(nodeId,nodesRef.current,edgesRef.current);
    const baseUrl=upstream.images[0] || node.data.referenceImages[0] || node.data.previewImagePath || node.data.assetUrls[0] || "";
    if(!baseUrl || node.data.annotationStrokes.length===0) {
      patchNode(nodeId,{status:"failed",errorMessage:!baseUrl ? "请先连接上游图片作为标注底图。" : "请先在图上添加标注。"},{isCurrent:()=>asyncScope.active});return;
    }
    const operation=asyncScope.begin("annotate",nodeId,()=>nodeAsyncInput(nodeId));if(!operation)return;
    const guard=asyncScope.guard(operation),strokes=JSON.parse(JSON.stringify(node.data.annotationStrokes));
    flushContentHistorySession();history.push(nodesRef.current,edgesRef.current);
    patchNode(nodeId,{status:"submitting",errorMessage:undefined},{recordHistory:false,isCurrent:guard});
    try {
      const output=await exportAnnotatedDataUrl(baseUrl,strokes);
      // Preserve an export already in progress, but never start another upload after leaving its source view.
      if(!asyncScope.current(operation)) { asyncScope.complete(operation,{error:"标注导出后来源已变化，未上传；原笔画仍保留，请回原节点核对。"});return; }
      const uploaded=await api.uploadReferenceImage({file_name:output.fileName,data_url:output.dataUrl});
      const patch: Partial<GenerateNodeData>={status:"completed",assetUrls:[uploaded.storage_path],previewImagePath:uploaded.storage_path,errorMessage:undefined};
      asyncScope.complete(operation,{patch});if(!asyncScope.current(operation))return;
      patchNode(nodeId,patch,{recordHistory:false,isCurrent:guard});asyncScope.finish(operation);setBannerError("");
    } catch(err) {
      const message=err instanceof Error ? err.message : "保存标注失败";asyncScope.complete(operation,{error:message});
      if(asyncScope.current(operation)) { patchNode(nodeId,{status:"failed",errorMessage:message},{recordHistory:false,isCurrent:guard});asyncScope.finish(operation); }
    }
  },[asyncScope,nodeAsyncInput,flushContentHistorySession,history,patchNode]);

  const onDropImages = useCallback(async (files: File[], position: {x:number;y:number}) => {
    if(!asyncScope.active)return;
    const {acceptedFiles,errors}=prepareReferenceUploadFiles(files,0,8);
    for(const message of errors)setBannerError(message);
    if(!acceptedFiles.length)return;
    const operation=asyncScope.begin("drop");if(!operation)return;
    try {
      const uploaded=await uploadReferenceFiles(acceptedFiles,api.uploadReferenceImage);
      const created=uploaded.map((item,index)=>createUploadImageNode({x:position.x+index*36,y:position.y+index*36},nodeDefaults,item.storagePath,item.fileName));
      asyncScope.complete(operation,{nodes:created});if(!asyncScope.current(operation))return;
      applyGraph(nodesRef.current.concat(created),edgesRef.current);if(created[0])setSelectedNodeIds([created[0].id]);
      asyncScope.finish(operation);setBannerError("");
    } catch(err) {
      const message=err instanceof Error ? err.message : "图片上传失败";asyncScope.complete(operation,{error:message});
      if(asyncScope.current(operation)) { setBannerError(message);asyncScope.finish(operation); }
    }
  },[asyncScope,applyGraph,nodeDefaults]);

  const recoverAsyncResult = useCallback((record: CanvasAsyncRecord) => {
    if(!asyncScope.active || record.ownerId!==currentUser?.id || record.board!==asyncBoard || record.phase!=="ready")return;
    if(record.kind==="drop" && record.nodes) {
      const existing=new Set(nodesRef.current.map(node=>node.id)),add=record.nodes.filter(node=>!existing.has(node.id));
      applyGraph(nodesRef.current.concat(add),edgesRef.current);
    } else if(record.nodeId && record.patch) {
      const node=nodesRef.current.find(node=>node.id===record.nodeId);
      const input=record.kind==="task" && node && isGenerateNode(node) ? JSON.stringify([node.data.nodeKind,node.data.taskId ?? null]) : nodeAsyncInput(record.nodeId);
      if(!node || !isGenerateNode(node) || node.data.nodeKind!==record.nodeKind || input!==record.input) {
        setBannerError("原节点或输入已变化，未覆盖当前内容；恢复记录中的路径和任务号已保留，请先核对。");return;
      }
      const guard=()=>asyncScope.active;
      patchNode(record.nodeId,{...record.patch,errorMessage:record.patch.errorMessage},{isCurrent:guard});
    } else { setBannerError("恢复记录内容不完整，已保留供核对。");return; }
    asyncScope.discard(record);setBannerError("");
  },[asyncScope,asyncBoard,currentUser?.id,applyGraph,nodeAsyncInput,patchNode]);
  const discardAsyncResult = useCallback((record: CanvasAsyncRecord) => {
    if(asyncScope.active && record.ownerId===currentUser?.id && record.board===asyncBoard &&
      window.confirm("只放弃这条本地恢复记录？不会取消服务器任务或删除已上传图片；在途结果仍可能稍后返回。"))asyncScope.discard(record);
  },[asyncScope,asyncBoard,currentUser?.id]);

  const runGenerate = useCanvasNodeGenerate(providers, nodes, edges, patchNodeSilent, asyncScope);

  const handleGenerate = useCallback(
    async (nodeId: string, data: GenerateNodeData, options?: CanvasGenerateOptions) => {
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
      }, options);
    },
    [nodeDefaults, projectCode, runGenerate]
  );

  const handleSyncNodeTask = useCallback(
    (nodeId: string, data: GenerateNodeData) => {
      void syncCanvasNodeTask(nodeId, data, patchNodeSilent, asyncScope).catch(() => undefined);
    },
    [patchNodeSilent, asyncScope]
  );

  const runnableCount = useMemo(
    () => nodes.filter(isRunnableCanvasNode).length,
    [nodes]
  );

  const generateRunStats = useMemo(() => {
    let busy = 0;
    let completed = 0;
    let failed = 0;
    for (const node of nodes) {
      if (!isGenerateNode(node)) continue;
      const status = node.data.status;
      if (isCanvasNodeTaskBusy(status)) busy += 1;
      else if (status === "completed") completed += 1;
      else if (status === "failed") failed += 1;
    }
    return { busy, completed, failed };
  }, [nodes]);

  const selectedRunnableCount = useMemo(
    () => listRunnableNodeIdsForSelection(nodes, edges, selectedNodeIds).order.length,
    [edges, nodes, selectedNodeIds]
  );

  const runWorkflow = useCallback(
    async (mode: "all" | "selection") => {
      if (!asyncScope.active || sessionLoading || runningAllRef.current || isTemplateMode) return;

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

      const token={};workflowRunRef.current=token;
      const current=()=>asyncScope.active && workflowRunRef.current===token;
      runningAllRef.current = true;
      setRunningAll(true);
      setBannerError("");
      setBannerOk(`${label} 0/${order.length}`);

      try {
        let finished = 0;
        for (const nodeId of order) {
          if(!current())return;
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
          if(!current())return;

          const after = nodesRef.current.find((node) => node.id === nodeId);
          if (after && isGenerateNode(after) && after.data.status === "failed") {
            setBannerError(
              `节点「${after.data.label || nodeId}」失败：${after.data.errorMessage || "请检查配置"}，已停止后续节点`
            );
            setBannerOk("");
            return;
          }
          if(!after || !isGenerateNode(after) || after.data.status!=="completed" || !after.data.assetUrls.some(Boolean)) {
            setBannerError("上游结果尚未确认或没有可用产物，已停止后续节点；请核对原任务后继续。");setBannerOk("");return;
          }
          finished += 1;
          setBannerOk(`${label} ${finished}/${order.length}`);
        }
        setBannerOk(`${label}完成：${finished}/${order.length}`);
      } finally {
        if(workflowRunRef.current===token) {
          workflowRunRef.current=null;runningAllRef.current=false;
          if(asyncScope.active)setRunningAll(false);
        }
      }
    },
    [edges, handleGenerate, isTemplateMode, selectedNodeIds, sessionLoading, asyncScope]
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
      promptScopeKey:asyncScope,
      isPromptScopeCurrent:()=>asyncScope.active && (isTemplateMode || canvas.isCurrentView()),
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
      asyncScope,
      isTemplateMode,
      canvas.isCurrentView,
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

  function cancelCopyIntent() { copyRunRef.current=null;setApplyingTemplateId(null); }
  async function handleOpenProject(projectId:number) { cancelCopyIntent();await canvas.openProject(projectId); }
  async function handleCreateProject() { cancelCopyIntent();await canvas.createProject("未命名工作流"); }
  async function handleUseTemplate(templateId:number) {
    const navigation=copyNavigationRef.current;
    if(!navigation.mounted || navigation.ownerId==null)return;
    const operation={ownerId:navigation.ownerId,viewKey:navigation.viewKey,stage:"get" as "get"|"creating",activated:false};
    copyRunRef.current=operation;setApplyingTemplateId(templateId);setBannerOk("");
    const current=()=>copyNavigationRef.current.mounted && copyNavigationRef.current.ownerId===operation.ownerId && copyRunRef.current===operation &&
      (operation.stage!=="get" || copyNavigationRef.current.viewKey===operation.viewKey);
    try {
      const template=await api.getCanvasTemplate(templateId);if(!current())return;
      const title=`${template.title}（副本）`,graph=JSON.parse(JSON.stringify(template.graph_json)) as CanvasGraphJson;
      operation.stage="creating";
      await canvas.createProject(title,graph,{isCurrent:current,onActivated:()=>{
        if(!current())return;operation.activated=true;
        setBannerOk(`已从模板「${template.title}」创建私有项目`);setBannerError("");
      }});
    } catch(error) {if(current() && !operation.activated)setBannerError(error instanceof Error ? error.message : "使用模板失败");}
    finally {if(copyRunRef.current===operation){copyRunRef.current=null;if(copyNavigationRef.current.mounted && copyNavigationRef.current.ownerId===operation.ownerId)setApplyingTemplateId(null);}}
  }
  async function handlePublishAsTemplate() {
    if(!canvas.activeProject || currentUser?.id==null || canvas.activeOwnerId!==currentUser.id)return;
    cancelCopyIntent();
    const retained=publishSessionRef.current;
    if(retained && retained.source.ownerId===currentUser.id && !["succeeded","abandoned"].includes(retained.phase)){
      setPublishDialogOpen(true);return;
    }
    const session=createCanvasPublishSession(currentUser.id,canvas.activeProject.id,canvas.viewKey,canvas.activeProject.title || "未命名工作流",
      serializeCanvasGraph(nodesRef.current,edgesRef.current,viewportRef.current) as CanvasGraphJson);
    publishSessionRef.current=session;setPublishSession(session);setBannerOk("");setBannerError("");setPublishDialogOpen(true);
  }

  const asyncRecoveries = asyncScope.recoveries();
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
              <button type="button" className="qmdh-canvas-toolbar-back" disabled={templateEditor.leaving} onClick={() => void templateEditor.leave(onExit)}>
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
            {!isTemplateMode && (generateRunStats.busy > 0 || runningAll) ? (
              <span className="qmdh-canvas-run-stats" title="当前画布生成节点运行汇总">
                运行中 {generateRunStats.busy} · 已完成 {generateRunStats.completed} · 失败{" "}
                {generateRunStats.failed}
              </span>
            ) : null}
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
            <span>{isTemplateMode ? templateEditor.statusLabel : sessionSaving ? "保存中…" : sessionLoading ? "加载中…" : "已同步"}</span>
          </div>
        </header>
        {bannerOk ? <p className="qmdh-canvas-banner-ok">{bannerOk}</p> : null}
        {sessionError || bannerError ? (
          <p className="qmdh-canvas-banner-error">{sessionError || bannerError}</p>
        ) : null}
        {asyncScope.backupError ? <p className="qmdh-canvas-banner-error" role="status">{asyncScope.backupError}</p> : null}
        {asyncRecoveries.length ? <section className="qmdh-canvas-template-recovery" aria-label="画布异步结果恢复">
          {asyncRecoveries.map(record=><div key={record.id}>
            <p>{record.kind === "task" ? "生成任务" : record.kind === "drop" ? "拖放图片" : record.kind === "annotate" ? "标注图片" : "节点上传"} · {record.nodeId || "原画布"} · {record.phase === "ready" ? "结果待核对恢复" : record.phase === "failed" ? record.error : "结果尚未返回，不会自动重发"}</p>
            {record.patch?.taskId ? <p>已受理任务 #{record.patch.taskId}</p> : null}
            {record.patch?.assetUrls?.length ? <p>{record.patch.assetUrls.join(" · ")}</p> : null}
            {record.nodes?.map(node=>isGenerateNode(node) ? <p key={node.id}>{node.data.assetUrls.join(" · ")}</p> : null)}
            <button type="button" disabled={record.phase!=="ready" || sessionLoading} onClick={()=>recoverAsyncResult(record)}>核对后恢复到原画布</button>
            <button type="button" onClick={()=>discardAsyncResult(record)}>放弃这条本地恢复记录</button>
          </div>)}
        </section> : null}
        {isTemplateMode ? <section className="qmdh-canvas-template-recovery" aria-label="模板保存与恢复">
          {templateEditor.backupError && templateEditor.backupError !== sessionError ? <p role="status">{templateEditor.backupError}</p> : null}
          {templateEditor.recoveryDrafts.map(draft => <div key={draft.draftId}>
            <p>本地草稿 · {draft.title || "图内容变更"} · {new Date(draft.updatedAt).toLocaleString("zh-CN")} · 版本 {draft.revision}。恢复不会自动提交。</p>
            <button type="button" disabled={sessionLoading || !templateEditor.template} onClick={() => templateEditor.restoreDraft(draft.draftId)}>恢复这份本地草稿</button>
            <button type="button" onClick={() => templateEditor.discardRecovery(draft.draftId)}>放弃这份本地备份</button>
          </div>)}
          {templateEditor.hasUnsavedChanges && !templateEditor.blocked ? <>
            {["dirty", "rejected"].includes(templateEditor.phase) ? <button type="button" disabled={templateEditor.saving || sessionLoading} onClick={() => void templateEditor.flushSave().catch(() => undefined)}>保存当前模板草稿</button> : <>
              <p>当前草稿未提交；核对快照不能证明原请求未受理。请确认原请求已结束，再明确保存。</p>
              <button type="button" disabled={templateEditor.saving || sessionLoading} onClick={() => void templateEditor.inspectServer()}>只读核对服务器模板</button>
              {templateEditor.inspection ? <>
                <p>服务器标题：{templateEditor.inspection.title}；节点 {templateEditor.inspection.graph_json.nodes?.length ?? 0}；更新时间 {templateEditor.inspection.updated_at}。本地内容仍保留。</p>
                <button type="button" disabled={templateEditor.saving} onClick={() => void templateEditor.confirmInspectedSave().catch(() => undefined)}>我已核对并确认原请求结束，保存当前草稿</button>
              </> : null}
            </>}
            {onExit ? <button type="button" onClick={() => templateEditor.discardAndLeave(onExit)}>放弃本地草稿并返回</button> : null}
          </> : null}
          {templateEditor.hasUnsavedChanges && onExit ? <button type="button" onClick={() => templateEditor.leaveWithDraft(onExit)}>保留本地草稿并离开</button> : null}
        </section> : null}
        {!isTemplateMode && canvas.hasUnsavedChanges && canvas.error ? (
          <button type="button" disabled={canvas.loading || canvas.saving} onClick={() => void canvas.retrySave().catch(() => undefined)}>
            重试保存
          </button>
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
                {templateEditor.statusLabel}
              </p>
              <div className="qmdh-canvas-template-editor-meta">
                <button
                  type="button"
                  disabled={sessionLoading || templateEditor.blocked || !templateEditor.template}
                  onClick={() => {
                    const next = window.prompt("模板标题", templateEditor.template?.title || "");
                    if (next && next.trim()) void templateEditor.renameTitle(next.trim()).catch(() => undefined);
                  }}
                >
                  重命名标题
                </button>
                {onExit ? (
                  <button type="button" disabled={templateEditor.leaving} onClick={() => void templateEditor.leave(onExit)}>
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
              onSelect={(id) => void handleOpenProject(id).catch(() => undefined)}
              onCreate={() => void handleCreateProject().catch(() => undefined)}
              onRename={(id, title) => {
                if (canvas.activeProject?.id === id) {
                  void canvas.renameProject(title);
                } else {
                  void api.updateCanvasProject(id, { title }).then(() => canvas.reloadList());
                }
              }}
              onDelete={(id) => { if(canvas.activeProject?.id===id)cancelCopyIntent();void handleDeleteProject(id).catch((err) => setBannerError(err instanceof Error ? err.message : "删除画布失败")); }}
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
            disabled={sessionLoading || (isTemplateMode && templateEditor.blocked) || runningAll}
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
            disabled={sessionLoading || (isTemplateMode && templateEditor.blocked) || runningAll}
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
                  void downloadMediaUrl(mediaPreview.url, undefined, {
                    taskId: mediaPreview.taskId,
                    assetId: mediaPreview.assetId,
                    mediaKind: /\.(mp4|webm|mov)(\?|$)/i.test(mediaPreview.url) ? "video" : "image",
                  })
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
      {!isTemplateMode && canUseOpsViews && publishSession && publishSession.source.ownerId===currentUser?.id ? (
        <PublishCanvasTemplateDialog
          key={publishSession.id}
          open={publishDialogOpen}
          session={publishSession}
          onClose={()=>{if(publishSessionRef.current===publishSession)setPublishDialogOpen(false);}}
          onAbandon={()=>{if(publishSessionRef.current===publishSession){publishSessionRef.current=null;setPublishSession(null);setPublishDialogOpen(false);}}}
          onCreated={template=>{
            const navigation=copyNavigationRef.current;
            if(publishSessionRef.current!==publishSession || !publishOpenRef.current || !navigation.mounted || navigation.ownerId!==publishSession.source.ownerId || navigation.viewKey!==publishSession.source.viewKey)return;
            setBannerOk(`已发布模板「${template.title}」，正在打开模板画布…`);setBannerError("");navigate(`/admin/canvas-templates/${template.id}/edit`);
          }}
          onUpdated={template=>{
            const navigation=copyNavigationRef.current;
            if(publishSessionRef.current!==publishSession || !publishOpenRef.current || !navigation.mounted || navigation.ownerId!==publishSession.source.ownerId || navigation.viewKey!==publishSession.source.viewKey)return;
            setBannerOk(`已覆盖更新模板「${template.title}」`);setBannerError("");
          }}
          onError={message=>{
            const navigation=copyNavigationRef.current;
            if(publishSessionRef.current!==publishSession || !publishOpenRef.current || !navigation.mounted || navigation.ownerId!==publishSession.source.ownerId || navigation.viewKey!==publishSession.source.viewKey)return;
            setBannerError(message);setBannerOk("");
          }}
        />
      ) : null}
    </CanvasNodeActionsProvider>
  );
}
