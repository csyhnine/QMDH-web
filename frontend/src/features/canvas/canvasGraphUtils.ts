import type { Edge, Node, Viewport } from "@xyflow/react";

import { defaultStudioForm, normalizeStudioResolution } from "../studio/studioConstants";
import type { UpscaleNoise, UpscaleScale, UpscaleStyle } from "../studio/studioUpscaleOptions";
import { nanoid } from "./canvasId";
import { clampAnnotationOpacity } from "./annotateTypes";
import type {
  CanvasFlowNode,
  CanvasGenerateNode,
  CanvasGraphState,
  CanvasGroupNode,
  CanvasNodeKind,
  CanvasNodeStatus,
  CanvasNoteNode,
  GenerateNodeData,
  GroupNodeData,
  NoteNodeData,
} from "./canvasTypes";
import {
  NODE_KIND_LABEL,
  creationModeForNodeKind,
  defaultAnnotationFields,
  defaultUpscaleFields,
  emptyCanvasGraph,
  isGenerateNode,
  isGroupNode,
  isNoteNode,
} from "./canvasTypes";

const KNOWN_KINDS: CanvasNodeKind[] = [
  "text2img",
  "img2img",
  "video",
  "upload",
  "upscale",
  "annotate",
];

const KNOWN_STATUSES: CanvasNodeStatus[] = [
  "idle",
  "submitting",
  "pending",
  "running",
  "awaiting_result",
  "completed",
  "failed",
];

function normalizeNodeStatus(
  raw: unknown,
  options: {
    nodeKind: CanvasNodeKind;
    assetUrls: string[];
    referenceImages: string[];
  }
): CanvasNodeStatus {
  if (typeof raw === "string" && (KNOWN_STATUSES as string[]).includes(raw)) {
    return raw as CanvasNodeStatus;
  }
  if (options.nodeKind === "upload" && (options.assetUrls.length > 0 || options.referenceImages.length > 0)) {
    return "completed";
  }
  return "idle";
}

export function parseCanvasGraph(raw: unknown): CanvasGraphState {
  if (!raw || typeof raw !== "object") return emptyCanvasGraph();
  const graph = raw as Record<string, unknown>;
  const nodes = Array.isArray(graph.nodes) ? (graph.nodes as Node[]) : [];
  const edges = Array.isArray(graph.edges) ? (graph.edges as Edge[]) : [];
  const viewport =
    graph.viewport && typeof graph.viewport === "object"
      ? (graph.viewport as Viewport)
      : { x: 0, y: 0, zoom: 1 };
  return {
    version: Number(graph.version) || 1,
    nodes: nodes.map(normalizeStoredNode),
    edges,
    viewport: {
      x: Number(viewport.x) || 0,
      y: Number(viewport.y) || 0,
      zoom: Number(viewport.zoom) || 1,
    },
  };
}

function inferNodeKind(data: Partial<GenerateNodeData>): CanvasNodeKind {
  if (data.nodeKind && KNOWN_KINDS.includes(data.nodeKind)) {
    return data.nodeKind;
  }
  if (data.creationMode === "video") return "video";
  if (data.creationMode === "edit") return "img2img";
  return "text2img";
}

function asUpscaleStyle(value: unknown): UpscaleStyle {
  return value === "art" ? "art" : "photo";
}

function asUpscaleNoise(value: unknown): UpscaleNoise {
  if (value === "-1" || value === "1" || value === "2" || value === "3") return value;
  return "0";
}

function asUpscaleScale(value: unknown): UpscaleScale {
  if (value === "1" || value === "3" || value === "4") return value;
  return "2";
}

