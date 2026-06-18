import type { Asset, Project, Provider, Task, Workflow } from "../../api";
import type { FeedFilterState } from "./studioHistoryPaneTypes";
import { filterGrokVideoProviders } from "./grokVideoUtils";
import { groupProviders, isRuntimeStudioProvider } from "./modelAdminUtils";
import {
  IMAGE_EDIT_WORKFLOW_KEY,
  IMAGE_UPSCALE_WORKFLOW_KEY,
  IMAGE_WORKFLOW_KEY,
  VIDEO_WORKFLOW_KEY,
  resolutionOptions,
  stylePresets,
} from "./studioConstants";
import type { StudioFormState } from "./studioTypes";
import { getStudioWorkflowKeyForProvider } from "./studioUtils";

type DeriveStudioViewStateInput = {
  providers: Provider[];
  projects: Project[];
  workflows: Workflow[];
  assets: Asset[];
  tasks: Task[];
  studioForm: StudioFormState;
  filters: FeedFilterState;
};

export function deriveStudioViewState({
  providers,
  projects,
  workflows,
  assets,
  tasks,
  studioForm,
  filters,
}: DeriveStudioViewStateInput) {
  const availableProviders = filterGrokVideoProviders(
    providers.filter(
      (provider) =>
        isRuntimeStudioProvider(provider, studioForm.creationMode) &&
        provider.capabilities.some((capability) => {
          if (studioForm.creationMode === "video") return capability === "video.generate";
          if (studioForm.creationMode === "edit") return capability === "image.edit";
          return capability === "image.generate";
        })
    )
  );
  const providerGroups = groupProviders(availableProviders);

  const activeProject = projects.find((project) => project.code === studioForm.projectCode);
  const workspaceName = activeProject?.name ?? "我的创作";
  const selectedProvider = availableProviders.find(
    (provider) => provider.provider_name === studioForm.requestedProvider
  );
  const providerDisplayNameMap = new Map(
    providers.map((provider) => [
      provider.provider_name,
      provider.display_name || provider.model_name || provider.provider_name,
    ])
  );
  const selectedWorkflowKey = getStudioWorkflowKeyForProvider(selectedProvider, studioForm.creationMode);
  const selectedWorkflow = workflows.find((workflow) => workflow.key === selectedWorkflowKey);
  const selectedStyle = stylePresets.find((preset) => preset.id === studioForm.style);
  const selectedResolution = resolutionOptions.find((option) => option.id === studioForm.resolution);

  const scopedAssetType = studioForm.creationMode === "video" ? "video" : "image";
  const scopedAssets = assets.filter((asset) => asset.asset_type === scopedAssetType);
  const scopedTasks = tasks.filter((task) => {
    if (task.project_code !== studioForm.projectCode) return false;
    if (studioForm.creationMode === "video") return task.workflow_key === VIDEO_WORKFLOW_KEY;
    return (
      task.workflow_key === IMAGE_WORKFLOW_KEY ||
      task.workflow_key === IMAGE_EDIT_WORKFLOW_KEY ||
      task.workflow_key === IMAGE_UPSCALE_WORKFLOW_KEY
    );
  });
  const assetsByTaskId = scopedAssets.reduce((map, asset) => {
    if (asset.source_task_id === null) return map;
    const current = map.get(asset.source_task_id) ?? [];
    current.push(asset);
    map.set(asset.source_task_id, current);
    return map;
  }, new Map<number, Asset[]>());

  const filteredTasks = [...scopedTasks]
    .filter((task) => {
      if (filters.status === "running") {
        return task.status === "pending" || task.status === "running";
      }
      if (filters.status === "completed") {
        return task.status === "completed";
      }
      return true;
    })
    .filter((task) => (filters.provider === "all" ? true : task.requested_provider === filters.provider))
    .sort((left, right) => {
      const leftTime = new Date(left.created_at).getTime();
      const rightTime = new Date(right.created_at).getTime();
      return filters.sort === "latest" ? rightTime - leftTime : leftTime - rightTime;
    });

  const latestTask =
    filteredTasks.length > 0
      ? filteredTasks.reduce((currentLatest, task) =>
          new Date(task.created_at).getTime() > new Date(currentLatest.created_at).getTime()
            ? task
            : currentLatest
        )
      : null;

  return {
    activeProject,
    availableProviders,
    filteredTasks,
    hasFilteredHistory: filteredTasks.length > 0,
    hasProjectHistory: scopedTasks.length > 0,
    imageAssetsByTaskId: assetsByTaskId,
    latestTask,
    providerDisplayNameMap,
    providerGroups,
    selectedProvider,
    selectedResolution,
    selectedStyle,
    selectedWorkflow,
    workspaceName,
  };
}

export type StudioDerivedState = ReturnType<typeof deriveStudioViewState>;
