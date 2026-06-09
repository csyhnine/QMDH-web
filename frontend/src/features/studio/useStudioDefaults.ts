import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";

import type { Project, PromptTemplateRecord, Provider } from "../../api";
import type { StudioFormState } from "./studioTypes";

type UseStudioDefaultsOptions = {
  availableProviders: Provider[];
  currentUserName: string | undefined;
  projects: Project[];
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
  sharedTemplates: PromptTemplateRecord[];
  studioForm: StudioFormState;
  onApplyTemplate: (template: PromptTemplateRecord, options?: { closeMenu?: boolean }) => void;
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
    onApplyTemplate(sharedTemplates[0], { closeMenu: false });
  }, [onApplyTemplate, sharedTemplates, studioForm.prompt, studioForm.title]);

  useEffect(() => {
    if (availableProviders.length === 0) return;
    if (!availableProviders.some((provider) => provider.provider_name === studioForm.requestedProvider)) {
      setStudioForm((current) => ({
        ...current,
        requestedProvider: availableProviders[0].provider_name
      }));
    }
  }, [availableProviders, setStudioForm, studioForm.requestedProvider]);

  useEffect(() => {
    if (projects.length === 0) return;
    if (projects.some((project) => project.code === studioForm.projectCode)) return;
    const nextProject = projects[0];

    setStudioForm((current) => ({
      ...current,
      projectCode: nextProject.code,
      classification: nextProject.classification
    }));
  }, [projects, setStudioForm, studioForm.projectCode]);
}
