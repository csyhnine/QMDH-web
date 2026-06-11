import type {
  LoadState,
  StudioFormState,
} from "./studioTypes";

export const IMAGE_WORKFLOW_KEY = "image-generate";
export const IMAGE_EDIT_WORKFLOW_KEY = "image-edit";
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

export const aspectRatioOptions = ["智能", "21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"];

export const resolutionOptions = [
  { id: "2k", label: "高清 2K" },
  { id: "4k", label: "超清 4K" },
];

export const defaultStudioForm: StudioFormState = {
  creationMode: "generate",
  title: "",
  prompt: "",
  projectCode: "QMDH-001",
  requestedProvider: "",
  classification: "B",
  style: "modern",
  aspectRatio: "16:9",
  resolution: "4k",
  imageCount: 1,
  deliverable: "",
  referenceImages: [],
  notes: "",
};
