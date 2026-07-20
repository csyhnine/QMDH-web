import { useCallback, useEffect, useMemo, useState } from "react";
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

import { api, type CanvasTemplateSummary, type Provider } from "../../api";
import { useAuth } from "../../context/AuthContext";
import {
  isRuntimeStudioProvider,
  isRuntimeUpscaleProvider,
  publicProviderDisplayName,
} from "../studio/modelAdminUtils";
import { prepareReferenceUploadFiles, uploadReferenceFiles } from "../studio/studioReferenceUtils";
import { exportAnnotatedDataUrl } from "./annotateDraw";
import CanvasBoard from "./CanvasBoard";
import CanvasNodeInspector from "./CanvasNodeInspector";
import CanvasProjectLibrary from "./CanvasProjectLibrary";
import { CanvasNodeActionsProvider } from "./canvasNodeContext";
import {
  collectUpstreamDeliverables,
  createUploadImageNode,
  groupSelectedNodes,
  serializeCanvasGraph,
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
import { useCanvasNodeGenerate } from "./useCanvasNodeGenerate";

type CanvasWorkspaceProps = {
  editTemplateId?: number;
  onExit?: () => void;
};

export default function CanvasWorkspace({ editTemplateId, onExit }: CanvasWorkspaceProps = {}) {
  const isTemplateMode = editTemplateId != null;
  const navigate = useNavigate();
  const { isGuest, canUseOpsViews } = useAuth();
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
  const [publishingTemplate, setPublishingTemplate] = useState(false);
  const [bannerOk, setBannerOk] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [bannerError, setBannerError] = useState("");

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
    if (isTemplateMode) {
      const graph = graphFromTemplate(templateEditor.template);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setViewport(graph.viewport);
      setSelectedNodeIds([]);
      return;
    }
    const graph = graphFromActiveProject(canvas.activeProject);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setViewport(graph.viewport);
    setSelectedNodeIds([]);
  }, [isTemplateMode, canvas.activeProject?.id, templateEditor.template?.id]);

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
      imageProvider:
        providers.find((provider) => isRuntimeStudioProvider(provider, "generate"))?.provider_name || "",
      videoProvider:
        providers.find((provider) => isRuntimeStudioProvider(provider, "video"))?.provider_name || "",
      upscaleProvider: providers.find((provider) => isRuntimeUpscaleProvider(provider))?.provider_name || "",
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

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasFlowNode>[]) => {
      setNodes((current) => {
        const next = applyNodeChanges(changes, current);
        persistGraph(next, edges, viewport);
        return next;
      });
    },
    [edges, persistGraph, viewport]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((current) => {
        const next = applyEdgeChanges(changes, current);
        persistGraph(nodes, next, viewport);
        return next;
      });
    },
    [nodes, persistGraph, viewport]
  );

  const onEdgesReplace = useCallback(
    (next: Edge[]) => {
      setEdges(next);
      persistGraph(nodes, next, viewport);
    },
    [nodes, persistGraph, viewport]
  );

  const onAddNode = useCallback(
    (node: CanvasFlowNode) => {
      setNodes((current) => {
        const next = current.concat(node);
        persistGraph(next, edges, viewport);
        return next;
      });
      setSelectedNodeIds([node.id]);
    },
    [edges, persistGraph, viewport]
  );

  const onAddConnectedNode = useCallback(
    (node: CanvasFlowNode, connection: { source: string; target: string }) => {
      setNodes((currentNodes) => {
        const nextNodes = currentNodes.concat(node);
        setEdges((currentEdges) => {
          const nextEdges = addEdge(
            {
              ...connection,
              id: `e-${connection.source}-${connection.target}-${Date.now()}`,
            },
            currentEdges
          );
          persistGraph(nextNodes, nextEdges, viewport);
          return nextEdges;
        });
        return nextNodes;
      });
      setSelectedNodeIds([node.id]);
    },
    [persistGraph, viewport]
  );

  const onViewportChange = useCallback(
    (next: Viewport) => {
      setViewport(next);
      persistGraph(nodes, edges, next);
    },
    [edges, nodes, persistGraph]
  );

  const patchNode = useCallback(
    (nodeId: string, patch: Partial<GenerateNodeData>) => {
      setNodes((current) => {
        const next = current.map((node) =>
          node.id === nodeId && isGenerateNode(node)
            ? { ...node, data: { ...node.data, ...patch } }
            : node
        );
        persistGraph(next, edges, viewport);
        return next;
      });
    },
    [edges, persistGraph, viewport]
  );

  const patchNoteNode = useCallback(
    (nodeId: string, patch: Partial<NoteNodeData>) => {
      setNodes((current) => {
        const next = current.map((node) =>
          node.id === nodeId && node.type === "note"
            ? { ...node, data: { ...node.data, ...patch } }
            : node
        );
        persistGraph(next, edges, viewport);
        return next;
      });
    },
    [edges, persistGraph, viewport]
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
    setNodes((current) => {
      const next = groupSelectedNodes(current, selectedNodeIds);
      if (!next) return current;
      persistGraph(next, edges, viewport);
      const group = next.find((node) => isGroupNode(node) && !current.some((item) => item.id === node.id));
      if (group) setSelectedNodeIds([group.id]);
      return next;
    });
  }, [edges, persistGraph, selectedNodeIds, viewport]);

  const onUngroupSelection = useCallback(() => {
    setNodes((current) => {
      const next = ungroupSelectedNodes(current, selectedNodeIds);
      if (!next) return current;
      persistGraph(next, edges, viewport);
      return next;
    });
  }, [edges, persistGraph, selectedNodeIds, viewport]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (sessionLoading) return;
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.key.toLowerCase() === "g" && event.shiftKey) {
        event.preventDefault();
        onUngroupSelection();
      } else if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        onGroupSelection();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sessionLoading, onGroupSelection, onUngroupSelection]);

  const uploadNodeImage = useCallback(
    async (nodeId: string, file: File) => {
      const { acceptedFiles, errors } = prepareReferenceUploadFiles([file], 0, 1);
      if (errors[0]) {
        patchNode(nodeId, { status: "failed", errorMessage: errors[0] });
        return;
      }
      const accepted = acceptedFiles[0];
      if (!accepted) return;
      patchNode(nodeId, { status: "submitting", errorMessage: undefined });
      try {
        const uploaded = await uploadReferenceFiles([accepted], api.uploadReferenceImage);
        const path = uploaded[0]?.storagePath;
        if (!path) throw new Error("上传失败");
        patchNode(nodeId, {
          status: "completed",
          referenceImages: [path],
          assetUrls: [path],
          previewImagePath: path,
          errorMessage: undefined,
          ...(uploaded[0]?.fileName ? { label: `上传 · ${uploaded[0].fileName}` } : {}),
        });
        setBannerError("");
      } catch (err) {
        patchNode(nodeId, {
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "上传失败",
        });
      }
    },
    [patchNode]
  );

  const saveAnnotation = useCallback(
    async (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node || node.data.nodeKind !== "annotate") return;
      const upstream = collectUpstreamDeliverables(nodeId, nodes, edges);
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
      patchNode(nodeId, { status: "submitting", errorMessage: undefined });
      try {
        const dataUrlResult = await exportAnnotatedDataUrl(baseUrl, node.data.annotationStrokes);
        const uploaded = await api.uploadReferenceImage({
          file_name: dataUrlResult.fileName,
          data_url: dataUrlResult.dataUrl,
        });
        patchNode(nodeId, {
          status: "completed",
          assetUrls: [uploaded.storage_path],
          previewImagePath: uploaded.storage_path,
          errorMessage: undefined,
        });
        setBannerError("");
      } catch (err) {
        patchNode(nodeId, {
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "保存标注失败",
        });
      }
    },
    [edges, nodes, patchNode]
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
        setNodes((current) => {
          const next = current.concat(created);
          persistGraph(next, edges, viewport);
          return next;
        });
        if (created[0]) setSelectedNodeIds([created[0].id]);
        setBannerError("");
      } catch (err) {
        setBannerError(err instanceof Error ? err.message : "图片上传失败");
      }
    },
    [edges, nodeDefaults, persistGraph, viewport]
  );

  const runGenerate = useCanvasNodeGenerate(providers, nodes, edges, patchNode);

  const handleGenerate = useCallback(
    (nodeId: string, data: GenerateNodeData) => {
      void runGenerate(nodeId, {
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
      disabled: sessionLoading,
      patchNode,
      patchNoteNode,
      generateNode: handleGenerate,
      uploadNodeImage,
      saveAnnotation,
      getUpstreamDeliverables,
    }),
    [
      sessionLoading,
      getUpstreamDeliverables,
      handleGenerate,
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
    const title =
      window.prompt("发布为模板的标题", canvas.activeProject.title)?.trim() ||
      canvas.activeProject.title;
    const category = window.prompt("分类（可留空）", "")?.trim() || "";
    setPublishingTemplate(true);
    setBannerOk("");
    try {
      const graph_json = serializeCanvasGraph(nodes, edges, viewport);
      const created = await api.createAdminCanvasTemplate({
        title,
        category,
        description: "",
        is_featured: false,
        graph_json,
        preview_image_path: "",
      });
      setBannerOk(`已发布模板「${title}」，正在打开模板画布…`);
      setBannerError("");
      navigate(`/admin/canvas-templates/${created.id}/edit`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "发布模板失败");
    } finally {
      setPublishingTemplate(false);
    }
  }

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
              右键添加节点 · 左键框选 · 中键平移 · Ctrl+G 编组 · Ctrl+Shift+G 解散 · 双击空白加备注
            </span>
          </div>
          <div className="qmdh-canvas-toolbar-right">
            {!isTemplateMode && canUseOpsViews ? (
              <button
                type="button"
                disabled={!canvas.activeProject || sessionLoading || publishingTemplate}
                onClick={() => void handlePublishAsTemplate()}
              >
                {publishingTemplate ? "发布中…" : "发布为模板"}
              </button>
            ) : null}
            <button type="button" disabled={!canGroup || sessionLoading} onClick={onGroupSelection}>
              编组
            </button>
            <button type="button" disabled={!canUngroup || sessionLoading} onClick={onUngroupSelection}>
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
            disabled={sessionLoading}
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
            disabled={sessionLoading}
            selectionCount={selectedNodeIds.length}
            onChange={patchNode}
            onGenerate={handleGenerate}
            onUploadImage={uploadNodeImage}
            onSaveAnnotation={saveAnnotation}
            onGroup={onGroupSelection}
            onUngroup={onUngroupSelection}
            onClose={() => setSelectedNodeIds([])}
          />
        </div>
      </div>
    </CanvasNodeActionsProvider>
  );
}
