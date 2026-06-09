import type { PromptTemplateCreatePayload, PromptTemplateRecord, PromptTemplateUpdatePayload } from "../../api";
import type { StudioFormState, TemplateFeedback } from "./studioTypes";
import {
  buildCustomTemplatePayload,
  validateCustomTemplateDraft,
} from "./customStudioTemplateUtils";

type SaveCustomTemplateDraftOptions = {
  apiClient: {
    createPromptTemplate: (payload: PromptTemplateCreatePayload) => Promise<PromptTemplateRecord>;
    updatePromptTemplate: (
      templateId: number,
      payload: PromptTemplateUpdatePayload
    ) => Promise<PromptTemplateRecord>;
  };
  editingTemplateId: number | null;
  labelInput: string;
  studioForm: StudioFormState;
  titleInput: string;
  workspaceName: string;
};

export type SaveCustomTemplateDraftResult =
  | {
      status: "saved";
      feedback: TemplateFeedback;
      template: PromptTemplateRecord;
    }
  | {
      status: "invalid";
      errorMessage: string;
      feedback: TemplateFeedback;
    };

export type DeleteCustomTemplate = (templateId: number) => Promise<void>;

export async function saveCustomTemplateDraft({
  apiClient,
  editingTemplateId,
  labelInput,
  studioForm,
  titleInput,
  workspaceName,
}: SaveCustomTemplateDraftOptions): Promise<SaveCustomTemplateDraftResult> {
  const validation = validateCustomTemplateDraft({
    labelInput,
    titleInput,
    studioForm,
  });
  if (!validation.ok) {
    return {
      status: "invalid",
      errorMessage: validation.errorMessage,
      feedback: validation.feedback,
    };
  }

  const payload = buildCustomTemplatePayload({
    draft: validation.draft,
    studioForm,
    workspaceName,
  });

  if (editingTemplateId === null) {
    return {
      status: "saved",
      feedback: { type: "success", message: "提示词已保存到“我的提示词”。" },
      template: await apiClient.createPromptTemplate(payload),
    };
  }

  return {
    status: "saved",
    feedback: { type: "success", message: "提示词已更新。" },
    template: await apiClient.updatePromptTemplate(editingTemplateId, payload),
  };
}

export async function deleteCustomTemplateById(
  templateId: number,
  deleteCustomTemplate: DeleteCustomTemplate
): Promise<number> {
  await deleteCustomTemplate(templateId);
  return templateId;
}
