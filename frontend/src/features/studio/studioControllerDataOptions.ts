import type { StudioDerivedState } from "./studioDerivedState";
import type { useStudioAuth } from "./useStudioAuth";
import type { useStudioControllerState } from "./useStudioControllerState";
import type { useStudioDataLoader } from "./useStudioDataLoader";
import type { useStudioProjects } from "./useStudioProjects";
import type { useStudioTemplates } from "./useStudioTemplates";

type ControllerState = ReturnType<typeof useStudioControllerState>;
type StudioAuthState = ReturnType<typeof useStudioAuth>;
type StudioTemplatesState = ReturnType<typeof useStudioTemplates>;
type StudioDataLoaderState = ReturnType<typeof useStudioDataLoader>;

export function buildStudioTemplatesOptions({
  controllerState,
  workspaceName,
}: {
  controllerState: ControllerState;
  workspaceName: StudioDerivedState["workspaceName"];
}): Parameters<typeof useStudioTemplates>[0] {
  return {
    onClearError: controllerState.clearLoadError,
    onError: controllerState.pushLoadError,
    setActiveComposerMenu: controllerState.setActiveComposerMenu,
    setStudioForm: controllerState.setStudioForm,
    studioForm: controllerState.studioForm,
    workspaceName,
  };
}

export function buildStudioDataLoaderOptions({
  controllerState,
  currentUser,
  studioTemplates,
}: {
  controllerState: ControllerState;
  currentUser: StudioAuthState["currentUser"];
  studioTemplates: Pick<StudioTemplatesState, "setPromptTemplates">;
}): Parameters<typeof useStudioDataLoader>[0] {
  return {
    currentUser,
    setPromptTemplates: studioTemplates.setPromptTemplates,
    setState: controllerState.setState,
    tasks: controllerState.state.tasks,
    projects: controllerState.state.projects,
  };
}

export function buildStudioProjectsOptions({
  controllerState,
  studioData,
}: {
  controllerState: ControllerState;
  studioData: Pick<StudioDataLoaderState, "getProjects" | "applyProjectMutation" | "refreshProjects">;
}): Parameters<typeof useStudioProjects>[0] {
  return {
    getProjects: studioData.getProjects,
    applyProjectMutation: studioData.applyProjectMutation,
    refreshProjects: studioData.refreshProjects,
    onError: (message, isCurrent = () => true) => controllerState.setState((current) =>
      isCurrent() ? { ...current, error: message } : current
    ),
    selectedProjectCode: controllerState.studioForm.projectCode,
    setStudioForm: controllerState.setStudioForm,
  };
}
