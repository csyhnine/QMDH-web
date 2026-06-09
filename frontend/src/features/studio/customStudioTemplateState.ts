import type { TemplateFeedback } from "./studioTypes";

export function customTemplateErrorFeedback(error: unknown, fallback: string): TemplateFeedback {
  return {
    type: "error",
    message: error instanceof Error ? error.message : fallback,
  };
}

export function shouldClearCustomTemplateEdit(
  editingTemplateId: number | null,
  templateId: number
) {
  return editingTemplateId === templateId;
}
