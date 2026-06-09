import { type Dispatch, type SetStateAction, useCallback, useState } from "react";

import type { PromptTemplateRecord } from "../../api";
import type {
  ComposerMenuKey,
  CustomPromptTemplate,
  StudioFormState,
  TemplateFeedback,
} from "./studioTypes";
import {
  applyTemplateToForm,
  toTemplateFormValue,
} from "./studioUtils";

type UseCustomStudioTemplateEditorStateOptions = {
  setActiveComposerMenu: Dispatch<SetStateAction<ComposerMenuKey>>;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
  studioForm: StudioFormState;
};

export function useCustomStudioTemplateEditorState({
  setActiveComposerMenu,
  setStudioForm,
  studioForm,
}: UseCustomStudioTemplateEditorStateOptions) {
  const [templateFeedback, setTemplateFeedback] = useState<TemplateFeedback | null>(null);
  const [templateDraftLabel, setTemplateDraftLabel] = useState("");
  const [templateDraftTitle, setTemplateDraftTitle] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [templateEditSnapshot, setTemplateEditSnapshot] = useState<StudioFormState | null>(null);

  const clearFeedback = useCallback(() => {
    setTemplateFeedback(null);
  }, []);

  const resetTemplateDraft = useCallback(() => {
    setTemplateDraftLabel("");
    setTemplateDraftTitle("");
  }, []);

  const clearTemplateEditState = useCallback(() => {
    setEditingTemplateId(null);
    setTemplateEditSnapshot(null);
    setTemplateFeedback(null);
    resetTemplateDraft();
  }, [resetTemplateDraft]);

  const syncTemplateDraftWithCurrentForm = useCallback((activeTemplate: PromptTemplateRecord | null) => {
    setTemplateDraftLabel(activeTemplate?.label ?? "");
    setTemplateDraftTitle(studioForm.title);
  }, [studioForm.title]);

  const editCustomTemplate = useCallback((template: CustomPromptTemplate) => {
    setTemplateEditSnapshot(studioForm);
    setEditingTemplateId(template.id);
    setTemplateDraftLabel(template.label);
    setTemplateDraftTitle(template.title);
    setTemplateFeedback(null);
    setStudioForm((current) => applyTemplateToForm(toTemplateFormValue(template), current));
    setActiveComposerMenu("template");
  }, [setActiveComposerMenu, setStudioForm, studioForm]);

  const cancelTemplateEdit = useCallback(() => {
    setEditingTemplateId(null);
    if (templateEditSnapshot) {
      setStudioForm(templateEditSnapshot);
    }
    setTemplateEditSnapshot(null);
    setTemplateFeedback(null);
    resetTemplateDraft();
  }, [resetTemplateDraft, setStudioForm, templateEditSnapshot]);

  const completeTemplateSave = useCallback((templateId: number, feedback: TemplateFeedback) => {
    setEditingTemplateId(templateId);
    setTemplateEditSnapshot(null);
    setTemplateFeedback(feedback);
  }, []);

  return {
    cancelTemplateEdit,
    clearFeedback,
    clearTemplateEditState,
    completeTemplateSave,
    editingTemplateId,
    editCustomTemplate,
    setTemplateDraftLabel,
    setTemplateDraftTitle,
    setTemplateFeedback,
    syncTemplateDraftWithCurrentForm,
    templateDraftLabel,
    templateDraftTitle,
    templateFeedback,
  };
}
