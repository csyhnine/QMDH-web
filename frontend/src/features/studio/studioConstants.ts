import type {
  LoadState,
  StudioFormState,
} from "./studioTypes";

export const IMAGE_WORKFLOW_KEY = "image-generate";
export const IMAGE_EDIT_WORKFLOW_KEY = "image-edit";
export const IMAGE_UPSCALE_WORKFLOW_KEY = "image-upscale";
export const VIDEO_WORKFLOW_KEY = "video-generate";

export const initialState: LoadState = {
  health: "loading",
  projects: [],
  providers: [],
  workflows: [],
  tasks: [],
  assets: [],
  error: "",
  ready: false,
};

export const stylePresets = [
  { id: "modern", label: "现代竞赛" },
  { id: "editorial", label: "杂志感" },
  { id: "cinematic", label: "电影感" },
  { id: "minimal", label: "极简体块" },
];

export const SOURCE_ASPECT_RATIO_LABEL = "遵循原图";

export const aspectRatioOptions = ["智能", "21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"];

/** Image-edit ratios: default follows the reference image; fixed ratios remain optional overrides. */
export const imageEditAspectRatioOptions = [
  SOURCE_ASPECT_RATIO_LABEL,
  "21:9",
  "16:9",
  "3:2",
  "4:3",
  "1:1",
  "3:4",
  "2:3",
  "9:16",
];

export function isSourceAspectRatio(value: string | undefined | null): boolean {
  const normalized = String(value || "").trim();
  return (
    !normalized ||
    normalized === SOURCE_ASPECT_RATIO_LABEL ||
    normalized === "遵循原图比例" ||
    normalized === "原图比例" ||
    normalized === "原图" ||
    normalized === "智能"
  );
}

export const maxStudioImageCount = 3;

export const studioImageCountOptions = [1, 2, 3] as const;

export const resolutionOptions = [
  { id: "1k", label: "标准 1K" },
  { id: "2k", label: "高清 2K" },
];

/** Normalizes legacy 4k UI values to 1k; keeps 1k/2k for upstream model suffix routing. */
export function normalizeStudioResolution(resolution: string | undefined | null): string {
  const normalized = String(resolution || "").trim().toLowerCase();
  if (normalized === "2k") return "2k";
  return "1k";
}

export function studioResolutionLabel(resolution: string | undefined | null): string {
  const id = normalizeStudioResolution(resolution);
  return resolutionOptions.find((option) => option.id === id)?.label ?? "标准 1K";
}

export { defaultUpscaleOptions } from "./studioUpscaleOptions";

export const defaultStudioForm: StudioFormState = {
  creationMode: "generate",
  title: "",
  prompt: "",
  projectCode: "QMDH-001",
  requestedProvider: "",
  classification: "B",
  style: "modern",
  aspectRatio: "16:9",
  resolution: "1k",
  imageCount: 1,
  deliverable: "",
  referenceImages: [],
  notes: "",
  grokVideoSku: "",
};
