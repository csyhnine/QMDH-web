import type { StudioFormState } from "./studioTypes";

export type TemplateSaveSnapshot = {
  generation: number;
  targetId: number | null;
  label: string;
  title: string;
  form: StudioFormState;
  version: string;
};

export function templateDraftVersion(label: string, title: string, form: StudioFormState): string {
  return JSON.stringify([label, title, form.title, form.prompt, form.creationMode === "video" ? "video" : "image",
    form.style, form.aspectRatio, form.resolution, form.deliverable, form.notes]);
}

export function copyTemplateForm(form: StudioFormState): StudioFormState {
  return { ...form, referenceImages: [...form.referenceImages] };
}

export function templateSaveWasRejected(error: unknown): boolean {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  return typeof status === "number" && [400, 401, 403, 404, 409, 413, 422].includes(status);
}
