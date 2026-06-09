import { type Dispatch, type SetStateAction, useState } from "react";

import type {
  ComposerMenuKey,
  CustomPromptTemplate,
  StudioFormState,
} from "./studioTypes";
import { sortTemplatesByUpdatedAt } from "./studioUtils";
import { useCustomStudioTemplateEditorState } from "./useCustomStudioTemplateEditorState";
import { useCustomStudioTemplateMutations } from "./useCustomStudioTemplateMutations";

type UseCustomStudioTemplatesOptions = {
  onClearError: () => void;
  onError: (message: string) => void;
  setActiveComposerMenu: Dispatch<SetStateAction<ComposerMenuKey>>;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
  studioForm: StudioFormState;
  workspaceName: string;
};

export function useCustomStudioTemplates({
  onClearError,
  onError,
  setActiveComposerMenu,
  setStudioForm,
  studioForm,
  workspaceName,
}: UseCustomStudioTemplatesOptions) {
  const [customTemplates, setCustomTemplates] = useState<CustomPromptTemplate[]>([]);
  const templateEditor = useCustomStudioTemplateEditorState({
    setActiveComposerMenu,
    setStudioForm,
    studioForm,
  });
  const {
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
  } = templateEditor;
  const { deleteCustomTemplate, saveCustomTemplate } = useCustomStudioTemplateMutations({
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
  });

  return {
    cancelTemplateEdit,
    clearFeedback,
    clearTemplateEditState,
    customTemplates,
    deleteCustomTemplate,
    editingTemplateId,
    editCustomTemplate,
    saveCustomTemplate,
    setCustomTemplates: (templates: CustomPromptTemplate[]) =>
      setCustomTemplates(sortTemplatesByUpdatedAt(templates)),
    setTemplateDraftLabel,
    setTemplateDraftTitle,
    syncTemplateDraftWithCurrentForm,
    templateDraftLabel,
    templateDraftTitle,
    templateFeedback,
  };
}