function normalizeStoredNode(node: Node): CanvasFlowNode {
  if (node.type === "group" || (node.data as { kind?: string } | undefined)?.kind === "group") {
    const data = (node.data || {}) as Partial<GroupNodeData>;
    return {
      ...node,
      type: "group",
      style: {
        width: Number((node.style as { width?: number } | undefined)?.width) || 320,
        height: Number((node.style as { height?: number } | undefined)?.height) || 220,
        ...(node.style || {}),
      },
      data: {
        kind: "group",
        label: String(data.label || "编组"),
      },
    } as CanvasGroupNode;
  }

  if (node.type === "note" || (node.data as { kind?: string } | undefined)?.kind === "note") {
    const data = (node.data || {}) as Partial<NoteNodeData>;
    return {
      ...node,
      type: "note",
      data: {
        kind: "note",
        text: String(data.text ?? "备注"),
      },
    } as CanvasNoteNode;
  }

  const data = (node.data || {}) as Partial<GenerateNodeData>;
  const nodeKind = inferNodeKind(data);
  const upscaleDefaults = defaultUpscaleFields();
  const annotationDefaults = defaultAnnotationFields();
  const referenceImages = Array.isArray(data.referenceImages) ? data.referenceImages.map(String) : [];
  const assetUrls = Array.isArray(data.assetUrls) ? data.assetUrls.map(String) : [];
  return {
    ...node,
    type: "generate",
    data: {
      kind: "generate",
      nodeKind,
      label: String(data.label || NODE_KIND_LABEL[nodeKind]),
      templateId: data.templateId ?? null,
      prompt: String(data.prompt || ""),
      style: String(data.style || defaultStudioForm.style),
      aspectRatio: String(data.aspectRatio || defaultStudioForm.aspectRatio),
      resolution: normalizeStudioResolution(data.resolution),
      projectCode: String(data.projectCode || defaultStudioForm.projectCode),
      requestedProvider: String(data.requestedProvider || ""),
      classification: String(data.classification || defaultStudioForm.classification),
      creationMode: creationModeForNodeKind(nodeKind),
      referenceImages,
      previewImagePath: data.previewImagePath ? String(data.previewImagePath) : undefined,
      taskId: typeof data.taskId === "number" ? data.taskId : null,
      status: normalizeNodeStatus(data.status, { nodeKind, assetUrls, referenceImages }),
      assetUrls,
      errorMessage: data.errorMessage ? String(data.errorMessage) : undefined,
      upscaleStyle: asUpscaleStyle(data.upscaleStyle ?? upscaleDefaults.upscaleStyle),
      upscaleNoise: asUpscaleNoise(data.upscaleNoise ?? upscaleDefaults.upscaleNoise),
      upscaleScale: asUpscaleScale(data.upscaleScale ?? upscaleDefaults.upscaleScale),
      annotationStrokes: Array.isArray(data.annotationStrokes)
        ? (data.annotationStrokes as GenerateNodeData["annotationStrokes"])
        : annotationDefaults.annotationStrokes,
      annotationTool: data.annotationTool || annotationDefaults.annotationTool,
      annotationColor: String(data.annotationColor || annotationDefaults.annotationColor),
      annotationWidth: Number(data.annotationWidth) || annotationDefaults.annotationWidth,
      annotationOpacity: clampAnnotationOpacity(
        data.annotationOpacity,
        annotationDefaults.annotationOpacity
      ),
    },
  };
}

export type CanvasNodeDefaults = {
  projectCode: string;
  imageProvider: string;
  videoProvider: string;
  upscaleProvider: string;
};

function providerForKind(nodeKind: CanvasNodeKind, defaults: CanvasNodeDefaults): string {
  if (nodeKind === "video") return defaults.videoProvider;
  if (nodeKind === "upscale") return defaults.upscaleProvider;
  if (nodeKind === "upload" || nodeKind === "annotate") return "";
  return defaults.imageProvider;
}

export function createBlankGenerateNode(
  nodeKind: CanvasNodeKind,
  position: { x: number; y: number },
  defaults: CanvasNodeDefaults
): CanvasGenerateNode {
  return {
    id: `gen-${nanoid()}`,
    type: "generate",
    position,
    data: {
      kind: "generate",
      nodeKind,
      label: NODE_KIND_LABEL[nodeKind],
      templateId: null,
      prompt: "",
      style: defaultStudioForm.style,
      aspectRatio: defaultStudioForm.aspectRatio,
      resolution: defaultStudioForm.resolution,
      projectCode: defaults.projectCode,
      requestedProvider: providerForKind(nodeKind, defaults),
      classification: defaultStudioForm.classification,
      creationMode: creationModeForNodeKind(nodeKind),
      referenceImages: [],
      taskId: null,
      status: "idle",
      assetUrls: [],
      ...defaultUpscaleFields(),
      ...defaultAnnotationFields(),
    },
  };
}

export function createBlankNoteNode(position: { x: number; y: number }, text = "备注"): CanvasNoteNode {
  return {
    id: `note-${nanoid()}`,
    type: "note",
    position,
    data: { kind: "note", text },
  };
}

export function createUploadImageNode(
  position: { x: number; y: number },
  defaults: CanvasNodeDefaults,
  imagePath: string,
  fileName?: string
): CanvasGenerateNode {
  const node = createBlankGenerateNode("upload", position, defaults);
  return {
    ...node,
    data: {
      ...node.data,
      label: fileName ? `上传 · ${fileName}` : NODE_KIND_LABEL.upload,
      referenceImages: [imagePath],
      assetUrls: [imagePath],
      previewImagePath: imagePath,
      status: "completed",
    },
  };
}

