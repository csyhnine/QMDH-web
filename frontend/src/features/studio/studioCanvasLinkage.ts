/**
 * Single source of truth linking Studio creationMode surfaces to canvas nodeKind.
 * Change aspect defaults / options / workflow here — both Studio composer and canvas nodes read this.
 */
import { GROK_VIDEO_ASPECT_RATIOS } from "./grokVideoUtils";
import {
  IMAGE_EDIT_WORKFLOW_KEY,
  IMAGE_UPSCALE_WORKFLOW_KEY,
  IMAGE_WORKFLOW_KEY,
  SOURCE_ASPECT_RATIO_LABEL,
  VIDEO_WORKFLOW_KEY,
  aspectRatioOptions,
  imageEditAspectRatioOptions,
  isMatchAspectRatio,
  isSourceAspectRatio,
  resolutionOptions,
} from "./studioConstants";
import type { StudioFormState } from "./studioTypes";

export type CanvasSurfaceKind =
  | "text2img"
  | "img2img"
  | "video"
  | "upscale"
  | "upload"
  | "annotate";

export type StudioCreationMode = StudioFormState["creationMode"];

export type StudioCanvasLink = {
  nodeKind: CanvasSurfaceKind;
  /** null = canvas-local surface with no Studio mode switch. */
  creationMode: StudioCreationMode | null;
  studioLabel: string | null;
  canvasLabel: string;
  workflowKey: string | null;
  aspectRatioOptions: readonly string[];
  defaultAspectRatio: string;
  resolutionOptions: typeof resolutionOptions | null;
  fixedResolution: string | null;
  requiresReferenceImage: boolean;
  providerCapability: string | null;
};

const LINKS: Record<CanvasSurfaceKind, StudioCanvasLink> = {
  text2img: {
    nodeKind: "text2img",
    creationMode: "generate",
    studioLabel: "文生图",
    canvasLabel: "文生图",
    workflowKey: IMAGE_WORKFLOW_KEY,
    aspectRatioOptions,
    defaultAspectRatio: "16:9",
    resolutionOptions,
    fixedResolution: null,
    requiresReferenceImage: false,
    providerCapability: "image.generate",
  },
  img2img: {
    nodeKind: "img2img",
    creationMode: "edit",
    studioLabel: "图像编辑",
    canvasLabel: "图生图",
    workflowKey: IMAGE_EDIT_WORKFLOW_KEY,
    aspectRatioOptions: imageEditAspectRatioOptions,
    defaultAspectRatio: SOURCE_ASPECT_RATIO_LABEL,
    resolutionOptions,
    fixedResolution: null,
    requiresReferenceImage: true,
    providerCapability: "image.edit",
  },
  video: {
    nodeKind: "video",
    creationMode: "video",
    studioLabel: "视频生成",
    canvasLabel: "视频生成",
    workflowKey: VIDEO_WORKFLOW_KEY,
    aspectRatioOptions,
    defaultAspectRatio: "16:9",
    resolutionOptions: null,
    fixedResolution: "720p",
    requiresReferenceImage: false,
    providerCapability: "video.generate",
  },
  upscale: {
    nodeKind: "upscale",
    creationMode: null,
    studioLabel: null,
    canvasLabel: "放大",
    workflowKey: IMAGE_UPSCALE_WORKFLOW_KEY,
    aspectRatioOptions: [],
    defaultAspectRatio: "",
    resolutionOptions: null,
    fixedResolution: null,
    requiresReferenceImage: true,
    providerCapability: "image.upscale",
  },
  upload: {
    nodeKind: "upload",
    creationMode: null,
    studioLabel: null,
    canvasLabel: "上传图片",
    workflowKey: null,
    aspectRatioOptions: [],
    defaultAspectRatio: "",
    resolutionOptions: null,
    fixedResolution: null,
    requiresReferenceImage: false,
    providerCapability: null,
  },
  annotate: {
    nodeKind: "annotate",
    creationMode: null,
    studioLabel: null,
    canvasLabel: "手绘标注",
    workflowKey: null,
    aspectRatioOptions: [],
    defaultAspectRatio: "",
    resolutionOptions: null,
    fixedResolution: null,
    requiresReferenceImage: false,
    providerCapability: null,
  },
};

const MODE_TO_NODE: Record<StudioCreationMode, CanvasSurfaceKind> = {
  generate: "text2img",
  edit: "img2img",
  video: "video",
};

function isCanvasSurfaceKind(value: string): value is CanvasSurfaceKind {
  return value in LINKS;
}

export function linkForNodeKind(nodeKind: CanvasSurfaceKind | string): StudioCanvasLink {
  if (isCanvasSurfaceKind(nodeKind)) return LINKS[nodeKind];
  return LINKS.text2img;
}

export function linkForCreationMode(mode: StudioCreationMode): StudioCanvasLink {
  return LINKS[MODE_TO_NODE[mode]];
}

export function creationModeForNodeKind(nodeKind: CanvasSurfaceKind | string): StudioCreationMode {
  const mode = linkForNodeKind(nodeKind).creationMode;
  return mode ?? "generate";
}

export function nodeKindForCreationMode(mode: StudioCreationMode): CanvasSurfaceKind {
  return MODE_TO_NODE[mode];
}

export function aspectRatioOptionsFor(
  surface: CanvasSurfaceKind | StudioCreationMode,
  options?: { grokVideo?: boolean }
): readonly string[] {
  const link =
    surface === "generate" || surface === "edit" || surface === "video"
      ? linkForCreationMode(surface)
      : linkForNodeKind(surface);
  if (link.creationMode === "video" && options?.grokVideo) {
    return [...GROK_VIDEO_ASPECT_RATIOS];
  }
  return link.aspectRatioOptions;
}

export function defaultAspectRatioFor(surface: CanvasSurfaceKind | StudioCreationMode): string {
  const link =
    surface === "generate" || surface === "edit" || surface === "video"
      ? linkForCreationMode(surface)
      : linkForNodeKind(surface);
  return link.defaultAspectRatio;
}

/**
 * Normalize a raw aspect value for a given Studio/canvas surface.
 * Edit / img2img: follow-source labels →「遵循原图」;「匹配比例」is T2I-only.
 */
export function resolveAspectRatioForSurface(
  surface: CanvasSurfaceKind | StudioCreationMode,
  raw: string | undefined | null
): string {
  const link =
    surface === "generate" || surface === "edit" || surface === "video"
      ? linkForCreationMode(surface)
      : linkForNodeKind(surface);
  const value = String(raw || "").trim();
  if (link.nodeKind === "img2img" || link.creationMode === "edit") {
    if (!value || isSourceAspectRatio(value) || isMatchAspectRatio(value)) {
      return link.defaultAspectRatio;
    }
    return value;
  }
  if (!value) return link.defaultAspectRatio || "16:9";
  return value;
}

/** True when current ratio is not in the target surface option list (needs reset on kind switch). */
export function aspectRatioNeedsResetForSurface(
  surface: CanvasSurfaceKind | StudioCreationMode,
  current: string | undefined | null,
  options?: { grokVideo?: boolean }
): boolean {
  const value = String(current || "").trim();
  if (!value) return true;
  const allowed = aspectRatioOptionsFor(surface, options);
  return !allowed.includes(value);
}
