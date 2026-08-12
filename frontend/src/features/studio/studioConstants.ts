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

export type ResolutionOption = { id: string; label: string };

export const resolutionOptions: ResolutionOption[] = [
  { id: "1k", label: "标准 1K" },
  { id: "2k", label: "高清 2K" },
];

const RESOLUTION_OPTION_CATALOG: ResolutionOption[] = [
  { id: "1k", label: "标准 1K" },
  { id: "2k", label: "高清 2K" },
  { id: "4k", label: "超清 4K" },
];

const RESOLUTION_ORDER = ["1k", "2k", "4k"] as const;

/** Keeps 1k/2k/4k for upstream routing (wan2.7-pro uses literal size 4K). */
export function normalizeStudioResolution(resolution: string | undefined | null): string {
  const normalized = String(resolution || "").trim().toLowerCase();
  if (normalized === "4k") return "4k";
  if (normalized === "2k") return "2k";
  return "1k";
}

export function studioResolutionLabel(resolution: string | undefined | null): string {
  const id = normalizeStudioResolution(resolution);
  return RESOLUTION_OPTION_CATALOG.find((option) => option.id === id)?.label ?? "标准 1K";
}

export function readSupportedResolutions(
  value: unknown
): Array<(typeof RESOLUTION_ORDER)[number]> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const normalized = value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item): item is (typeof RESOLUTION_ORDER)[number] =>
      (RESOLUTION_ORDER as readonly string[]).includes(item)
    );
  const unique = RESOLUTION_ORDER.filter((id) => normalized.includes(id));
  return unique.length > 0 ? [...unique] : null;
}

export function readSupportedResolutionsFromProvider(provider: {
  supported_resolutions?: string[] | null;
  adapter_config?: Record<string, unknown> | null;
} | null | undefined): Array<(typeof RESOLUTION_ORDER)[number]> | null {
  if (!provider) return null;
  const fromField = readSupportedResolutions(provider.supported_resolutions);
  if (fromField) return fromField;
  const config = provider.adapter_config;
  if (config && typeof config === "object") {
    return readSupportedResolutions(config.supported_resolutions);
  }
  return null;
}

function providerLooksLikeWanPro(provider: {
  provider_name?: string | null;
  model_name?: string | null;
} | null | undefined): boolean {
  const identity = `${provider?.provider_name || ""} ${provider?.model_name || ""}`.toLowerCase();
  return identity.includes("wan2.7-image-pro") || identity.includes("wan2_7-image-pro");
}

/** Resolve visible resolution chips for Studio/Canvas; respects adapter_config.supported_resolutions. */
export function resolveProviderResolutionOptions(
  provider: {
    provider_name?: string | null;
    model_name?: string | null;
    supported_resolutions?: string[] | null;
    adapter_config?: Record<string, unknown> | null;
  } | null | undefined,
  options?: { creationMode?: string }
): ResolutionOption[] {
  const configured = readSupportedResolutionsFromProvider(provider);
  if (configured) {
    return configured.map(
      (id) => RESOLUTION_OPTION_CATALOG.find((item) => item.id === id) ?? { id, label: id.toUpperCase() }
    );
  }

  const creationMode = options?.creationMode || "generate";
  if (providerLooksLikeWanPro(provider) && creationMode === "generate") {
    return [...resolutionOptions, { id: "4k", label: "超清 4K" }];
  }
  return [...resolutionOptions];
}

/** If current resolution is not allowed, fall back to the first supported option. */
export function clampResolutionToOptions(
  resolution: string | undefined | null,
  options: ResolutionOption[]
): string {
  const normalized = normalizeStudioResolution(resolution);
  if (options.some((item) => item.id === normalized)) return normalized;
  return options[0]?.id ?? "1k";
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
