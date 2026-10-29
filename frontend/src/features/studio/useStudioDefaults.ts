import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";

import type { Project, PromptTemplateRecord, Provider } from "../../api";
import { pickPreferredStudioProvider } from "./studioProviderDefaults";
import type { StudioFormState } from "./studioTypes";

type UseStudioDefaultsOptions = {
  availableProviders: Provider[];
  currentUserName: string | undefined;
  projects: Project[];
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
  sharedTemplates: PromptTemplateRecord[];
  studioForm: StudioFormState;
  onApplyTemplate: (
    template: PromptTemplateRecord,
    options?: { closeMenu?: boolean; preserveResolution?: boolean }
  ) => void;
};

export function useStudioDefaults({
  availableProviders,
  currentUserName,
  projects,
  setStudioForm,
  sharedTemplates,
  studioForm,
  onApplyTemplate,
}: UseStudioDefaultsOptions) {
  const hasAppliedInitialTemplateRef = useRef(false);

  useEffect(() => {
    hasAppliedInitialTemplateRef.current = false;
  }, [currentUserName]);

  useEffect(() => {
    if (sharedTemplates.length === 0) return;
    if (hasAppliedInitialTemplateRef.current) return;
    if (studioForm.title.trim() || studioForm.prompt.trim()) return;
    hasAppliedInitialTemplateRef.current = true;
    // Keep product default resolution (1K); do not inherit template 2K on cold start.
    onApplyTemplate(sharedTemplates[0], {
      closeMenu: false,
      preserveResolution: true,
      bindTemplate: false,
    });
  }, [onApplyTemplate, sharedTemplates, studioForm.prompt, studioForm.title]);

  useEffect(() => {
    if (availableProviders.length === 0) return;
    if (!availableProviders.some((provider) => provider.provider_name === studioForm.requestedProvider)) {
      const preferred = pickPreferredStudioProvider(availableProviders, studioForm.creationMode);
      if (!preferred) return;
      setStudioForm((current) => ({
        ...current,
        requestedProvider: preferred.provider_name,
      }));
    }
  }, [
    availableProviders,
    setStudioForm,
    studioForm.creationMode,
    studioForm.requestedProvider,
  ]);

  useEffect(() => {
    if (projects.length === 0) return;
    if (projects.some((project) => project.code === studioForm.projectCode)) return;
    const nextProject = projects[0];

    setStudioForm((current) => {
      if (current.projectCode !== studioForm.projectCode || projects.some((project) => project.code === current.projectCode)) return current;
      return { ...current, projectCode: nextProject.code, classification: nextProject.classification };
    });
  }, [projects, setStudioForm, studioForm.projectCode]);
}
