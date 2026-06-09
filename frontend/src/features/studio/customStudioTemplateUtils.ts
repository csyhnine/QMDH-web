import type { PromptTemplateCreatePayload, PromptTemplateRecord } from "../../api";
import type { CustomPromptTemplate, StudioFormState, TemplateFeedback } from "./studioTypes";
import { sortTemplatesByUpdatedAt } from "./studioUtils";

export type CustomTemplateDraft = {
  label: string;
  title: string;
  prompt: string;
};

export type CustomTemplateDraftValidation =
  | {
      ok: true;
      draft: CustomTemplateDraft;
    }
  | {
      ok: false;
      feedback: TemplateFeedback;
      errorMessage: string;
    };

type ValidateCustomTemplateDraftOptions = {
  labelInput: string;
  titleInput: string;
  studioForm: StudioFormState;
};

type BuildCustomTemplatePayloadOptions = {
  draft: CustomTemplateDraft;
  studioForm: StudioFormState;
  workspaceName: string;
};

export function validateCustomTemplateDraft({
  labelInput,
  titleInput,
  studioForm,
}: ValidateCustomTemplateDraftOptions): CustomTemplateDraftValidation {
  const label = labelInput.trim();
  const title = titleInput.trim() || studioForm.title.trim();
  const prompt = studioForm.prompt.trim();

  if (!label) {
    const message = "请先填写自定义提示词名称";
    return {
      ok: false,
      feedback: { type: "error", message: "请先填写自定义提示词名称。" },
      errorMessage: message,
    };
  }

  if (!prompt) {
    const message = "请先填写提示词内容后再保存";
    return {
      ok: false,
      feedback: { type: "error", message: "请先填写提示词内容后再保存。" },
      errorMessage: message,
    };
  }

  return {
    ok: true,
    draft: {
      label,
      title,
      prompt,
    },
  };
}

export function buildCustomTemplatePayload({
  draft,
  studioForm,
  workspaceName,
}: BuildCustomTemplatePayloadOptions): PromptTemplateCreatePayload {
  return {
    category: "",
    subcategory: "",
    is_featured: false,
    label: draft.label,
    title: draft.title || `${workspaceName} 自定义提示词`,
    prompt: draft.prompt,
    style: studioForm.style,
    aspect_ratio: studioForm.aspectRatio,
    resolution: studioForm.resolution,
    deliverable: studioForm.deliverable,
    notes: studioForm.notes,
    source_image_path: "",
    preview_image_path: "",
  };
}

export function removeCustomTemplate(
  templates: CustomPromptTemplate[],
  templateId: number
): CustomPromptTemplate[] {
  return templates.filter((template) => template.id !== templateId);
}

export function upsertCustomTemplate(
  templates: CustomPromptTemplate[],
  savedTemplate: PromptTemplateRecord
): CustomPromptTemplate[] {
  return sortTemplatesByUpdatedAt([
    savedTemplate,
    ...templates.filter((template) => template.id !== savedTemplate.id),
  ]);
}
