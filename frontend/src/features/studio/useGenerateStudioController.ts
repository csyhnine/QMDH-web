import {
  buildStudioControllerResult,
  buildStudioControllerSubmissionProgress,
} from "./studioControllerProps";
import {
  buildStudioDataLoaderOptions,
  buildStudioProjectsOptions,
  buildStudioReferenceUploadOptions,
  buildStudioTaskActionsOptions,
  buildStudioTemplatesOptions,
  buildStudioViewEffectsOptions,
} from "./studioControllerHookOptions";
import { deriveStudioViewState } from "./studioDerivedState";
import { useStudioAuth } from "./useStudioAuth";
import { useStudioControllerState } from "./useStudioControllerState";
import { useStudioDataLoader } from "./useStudioDataLoader";
import { useStudioGalleryActions } from "./useStudioGalleryActions";
import { useStudioHistoryFeedback } from "./useStudioHistoryFeedback";
import { useStudioProjects } from "./useStudioProjects";
import { useStudioReferenceUploads } from "./useStudioReferenceUploads";
import { useStudioTaskActions } from "./useStudioTaskActions";
import { useStudioTemplates } from "./useStudioTemplates";
import { useStudioViewEffects } from "./useStudioViewEffects";

export type GenerateStudioController = ReturnType<typeof useGenerateStudioController>;

export function useGenerateStudioController() {
  const controllerState = useStudioControllerState();
  const { filters, resetLoadState, state, studioForm, submissionTracker, submitting } = controllerState;
  const studioAuth = useStudioAuth({
    onLogout: resetLoadState,
  });
  const { currentUser } = studioAuth;
  const historyFeedback = useStudioHistoryFeedback();

  const derivedState = deriveStudioViewState({
    providers: state.providers,
    projects: state.projects,
    workflows: state.workflows,
    assets: state.assets,
    tasks: state.tasks,
    studioForm,
    filters,
  });
  const { availableProviders, hasFilteredHistory, latestTask, selectedProvider, workspaceName } = derivedState;
  const studioTemplates = useStudioTemplates(buildStudioTemplatesOptions({ controllerState, workspaceName }));
  const studioData = useStudioDataLoader(buildStudioDataLoaderOptions({
    controllerState,
    currentUser,
    studioTemplates,
  }));
  const studioProjects = useStudioProjects(buildStudioProjectsOptions({ controllerState, studioData }));
  const referenceUpload = useStudioReferenceUploads(
    buildStudioReferenceUploadOptions({ controllerState, selectedProvider })
  );
  const galleryActions = useStudioGalleryActions({
    historyFeedback,
    setGalleryPreview: controllerState.setGalleryPreview,
    setState: controllerState.setState,
  });
  const studioView = useStudioViewEffects(buildStudioViewEffectsOptions({
    controllerState,
    currentUser,
    derivedState,
    referenceUpload,
    studioTemplates,
  }));
  const taskActions = useStudioTaskActions(buildStudioTaskActionsOptions({
    controllerState,
    historyFeedback,
    referenceUpload,
    studioData,
    studioTemplates,
    studioView,
  }));

  const submissionProgress = buildStudioControllerSubmissionProgress({
    referenceUpload,
    state,
    submissionTracker,
    submitting,
  });

  return buildStudioControllerResult({
    controllerState,
    derivedState,
    galleryActions,
    historyFeedback,
    referenceUpload,
    studioAuth,
    studioData,
    studioProjects,
    studioTemplates,
    studioView,
    submissionProgress,
    taskActions,
  });
}
