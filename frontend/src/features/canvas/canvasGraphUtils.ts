import type { Edge, Node, Viewport } from "@xyflow/react";

import { defaultStudioForm, normalizeStudioResolution } from "../studio/studioConstants";
import type { UpscaleNoise, UpscaleScale, UpscaleStyle } from "../studio/studioUpscaleOptions";
import { nanoid } from "./canvasId";
import type {
  CanvasFlowNode,
  CanvasGenerateNode,
  CanvasGraphState,
  CanvasGroupNode,
  CanvasNodeKind,
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
} from "./canvasTypes";

const KNOWN_KINDS: CanvasNodeKind[] = [
  "text2img",
  "img2img",
  "video",
  "upload",
  "upscale",
  "annotate",
];

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
      referenceImages: Array.isArray(data.referenceImages) ? data.referenceImages.map(String) : [],
      previewImagePath: data.previewImagePath ? String(data.previewImagePath) : undefined,
      taskId: typeof data.taskId === "number" ? data.taskId : null,
      status:
        data.status ||
        (nodeKind === "upload" && (data.assetUrls?.length || data.referenceImages?.length)
          ? "completed"
          : "idle"),
      assetUrls: Array.isArray(data.assetUrls) ? data.assetUrls.map(String) : [],
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
