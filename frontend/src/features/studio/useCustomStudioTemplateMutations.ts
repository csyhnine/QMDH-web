import { type Dispatch, type SetStateAction, useCallback } from "react";

import { api } from "../../api";
import {
  deleteCustomTemplateById,
  saveCustomTemplateDraft,
} from "./customStudioTemplateActions";
import {
  customTemplateErrorFeedback,
  shouldClearCustomTemplateEdit,
} from "./customStudioTemplateState";
import {
  removeCustomTemplate,
  upsertCustomTemplate,
} from "./customStudioTemplateUtils";
import type {
  CustomPromptTemplate,
  StudioFormState,
  TemplateFeedback,
} from "./studioTypes";

type UseCustomStudioTemplateMutationsOptions = {
  clearTemplateEditState: () => void;
  completeTemplateSave: (templateId: number, feedback: TemplateFeedback) => void;
  editingTemplateId: number | null;
  onClearError: () => void;
  onError: (message: string) => void;
  setCustomTemplates: Dispatch<SetStateAction<CustomPromptTemplate[]>>;
  setTemplateFeedback: Dispatch<SetStateAction<TemplateFeedback | null>>;
  studioForm: StudioFormState;
  templateDraftLabel: string;
  templateDraftTitle: string;
  workspaceName: string;
};

export function useCustomStudioTemplateMutations({
  clearTemplateEditState,
  completeTemplateSave,
  editingTemplateId,
  onClearError,
  onError,
  setCustomTemplates,
  setTemplateFeedback,
  studioForm,
  templateDraftLabel,
  templateDraftTitle,
  workspaceName,
}: UseCustomStudioTemplateMutationsOptions) {
  const deleteCustomTemplate = useCallback(async (templateId: number) => {
    try {
      const deletedTemplateId = await deleteCustomTemplateById(templateId, api.deletePromptTemplate);
      setCustomTemplates((current) => removeCustomTemplate(current, deletedTemplateId));
      if (shouldClearCustomTemplateEdit(editingTemplateId, deletedTemplateId)) {
        clearTemplateEditState();
      }
      setTemplateFeedback({ type: "success", message: "提示词已删除。" });
      onClearError();
    } catch (error) {
      const feedback = customTemplateErrorFeedback(error, "删除提示词失败");
      setTemplateFeedback(feedback);
      onError(feedback.message);
    }
  }, [clearTemplateEditState, editingTemplateId, onClearError, onError, setCustomTemplates, setTemplateFeedback]);

  const saveCustomTemplate = useCallback(async () => {
    try {
      const result = await saveCustomTemplateDraft({
        apiClient: api,
        editingTemplateId,
        labelInput: templateDraftLabel,
        studioForm,
        titleInput: templateDraftTitle,
        workspaceName,
      });
      if (result.status === "invalid") {
        setTemplateFeedback(result.feedback);
        onError(result.errorMessage);
        return;
      }

      setCustomTemplates((current) => upsertCustomTemplate(current, result.template));
      completeTemplateSave(result.template.id, result.feedback);
      onClearError();
    } catch (error) {
      const feedback = customTemplateErrorFeedback(error, "保存提示词失败");
      setTemplateFeedback(feedback);
      onError(feedback.message);
    }
  }, [
    editingTemplateId,
    completeTemplateSave,
    onClearError,
    onError,
    setCustomTemplates,
    setTemplateFeedback,
    studioForm,
    templateDraftLabel,
    templateDraftTitle,
    workspaceName,
  ]);

  return {
    deleteCustomTemplate,
    saveCustomTemplate,
  };
}
