import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from "react";

import type { PromptTemplateRecord } from "../../api";
import type {
  ComposerMenuKey,
  SharedPromptTemplate,
  StudioFormState,
} from "./studioTypes";
import {
  applyTemplateToForm,
  sortTemplatesByUpdatedAt,
  toTemplateFormValue,
} from "./studioUtils";
import { useCustomStudioTemplates } from "./useCustomStudioTemplates";

type UseStudioTemplatesOptions = {
  onClearError: () => void;
  onError: (message: string) => void;
  setActiveComposerMenu: Dispatch<SetStateAction<ComposerMenuKey>>;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
  studioForm: StudioFormState;
  workspaceName: string;
};

type ApplyTemplateOptions = {
  closeMenu?: boolean;
};

export type StudioTemplatesState = ReturnType<typeof useStudioTemplates>;

export function useStudioTemplates({
  onClearError,
  onError,
  setActiveComposerMenu,
  setStudioForm,
  studioForm,
  workspaceName,
}: UseStudioTemplatesOptions) {
  const [sharedTemplates, setSharedTemplates] = useState<SharedPromptTemplate[]>([]);
  const {
    cancelTemplateEdit,
    clearFeedback,
    clearTemplateEditState,
    customTemplates,
    deleteCustomTemplate,
    editingTemplateId,
    editCustomTemplate,
    saveCustomTemplate,
    setCustomTemplates,
    setTemplateDraftLabel,
    setTemplateDraftTitle,
    syncTemplateDraftWithCurrentForm: syncCustomTemplateDraftWithCurrentForm,
    templateDraftLabel,
    templateDraftTitle,
    templateFeedback,
  } = useCustomStudioTemplates({
    onClearError,
    onError,
    setActiveComposerMenu,
    setStudioForm,
    studioForm,
    workspaceName,
  });

  const activeTemplate =
    useMemo(
      () =>
        [...sharedTemplates, ...customTemplates].find(
          (template) => template.title === studioForm.title && template.prompt === studioForm.prompt
        ) ?? null,
      [customTemplates, sharedTemplates, studioForm.prompt, studioForm.title]
    );

  const setPromptTemplates = useCallback((templates: PromptTemplateRecord[]) => {
    setSharedTemplates(sortTemplatesByUpdatedAt(templates.filter((template) => template.scope === "shared")));
    setCustomTemplates(sortTemplatesByUpdatedAt(templates.filter((template) => template.scope === "private")));
  }, [setCustomTemplates]);

  const syncTemplateDraftWithCurrentForm = useCallback(() => {
    syncCustomTemplateDraftWithCurrentForm(activeTemplate);
  }, [activeTemplate, syncCustomTemplateDraftWithCurrentForm]);

  const applyTemplate = useCallback((template: PromptTemplateRecord, options: ApplyTemplateOptions = {}) => {
    const { closeMenu = true } = options;
    const nextTemplate = toTemplateFormValue(template);
    clearFeedback();
    setStudioForm((current) => applyTemplateToForm(nextTemplate, current));
    if (closeMenu) {
      setActiveComposerMenu(null);
    }
  }, [clearFeedback, setActiveComposerMenu, setStudioForm]);

  return {
    activeTemplate,
    applyTemplate,
    cancelTemplateEdit,
    clearFeedback,
    clearTemplateEditState,
    customTemplates,
    deleteCustomTemplate,
    editingTemplateId,
    editCustomTemplate,
    saveCustomTemplate,
    setPromptTemplates,
    setTemplateDraftLabel,
    setTemplateDraftTitle,
    sharedTemplates,
    syncTemplateDraftWithCurrentForm,
    templateDraftLabel,
    templateDraftTitle,
    templateFeedback,
  };
}
