import type { Task } from "../../api";
import { taskReferenceImages } from "./studioTaskReferenceUtils";

function pushPath(target: string[], value: unknown) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed) target.push(trimmed);
}

function pushPathList(target: string[], value: unknown) {
  if (!Array.isArray(value)) return;
  for (const item of value) pushPath(target, item);
}

/** Deduplicate paths while preserving order. */
export function uniqueMediaPaths(paths: Iterable<string>, exclude?: string | null): string[] {
  const skip = exclude?.trim() || "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const path of paths) {
    const trimmed = path.trim();
    if (!trimmed || trimmed === skip || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** Collect all source / reference images that can be compared against a Studio result. */
export function listStudioCompareOriginalUrls(task: Task, resultUrl: string): string[] {
  const candidates: string[] = [];
  candidates.push(...taskReferenceImages(task));

  // Task API exposes refs on result (not payload). Keep defensive fallbacks for older rows.
  const result = task.result ?? {};
  pushPath(candidates, result.source_image);
  pushPath(candidates, result.reference_image);
  pushPath(candidates, result.reference_image_storage_path);
  pushPathList(candidates, result.reference_image_storage_paths);
  pushPathList(candidates, result.source_images);
  pushPathList(candidates, result.reference_images);

  return uniqueMediaPaths(candidates, resultUrl);
}

/** Resolve the default source / reference image to compare against a Studio result asset. */
export function resolveStudioCompareOriginalUrl(task: Task, resultUrl: string): string | null {
  return listStudioCompareOriginalUrls(task, resultUrl)[0] ?? null;
}
