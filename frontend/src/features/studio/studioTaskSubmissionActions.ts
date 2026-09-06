import type { PromptTemplateRecord, Provider, Task, TaskCreatePayload } from "../../api";
import { defaultStudioForm } from "./studioConstants";
import { publicProviderDisplayName } from "./modelAdminUtils";
import { resolveBoundTemplateId } from "./studioTemplateBindingUtils";
import type { StudioFormState, SubmissionTracker } from "./studioTypes";
import { buildImagePayload, buildVideoPayload, clampImageCount, deriveTaskTitleFromPrompt, getStudioWorkflowKeyForProvider } from "./studioUtils";

type BuildTaskSubmissionPayloadOptions = {
  form: StudioFormState;
  provider: Provider;
  referenceUploads?: import("./studioTypes").ReferenceUploadItem[];
  sourceSurface?: "studio" | "canvas";
  canvasNodeId?: string;
  workflowType?: string;
  promptPolished?: boolean;
  templates?: PromptTemplateRecord[];
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
  referenceUploads,
  sourceSurface = "studio",
  canvasNodeId,
  workflowType,
  promptPolished = false,
  templates = [],
}: BuildTaskSubmissionPayloadOptions): TaskSubmissionDraft {
  const workflowKey = getStudioWorkflowKeyForProvider(provider, form.creationMode);
  const taskTitle = deriveTaskTitleFromPrompt(form.prompt, form.title.trim() || defaultStudioForm.title);
  const taskPayload =
    form.creationMode === "video"
      ? buildVideoPayload(form, provider, referenceUploads)
      : buildImagePayload(form, workflowKey);
  const templateId = templates.length > 0 ? resolveBoundTemplateId(form, templates) : form.activeTemplateId ?? undefined;

  return {
    taskTitle,
    workflowKey,
    payload: {
      title: taskTitle,
      workflow_key: workflowKey,
      project_code: form.projectCode,
      requested_provider: provider.provider_name,
      classification: form.classification,
      payload: taskPayload,
      template_id: templateId,
      source_surface: sourceSurface,
      canvas_node_id: canvasNodeId,
      workflow_type: workflowType,
      prompt_polished: promptPolished || form.promptPolished,
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
    providerName: publicProviderDisplayName(provider),
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
    providerName: publicProviderDisplayName(provider),
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
