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
  };
}

export function buildStudioProjectsOptions({
  controllerState,
  studioData,
}: {
  controllerState: ControllerState;
  studioData: Pick<StudioDataLoaderState, "loadData">;
}): Parameters<typeof useStudioProjects>[0] {
  return {
    loadData: () => studioData.loadData(),
    onError: controllerState.pushLoadError,
    projects: controllerState.state.projects,
    selectedProjectCode: controllerState.studioForm.projectCode,
    setStudioForm: controllerState.setStudioForm,
  };
}
