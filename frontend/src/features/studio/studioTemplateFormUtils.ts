import type { PromptTemplateRecord } from "../../api";
import { normalizeStudioResolution } from "./studioConstants";
import type { CustomPromptTemplate, PromptTemplateFormValue, StudioFormState } from "./studioTypes";

export function applyTemplateToForm(template: PromptTemplateFormValue, current: StudioFormState): StudioFormState {
  if ((template.mediaType ?? "image") !== (current.creationMode === "video" ? "video" : "image")) return current;
  if (current.creationMode === "video") {
    return { ...current, title: template.title, prompt: template.prompt, style: template.style, deliverable: template.deliverable, notes: template.notes, promptPolished: false };
  }
  return {
    ...current,
    title: template.title,
    prompt: template.prompt,
    style: template.style,
    aspectRatio: template.aspectRatio,
    resolution: normalizeStudioResolution(template.resolution),
    deliverable: template.deliverable,
    notes: template.notes,
  };
}

export function toTemplateFormValue(template: PromptTemplateRecord): PromptTemplateFormValue {
  return {
    mediaType: template.media_type ?? "image",
    label: template.label,
    title: template.title,
    prompt: template.prompt,
    style: template.style,
    aspectRatio: template.aspect_ratio || "16:9",
    resolution: normalizeStudioResolution(template.resolution),
    deliverable: template.deliverable,
    notes: template.notes,
  };
}

export function sortTemplatesByUpdatedAt(templates: CustomPromptTemplate[]): CustomPromptTemplate[] {
  return [...templates].sort(
    (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  );
}