function estimateNodeSize(node: CanvasFlowNode): { w: number; h: number } {
  const measuredW = node.measured?.width;
  const measuredH = node.measured?.height;
  if (measuredW && measuredH) return { w: measuredW, h: measuredH };
  if (node.type === "note") return { w: 220, h: 120 };
  if (node.type === "group") {
    return {
      w: Number((node.style as { width?: number } | undefined)?.width) || 320,
      h: Number((node.style as { height?: number } | undefined)?.height) || 220,
    };
  }
  if (isGenerateNode(node) && node.data.nodeKind === "annotate") return { w: 280, h: 260 };
  return { w: 260, h: 220 };
}

function absolutePosition(node: CanvasFlowNode, nodes: CanvasFlowNode[]): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;
  const guard = new Set<string>();
  while (parentId && !guard.has(parentId)) {
    guard.add(parentId);
    const parent = nodes.find((item) => item.id === parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

export function groupSelectedNodes(nodes: CanvasFlowNode[], selectedIds: string[]): CanvasFlowNode[] | null {
  const selected = nodes.filter(
    (node) => selectedIds.includes(node.id) && node.type !== "group" && !node.parentId
  );
  if (selected.length < 2) return null;

  const padding = 28;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of selected) {
    const abs = absolutePosition(node, nodes);
    const size = estimateNodeSize(node);
    minX = Math.min(minX, abs.x);
    minY = Math.min(minY, abs.y);
    maxX = Math.max(maxX, abs.x + size.w);
    maxY = Math.max(maxY, abs.y + size.h);
  }

  const groupId = `group-${nanoid()}`;
  const groupNode: CanvasGroupNode = {
    id: groupId,
    type: "group",
    position: { x: minX - padding, y: minY - padding },
    style: {
      width: Math.max(160, maxX - minX + padding * 2),
      height: Math.max(120, maxY - minY + padding * 2),
    },
    data: { kind: "group", label: "编组" },
    selectable: true,
    draggable: true,
  };

  const selectedSet = new Set(selected.map((node) => node.id));
  return [
    groupNode,
    ...nodes.map((node) => {
      if (!selectedSet.has(node.id)) return node;
      const abs = absolutePosition(node, nodes);
      return {
        ...node,
        parentId: groupId,
        extent: "parent" as const,
        position: {
          x: abs.x - groupNode.position.x,
          y: abs.y - groupNode.position.y,
        },
      };
    }),
  ];
}

export function ungroupSelectedNodes(nodes: CanvasFlowNode[], selectedIds: string[]): CanvasFlowNode[] | null {
  const groupIds = new Set(
    nodes
      .filter((node) => selectedIds.includes(node.id) && isGroupNode(node))
      .map((node) => node.id)
  );
  // Also allow ungrouping when a child inside a group is selected.
  for (const id of selectedIds) {
    const node = nodes.find((item) => item.id === id);
    if (node?.parentId) groupIds.add(node.parentId);
  }
  if (groupIds.size === 0) return null;

  const next: CanvasFlowNode[] = [];
  for (const node of nodes) {
    if (groupIds.has(node.id) && isGroupNode(node)) continue;
    if (node.parentId && groupIds.has(node.parentId)) {
      const abs = absolutePosition(node, nodes);
      const { parentId: _parentId, extent: _extent, ...rest } = node;
      next.push({
        ...rest,
        position: abs,
        parentId: undefined,
        extent: undefined,
      } as CanvasFlowNode);
      continue;
    }
    next.push(node);
  }
  return next;
}

export function serializeCanvasGraph(
  nodes: CanvasFlowNode[],
  edges: Edge[],
  viewport: Viewport
): CanvasGraphState {
  return {
    version: 1,
    nodes,
    edges,
    viewport,
  };
}

function looksLikeVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

/** Collect image/video deliverables from immediate upstream nodes. */
export function collectUpstreamDeliverables(
  nodeId: string,
  nodes: CanvasFlowNode[],
  edges: Edge[]
): { images: string[]; videos: string[] } {
  const images: string[] = [];
  const videos: string[] = [];
  const pushUnique = (list: string[], value: string) => {
    const path = value.trim();
    if (path && !list.includes(path)) list.push(path);
  };

  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const source = nodes.find((node) => node.id === edge.source);
    if (!source || !isGenerateNode(source)) continue;

    const outputs = source.data.assetUrls.filter(Boolean);
    if (outputs.length > 0) {
      for (const url of outputs) {
        if (source.data.nodeKind === "video" || looksLikeVideoUrl(url)) {
          pushUnique(videos, url);
        } else {
          pushUnique(images, url);
        }
      }
      continue;
    }

    for (const url of source.data.referenceImages) {
      pushUnique(images, url);
    }
    if (source.data.previewImagePath) {
      pushUnique(images, source.data.previewImagePath);
    }
  }

  return { images, videos };
}

