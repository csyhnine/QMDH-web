import type { Node, Edge, Viewport } from "@xyflow/react";

import type { StudioFormState } from "../studio/studioTypes";
import type { UpscaleNoise, UpscaleScale, UpscaleStyle } from "../studio/studioUpscaleOptions";
import { defaultUpscaleOptions } from "../studio/studioUpscaleOptions";
import {
  defaultAnnotationState,
  type AnnotationStroke,
  type AnnotationTool,
} from "./annotateTypes";

export type CanvasNodeStatus =
  | "idle"
  | "submitting"
  | "pending"
  | "running"
  | "awaiting_result"
  | "completed"
  | "failed";

/** Workflow / media node kinds. */
export type CanvasNodeKind =
  | "text2img"
  | "img2img"
  | "video"
  | "upload"
  | "upscale"
  | "annotate";

export type GenerateNodeData = {
  kind: "generate";
  nodeKind: CanvasNodeKind;
  label: string;
  templateId?: number | null;
  prompt: string;
  style: string;
  aspectRatio: string;
  resolution: string;
  projectCode: string;
  requestedProvider: string;
  classification: string;
  creationMode: StudioFormState["creationMode"];
  referenceImages: string[];
  previewImagePath?: string;
  taskId?: number | null;
  status: CanvasNodeStatus;
  assetUrls: string[];
  errorMessage?: string;
  upscaleStyle: UpscaleStyle;
  upscaleNoise: UpscaleNoise;
  upscaleScale: UpscaleScale;
  annotationStrokes: AnnotationStroke[];
  annotationTool: AnnotationTool;
  annotationColor: string;
  annotationWidth: number;
  annotationOpacity: number;
};

export type GroupNodeData = {
  kind: "group";
  label: string;
};

export type NoteNodeData = {
  kind: "note";
  text: string;
};

export type CanvasGenerateNode = Node<GenerateNodeData, "generate">;
export type CanvasGroupNode = Node<GroupNodeData, "group">;
export type CanvasNoteNode = Node<NoteNodeData, "note">;
export type CanvasFlowNode = CanvasGenerateNode | CanvasGroupNode | CanvasNoteNode;

export type CanvasGraphState = {
  version: number;
  nodes: CanvasFlowNode[];
  edges: Edge[];
  viewport: Viewport;
};

export const NODE_KIND_LABEL: Record<CanvasNodeKind, string> = {
  text2img: "文生图",
  img2img: "图生图",
  video: "视频生成",
  upload: "上传图片",
  upscale: "放大",
  annotate: "手绘标注",
};

export const ADDABLE_NODE_KINDS: CanvasNodeKind[] = [
  "text2img",
  "img2img",
  "video",
  "upload",
  "upscale",
  "annotate",
];

export function creationModeForNodeKind(nodeKind: CanvasNodeKind): StudioFormState["creationMode"] {
  if (nodeKind === "img2img") return "edit";
  if (nodeKind === "video") return "video";
  return "generate";
}

export function defaultUpscaleFields() {
  return {
    upscaleStyle: defaultUpscaleOptions.style,
    upscaleNoise: defaultUpscaleOptions.noise,
    upscaleScale: defaultUpscaleOptions.scale,
  };
}

export function defaultAnnotationFields() {
  return { ...defaultAnnotationState };
}

export function isGenerateNode(node: CanvasFlowNode): node is CanvasGenerateNode {
  return node.type === "generate";
}

export function isGroupNode(node: CanvasFlowNode): node is CanvasGroupNode {
  return node.type === "group";
}

export function isNoteNode(node: CanvasFlowNode): node is CanvasNoteNode {
  return node.type === "note";
}

export function emptyCanvasGraph(): CanvasGraphState {
  return {
    version: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
