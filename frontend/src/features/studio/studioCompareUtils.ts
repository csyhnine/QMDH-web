import type { Task } from "../../api";
import { taskReferenceImages } from "./studioTaskReferenceUtils";

function firstNonEmptyPath(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** Resolve the source / reference image to compare against a Studio result asset. */
export function resolveStudioCompareOriginalUrl(task: Task, resultUrl: string): string | null {
  const refs = taskReferenceImages(task);
  for (const path of refs) {
    if (path && path !== resultUrl) return path;
  }

  const payload = task.payload ?? {};
  const fromPayload = firstNonEmptyPath(
    payload.source_image,
    payload.reference_image,
    Array.isArray(payload.reference_images) ? payload.reference_images[0] : null,
    Array.isArray(payload.source_images) ? payload.source_images[0] : null
  );
  if (fromPayload && fromPayload !== resultUrl) return fromPayload;

  const result = task.result ?? {};
  const fromResult = firstNonEmptyPath(
    result.source_image,
    result.reference_image,
    result.reference_image_storage_path,
    Array.isArray(result.reference_image_storage_paths) ? result.reference_image_storage_paths[0] : null
  );
  if (fromResult && fromResult !== resultUrl) return fromResult;

  return null;
}
