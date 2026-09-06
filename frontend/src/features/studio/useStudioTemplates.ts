import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from "react";

import type { PromptTemplateRecord } from "../../api";
import type {
  ComposerMenuKey,
  SharedPromptTemplate,
  StudioFormState,
} from "./studioTypes";
import { findBoundTemplate } from "./studioTemplateBindingUtils";
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
  /** Keep current form resolution (used for cold-start auto-apply so default stays 1K). */
  preserveResolution?: boolean;
  /** When false, prefill fields only — do not bind template_id for analytics until user picks a template. */
  bindTemplate?: boolean;
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

  const allTemplates = useMemo(
    () => [...sharedTemplates, ...customTemplates],
    [customTemplates, sharedTemplates]
  );

  const activeTemplate = useMemo(
    () => findBoundTemplate(studioForm, allTemplates),
    [allTemplates, studioForm]
  );

  const setPromptTemplates = useCallback((templates: PromptTemplateRecord[]) => {
    setSharedTemplates(sortTemplatesByUpdatedAt(templates.filter((template) => template.scope === "shared")));
    setCustomTemplates(sortTemplatesByUpdatedAt(templates.filter((template) => template.scope === "private")));
  }, [setCustomTemplates]);

  const syncTemplateDraftWithCurrentForm = useCallback(() => {
    syncCustomTemplateDraftWithCurrentForm(activeTemplate);
  }, [activeTemplate, syncCustomTemplateDraftWithCurrentForm]);

  const applyTemplate = useCallback((template: PromptTemplateRecord, options: ApplyTemplateOptions = {}) => {
    const { closeMenu = true, preserveResolution = false, bindTemplate = true } = options;
    const nextTemplate = toTemplateFormValue(template);
    clearFeedback();
    setStudioForm((current) => {
      const next = applyTemplateToForm(nextTemplate, current);
      const merged = preserveResolution ? { ...next, resolution: current.resolution } : next;
      return { ...merged, activeTemplateId: bindTemplate ? template.id : null };
    });
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
