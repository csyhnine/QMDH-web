import type { PromptTemplateRecord, Provider, Task, TaskCreatePayload } from "../../api";
import { defaultStudioForm } from "./studioConstants";
import type { StudioFormState, SubmissionTracker } from "./studioTypes";
import { buildImagePayload, buildVideoPayload, clampImageCount, deriveTaskTitleFromPrompt, getStudioWorkflowKeyForProvider } from "./studioUtils";

type BuildTaskSubmissionPayloadOptions = {
  form: StudioFormState;
  provider: Provider;
};

type BuildPendingSubmissionTrackerOptions = BuildTaskSubmissionPayloadOptions & {
  referenceImageCount: number;
  taskTitle: string;
};

type BuildCreatedSubmissionTrackerOptions = BuildPendingSubmissionTrackerOptions & {
  task: Task;
};

export type TaskSubmissionDraft = {
  payload: TaskCreatePayload;
  taskTitle: string;
  workflowKey: string;
};

export type TrackPromptTemplateEvent = (
  templateId: number,
  payload: { event_type: string; context: string }
) => Promise<void>;

export function buildTaskSubmissionPayload({
  form,
  provider,
}: BuildTaskSubmissionPayloadOptions): TaskSubmissionDraft {
  const workflowKey = getStudioWorkflowKeyForProvider(provider, form.creationMode);
  const taskTitle = deriveTaskTitleFromPrompt(
    form.prompt,
    form.title.trim() || defaultStudioForm.title
  );

  return {
    taskTitle,
    workflowKey,
    payload: {
      title: taskTitle,
      workflow_key: workflowKey,
      project_code: form.projectCode,
      requested_provider: provider.provider_name,
      classification: form.classification,
      payload:
        form.creationMode === "video" ? buildVideoPayload(form, provider) : buildImagePayload(form, workflowKey),
    },
  };
}

export function buildPendingSubmissionTracker({
  form,
  provider,
  referenceImageCount,
  taskTitle,
}: BuildPendingSubmissionTrackerOptions): SubmissionTracker {
  return {
    taskId: null,
    taskTitle,
    providerName: provider.display_name ?? provider.model_name ?? form.requestedProvider,
    imageCount: form.creationMode === "video" ? 1 : clampImageCount(form.imageCount),
    hasReferenceImage: referenceImageCount > 0,
    stage: "submitting",
  };
}

export function buildCreatedSubmissionTracker({
  form,
  provider,
  referenceImageCount,
  task,
}: BuildCreatedSubmissionTrackerOptions): SubmissionTracker {
  return {
    taskId: task.id,
    taskTitle: task.title,
    providerName: provider.display_name ?? provider.model_name ?? task.requested_provider,
    imageCount:
      form.creationMode === "video"
        ? 1
        : clampImageCount(Number(task.result["requested_video_count"] ?? task.result["requested_image_count"] ?? form.imageCount)),
    hasReferenceImage: Boolean(task.result["reference_image_supplied"] ?? referenceImageCount > 0),
    stage: task.status === "running" ? "running" : "pending",
  };
}

export function trackSharedTemplateSubmitSuccess(
  activeTemplate: PromptTemplateRecord | null,
  trackEvent: TrackPromptTemplateEvent
) {
  if (activeTemplate?.scope !== "shared") {
    return;
  }

  void trackEvent(activeTemplate.id, {
    event_type: "submit_success",
    context: "studio",
  }).catch(() => undefined);
}