const RUNNABLE_NODE_KINDS = new Set(["text2img", "img2img", "video", "upscale"]);

/** AI generate nodes that create studio tasks (excludes upload/annotate). */
export function isRunnableCanvasNode(node: CanvasFlowNode): boolean {
  return isGenerateNode(node) && RUNNABLE_NODE_KINDS.has(node.data.nodeKind);
}

/** Kahn topo order over runnable nodes only. Non-runnable upstream (upload etc.) is ignored for ordering. */
export function listRunnableNodeIdsInTopoOrder(
  nodes: CanvasFlowNode[],
  edges: Edge[],
  onlyIds?: Iterable<string>
): { order: string[]; cycle: boolean } {
  const scope = onlyIds ? new Set(onlyIds) : null;
  const runnableIds = new Set(
    nodes
      .filter(isRunnableCanvasNode)
      .filter((node) => !scope || scope.has(node.id))
      .map((node) => node.id)
  );
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const id of runnableIds) {
    indegree.set(id, 0);
    adjacency.set(id, []);
  }
  for (const edge of edges) {
    if (!runnableIds.has(edge.source) || !runnableIds.has(edge.target)) continue;
    adjacency.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
  }

  const queue = [...runnableIds].filter((id) => (indegree.get(id) || 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adjacency.get(id) || []) {
      const nextDegree = (indegree.get(next) || 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }
  return { order, cycle: order.length !== runnableIds.size };
}

/** Expand selection so selecting a group includes its children (nested groups supported). */
export function expandSelectionWithGroupChildren(
  nodes: CanvasFlowNode[],
  selectedIds: string[]
): Set<string> {
  const selected = new Set(selectedIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of nodes) {
      if (node.parentId && selected.has(node.parentId) && !selected.has(node.id)) {
        selected.add(node.id);
        grew = true;
      }
    }
  }
  return selected;
}

/** Runnable nodes inside the current selection (groups expand to children), in topo order. */
export function listRunnableNodeIdsForSelection(
  nodes: CanvasFlowNode[],
  edges: Edge[],
  selectedIds: string[]
): { order: string[]; cycle: boolean; expandedIds: Set<string> } {
  const expandedIds = expandSelectionWithGroupChildren(nodes, selectedIds);
  const { order, cycle } = listRunnableNodeIdsInTopoOrder(nodes, edges, expandedIds);
  return { order, cycle, expandedIds };
}

function resetClonedGenerateData(data: GenerateNodeData): GenerateNodeData {
  const busy =
    data.status === "submitting" || data.status === "pending" || data.status === "running";
  const hasMedia =
    data.assetUrls.length > 0 || data.referenceImages.length > 0 || Boolean(data.previewImagePath);
  return {
    ...data,
    taskId: null,
    errorMessage: undefined,
    status: busy ? (hasMedia ? "completed" : "idle") : data.status,
  };
}

/**
 * Duplicate the current selection (including children of selected groups).
 * Remaps internal edges; clears in-flight task state on generate nodes.
 */
