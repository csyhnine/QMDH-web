import { MAX_REFERENCE_UPLOAD_BYTES, formatUploadSize, validateReferenceImageSize } from "../../utils/uploads";
import type { ReferenceUploadItem, StudioFormState, SubmissionTracker } from "./studioTypes";
import { summarizeReferenceImageLabel } from "./studioTaskUtils";
import { clampImageCount } from "./studioAssetUtils";

export type PreparedReferenceFiles = {
  acceptedFiles: File[];
  errors: string[];
};

type BuildReferenceUploadTrackerOptions = {
  defaultTitle: string;
  selectedProviderName: string;
  studioForm: StudioFormState;
};

export function buildReferenceUploadsFromPaths(paths: string[]): ReferenceUploadItem[] {
  return paths.slice(0, 4).map((path, index) => ({
    fileName: summarizeReferenceImageLabel(path) || `参考图 ${index + 1}`,
    previewUrl: path,
    storagePath: path,
  }));
}

export function releaseReferencePreview(url: string) {
  if (url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export function releaseReferencePreviews(items: ReferenceUploadItem[]) {
  for (const item of items) {
    releaseReferencePreview(item.previewUrl);
  }
}

export function referenceUploadStoragePaths(items: ReferenceUploadItem[]): string[] {
  return items.map((item) => item.storagePath);
}

export function removeReferenceUploadAt(
  items: ReferenceUploadItem[],
  index: number
): { nextUploads: ReferenceUploadItem[]; removedUpload: ReferenceUploadItem | null } {
  const removedUpload = items[index] ?? null;
  if (!removedUpload) {
    return { nextUploads: items, removedUpload };
  }

  return {
    nextUploads: items.filter((_, currentIndex) => currentIndex !== index),
    removedUpload,
  };
}

export function buildReferenceUploadTracker({
  defaultTitle,
  selectedProviderName,
  studioForm,
}: BuildReferenceUploadTrackerOptions): SubmissionTracker {
  return {
    taskId: null,
    taskTitle: studioForm.title.trim() || defaultTitle,
    providerName: selectedProviderName,
    imageCount: clampImageCount(studioForm.imageCount),
    hasReferenceImage: true,
    stage: "uploading_reference",
  };
}

export function shouldClearTransientReferenceTracker(tracker: SubmissionTracker | null): boolean {
  return tracker?.taskId === null;
}

export function prepareReferenceUploadFiles(
  files: File[],
  currentUploadCount: number,
  maxReferenceCount = 4
): PreparedReferenceFiles {
  const errors: string[] = [];
  if (files.length === 0) {
    return { acceptedFiles: [], errors };
  }

  const validFiles = files.filter((file) => file.type.startsWith("image/"));
  if (validFiles.length !== files.length) {
    errors.push("请只上传图片文件作为参考图");
  }

  const sizedFiles = validFiles.filter((file) => file.size <= MAX_REFERENCE_UPLOAD_BYTES);
  if (sizedFiles.length !== validFiles.length) {
    const oversizedNames = validFiles
      .filter((file) => file.size > MAX_REFERENCE_UPLOAD_BYTES)
      .map((file) => file.name)
      .slice(0, 2);
    errors.push(
      `单张参考图不能超过 ${formatUploadSize(MAX_REFERENCE_UPLOAD_BYTES)}，已忽略：${oversizedNames.join("、")}`
    );
  }

  const remainingSlots = maxReferenceCount - currentUploadCount;
  if (remainingSlots <= 0) {
    errors.push(`最多只能上传 ${maxReferenceCount} 张参考图`);
    return { acceptedFiles: [], errors };
  }

  const acceptedFiles = sizedFiles.slice(0, remainingSlots);
  if (sizedFiles.length > remainingSlots) {
    errors.push(`最多只能保留 ${maxReferenceCount} 张参考图，超出的图片已忽略`);
  }

  return { acceptedFiles, errors };
}

export { uploadReferenceFiles, type UploadReferenceImage } from "./studioReferenceUploadTransport";
