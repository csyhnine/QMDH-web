import type { PromptTemplateRecord } from "../../api";
import { normalizeStudioResolution } from "./studioConstants";
import type { StudioFormState } from "./studioTypes";
import { toTemplateFormValue } from "./studioTemplateFormUtils";

export function formMatchesTemplate(form: StudioFormState, template: PromptTemplateRecord): boolean {
  if ((template.media_type ?? "image") !== (form.creationMode === "video" ? "video" : "image")) return false;
  const value = toTemplateFormValue(template);
  return (
    form.title.trim() === value.title.trim() &&
    form.prompt.trim() === value.prompt.trim() &&
    form.style.trim() === value.style.trim() &&
    (form.creationMode === "video" || (form.aspectRatio === value.aspectRatio &&
    normalizeStudioResolution(form.resolution) === normalizeStudioResolution(value.resolution))) &&
    form.deliverable.trim() === value.deliverable.trim() &&
    form.notes.trim() === value.notes.trim()
  );
}

export function findBoundTemplate(
  form: StudioFormState,
  templates: PromptTemplateRecord[]
): PromptTemplateRecord | null {
  if (form.activeTemplateId == null) {
    return null;
  }
  const template = templates.find((item) => item.id === form.activeTemplateId);
  if (!template || !formMatchesTemplate(form, template)) {
    return null;
  }
  return template;
}

export function resolveBoundTemplateId(
  form: StudioFormState,
  templates: PromptTemplateRecord[]
): number | undefined {
  return findBoundTemplate(form, templates)?.id;
}

export function applyTemplateBindingGuard(
  current: StudioFormState,
  patch: Partial<StudioFormState>,
  templates: PromptTemplateRecord[]
): StudioFormState {
  const next = { ...current, ...patch };
  if (next.activeTemplateId == null) {
    return next;
  }
  return findBoundTemplate(next, templates) ? next : { ...next, activeTemplateId: null };
}