export function duplicateCanvasSelection(
  nodes: CanvasFlowNode[],
  edges: Edge[],
  selectedIds: string[],
  offset = { x: 48, y: 48 }
): { nodes: CanvasFlowNode[]; edges: Edge[]; createdIds: string[] } | null {
  const selected = expandSelectionWithGroupChildren(nodes, selectedIds);
  const toClone = nodes.filter((node) => selected.has(node.id));
  if (toClone.length === 0) return null;

  const idMap = new Map<string, string>();
  for (const node of toClone) {
    const prefix = node.type === "group" ? "group" : node.type === "note" ? "note" : "gen";
    idMap.set(node.id, `${prefix}-${nanoid()}`);
  }

  const created: CanvasFlowNode[] = toClone.map((node) => {
    const newId = idMap.get(node.id)!;
    const parentAlsoCloned = Boolean(node.parentId && idMap.has(node.parentId));

    let position = { ...node.position };
    let parentId = node.parentId;
    let extent = node.extent;

    if (parentAlsoCloned && node.parentId) {
      parentId = idMap.get(node.parentId);
    } else if (node.parentId) {
      const abs = absolutePosition(node, nodes);
      position = { x: abs.x + offset.x, y: abs.y + offset.y };
      parentId = undefined;
      extent = undefined;
    } else {
      position = { x: node.position.x + offset.x, y: node.position.y + offset.y };
    }

    const base = {
      ...node,
      id: newId,
      position,
      parentId,
      extent,
      selected: true,
    };

    if (isGenerateNode(node)) {
      return {
        ...base,
        type: "generate" as const,
        data: resetClonedGenerateData(node.data),
      };
    }
    if (isNoteNode(node)) {
      return {
        ...base,
        type: "note" as const,
        data: { ...node.data },
      };
    }
    return {
      ...base,
      type: "group" as const,
      data: { ...node.data },
    };
  });

  const nextNodes: CanvasFlowNode[] = [
    ...nodes.map((node) => ({ ...node, selected: false })),
    ...created,
  ];

  const remappedEdges: Edge[] = edges
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => ({
      ...edge,
      id: `e-${idMap.get(edge.source)}-${idMap.get(edge.target)}-${nanoid(6)}`,
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
      selected: false,
    }));

  return {
    nodes: nextNodes,
    edges: edges.concat(remappedEdges),
    createdIds: [...idMap.values()],
  };
}

/** Snapshot selection for clipboard paste (absolute positions, detached from parents). */
export function snapshotCanvasSelection(
  nodes: CanvasFlowNode[],
  edges: Edge[],
  selectedIds: string[]
): { nodes: CanvasFlowNode[]; edges: Edge[] } | null {
  const selected = expandSelectionWithGroupChildren(nodes, selectedIds);
  const toCopy = nodes.filter((node) => selected.has(node.id));
  if (toCopy.length === 0) return null;

  const snapped: CanvasFlowNode[] = toCopy.map((node) => {
    const abs = absolutePosition(node, nodes);
    const parentAlsoSelected = Boolean(node.parentId && selected.has(node.parentId));
    if (parentAlsoSelected) {
      return { ...node, selected: false };
    }
    const { parentId: _parentId, extent: _extent, ...rest } = node;
    return {
      ...rest,
      position: abs,
      parentId: undefined,
      extent: undefined,
      selected: false,
    } as CanvasFlowNode;
  });

  const internalEdges = edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target));
  return { nodes: snapped, edges: internalEdges };
}

/** Paste a clipboard snapshot into the graph with fresh ids. */
export function pasteCanvasSnapshot(
  currentNodes: CanvasFlowNode[],
  currentEdges: Edge[],
  snapshot: { nodes: CanvasFlowNode[]; edges: Edge[] },
  offset = { x: 48, y: 48 }
): { nodes: CanvasFlowNode[]; edges: Edge[]; createdIds: string[] } | null {
  if (snapshot.nodes.length === 0) return null;

  const idMap = new Map<string, string>();
  for (const node of snapshot.nodes) {
    const prefix = node.type === "group" ? "group" : node.type === "note" ? "note" : "gen";
    idMap.set(node.id, `${prefix}-${nanoid()}`);
  }

  const created: CanvasFlowNode[] = snapshot.nodes.map((node) => {
    const newId = idMap.get(node.id)!;
    const parentAlsoCloned = Boolean(node.parentId && idMap.has(node.parentId));
    let position = {
      x: node.position.x + (parentAlsoCloned ? 0 : offset.x),
      y: node.position.y + (parentAlsoCloned ? 0 : offset.y),
    };
    let parentId = node.parentId;
    let extent = node.extent;
    if (parentAlsoCloned && node.parentId) {
      parentId = idMap.get(node.parentId);
    } else {
      parentId = undefined;
      extent = undefined;
    }

    const base = {
      ...node,
      id: newId,
      position,
      parentId,
      extent,
      selected: true,
    };

    if (isGenerateNode(node)) {
      return { ...base, type: "generate" as const, data: resetClonedGenerateData(node.data) };
    }
    if (isNoteNode(node)) {
      return { ...base, type: "note" as const, data: { ...node.data } };
    }
    return { ...base, type: "group" as const, data: { ...node.data } };
  });

  const remappedEdges: Edge[] = snapshot.edges
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => ({
      ...edge,
      id: `e-${idMap.get(edge.source)}-${idMap.get(edge.target)}-${nanoid(6)}`,
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
      selected: false,
    }));

  return {
    nodes: [...currentNodes.map((node) => ({ ...node, selected: false })), ...created],
    edges: [...currentEdges, ...remappedEdges],
    createdIds: [...idMap.values()],
  };
}
