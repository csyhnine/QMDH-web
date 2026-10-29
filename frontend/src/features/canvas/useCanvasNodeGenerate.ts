import { useCallback, useEffect, useRef } from "react";
import { CanvasAsyncScope, canvasNodeInput, waitCanvasObservation, type CanvasTaskObservation, type CanvasAsyncOperation } from "./canvasAsyncScope";
import type { Edge } from "@xyflow/react";

import { api, type Provider, type Task } from "../../api";
import { defaultStudioForm, IMAGE_UPSCALE_WORKFLOW_KEY } from "../studio/studioConstants";
import {
  creationModeForNodeKind,
  defaultAspectRatioFor,
  resolveAspectRatioForSurface,
} from "../studio/studioCanvasLinkage";
import { findUpscaleProvider } from "../studio/studioUpscaleActions";
import { resolveStudioProviderForForm } from "../studio/studioTaskFormUtils";
import { buildTaskSubmissionPayload } from "../studio/studioTaskSubmissionActions";
import type { StudioFormState } from "../studio/studioTypes";
import { collectUpstreamDeliverables, resolveCanvasInputReferenceImages } from "./canvasGraphUtils";
import type { CanvasFlowNode, GenerateNodeData } from "./canvasTypes";
import { isGenerateNode } from "./canvasTypes";

export type CanvasGenerateOptions = { regenerate?: boolean };

export type PatchNodeOptions = { recordHistory?: boolean; isCurrent?: () => boolean; expectedData?: GenerateNodeData };

export type PatchNode = (
  nodeId: string,
  patch: Partial<GenerateNodeData>,
  options?: PatchNodeOptions
) => void;

function observedPatch(patchNode: PatchNode, observation?: CanvasTaskObservation): PatchNode {
  return (nodeId, patch, options) => {
    const current = () => (observation?.current() ?? true) && (options?.isCurrent?.() ?? true);
    if (current()) patchNode(nodeId, patch, { ...options, isCurrent: current });
  };
}

/** Soft client wait budget before surfacing「拉取结果」. */
const POLL_DEADLINE_MS = 15 * 60 * 1000;
const POLL_FAST_WINDOW_MS = 3 * 60 * 1000;
const POLL_FAST_INTERVAL_MS = 2000;
const POLL_SLOW_INTERVAL_MS = 5000;

const WAIT_TIMEOUT_MESSAGE = "等待较久，可点击「拉取结果」同步；也可在生成页查看任务。";
const LEGACY_WAIT_TIMEOUT_HINT = "等待超时";

function collectResultUrls(result: Record<string, unknown> | null | undefined): string[] {
  if (!result) return [];
  const urls: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const path = value.trim();
    if (path && !urls.includes(path)) urls.push(path);
  };

  const listKeys = ["asset_storage_paths", "storage_paths"] as const;
  for (const key of listKeys) {
    const raw = result[key];
    if (Array.isArray(raw)) raw.forEach(push);
  }
  push(result.asset_storage_path);
  push(result.storage_path);
  return urls;
}

function failureMessage(task: Task): string {
  if (typeof task.result?.error === "string") return task.result.error;
  if (typeof task.result?.message === "string") return task.result.message;
  if (typeof task.result?.error_summary === "string") return task.result.error_summary;
  return "生成失败，请重试";
}

function resolveTaskDurationMs(data: GenerateNodeData, task: Task): number | undefined {
  const startedAt = data.taskStartedAt ?? new Date(task.created_at).getTime();
  if (Number.isNaN(startedAt)) return undefined;
  const endedAt = task.updated_at ? new Date(task.updated_at).getTime() : Date.now();
  if (Number.isNaN(endedAt)) return Math.max(0, Date.now() - startedAt);
  return Math.max(0, endedAt - startedAt);
}

export function isClientWaitTimeoutMessage(message: string | undefined): boolean {
  const text = (message || "").trim();
  if (!text) return false;
  return text.includes(LEGACY_WAIT_TIMEOUT_HINT) || text.includes("拉取结果");
}

/** Nodes that still have a live Studio task to attach to (no new createTask). */
export function canSyncCanvasNodeTask(data: Pick<GenerateNodeData, "taskId" | "status" | "errorMessage">): boolean {
  if (typeof data.taskId !== "number") return false;
  if (data.status === "awaiting_result") return true;
  if (data.status === "failed" && isClientWaitTimeoutMessage(data.errorMessage)) return true;
  return false;
}

export function isResumableCanvasNodeTask(
  data: Pick<GenerateNodeData, "taskId" | "status" | "errorMessage">
): boolean {
  if (typeof data.taskId !== "number") return false;
  if (
    data.status === "pending" ||
    data.status === "running" ||
    data.status === "submitting" ||
    data.status === "awaiting_result"
  ) {
    return true;
  }
  return data.status === "failed" && isClientWaitTimeoutMessage(data.errorMessage);
}

async function resolveCompletedUrls(task: Task, wantedType: "image" | "video", observation?: CanvasTaskObservation): Promise<string[]> {
  if (observation && !observation.current()) return [];
  const fromResult = collectResultUrls(task.result);
  if (fromResult.length > 0) return fromResult;

  try {
    const assets = await api.assets();
    if (observation && !observation.current()) return [];
    return assets
      .filter(
        (asset) =>
          asset.source_task_id === task.id &&
          (asset.asset_type === wantedType || asset.asset_type === "image")
      )
      .map((asset) => asset.storage_path)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function pollTaskUntilDone(
  taskId: number, nodeId: string, patchNode: PatchNode, wantedType: "image" | "video", observation?: CanvasTaskObservation
) {
  const current = () => observation?.current() ?? true;
  patchNode = observedPatch(patchNode, observation);
  if (!current()) return;
  let lastBusyStatus: GenerateNodeData["status"] | "" = "";
  let startedAt = Date.now(), attempt = 0, softNotified = false;
  try {
    const initial = await api.getTask(taskId);
    if (!current() || initial.id !== taskId) return;
    const createdAtMs = new Date(initial.created_at).getTime();
    if (!Number.isNaN(createdAtMs)) { startedAt = createdAtMs; patchNode(nodeId, { taskStartedAt: createdAtMs, taskId }); }
  } catch { if (!current()) return; patchNode(nodeId, { taskStartedAt: startedAt, taskId }); }
  // Stopping this observer never cancels the already accepted server task.
  while (current()) {
    if (attempt > 0 && !await waitCanvasObservation(Date.now() - startedAt < POLL_FAST_WINDOW_MS ? POLL_FAST_INTERVAL_MS : POLL_SLOW_INTERVAL_MS, observation)) return;
    if (!current()) return;
    attempt += 1;
    if (!softNotified && Date.now() - startedAt >= POLL_DEADLINE_MS) {
      softNotified = true; lastBusyStatus = "awaiting_result";
      patchNode(nodeId, { status: "awaiting_result", errorMessage: WAIT_TIMEOUT_MESSAGE, taskId });
    }
    let latest: Task;
    try { latest = await api.getTask(taskId); }
    catch {
      if (!current()) return;
      try { const tasks = await api.tasks(); if (!current()) return; const found = tasks.find(item => item.id === taskId); if (!found) continue; latest = found; }
      catch { if (!current()) return; continue; }
    }
    if (!current() || latest.id !== taskId) return;
    if (latest.status === "failed") {
      patchNode(nodeId, { status: "failed", errorMessage: failureMessage(latest), taskId, taskDurationMs: Math.max(0, Date.now() - startedAt) }); return;
    }
    if (latest.status === "completed") {
      let urls = await resolveCompletedUrls(latest, wantedType, observation);
      if (!current()) return;
      for (let retry = 0; retry < 3 && urls.length === 0; retry += 1) {
        if (!await waitCanvasObservation(1000, observation)) return;
        try { latest = await api.getTask(taskId); } catch { if (!current()) return; break; }
        if (!current() || latest.id !== taskId) return;
        urls = await resolveCompletedUrls(latest, wantedType, observation); if (!current()) return;
      }
      patchNode(nodeId, { status: "completed", assetUrls: urls, errorMessage: undefined, taskId, taskDurationMs: Math.max(0, Date.now() - startedAt) }); return;
    }
    if (softNotified) continue;
    const nextStatus: GenerateNodeData["status"] = latest.status === "running" ? "running" : "pending";
    if (nextStatus !== lastBusyStatus) { lastBusyStatus = nextStatus; patchNode(nodeId, { status: nextStatus, errorMessage: undefined, taskId }); }
  }
}

export async function syncCanvasNodeTask(nodeId: string, data: GenerateNodeData, patchNode: PatchNode, scope: CanvasAsyncScope): Promise<void> {
  if (typeof data.taskId !== "number") return;
  const taskId=data.taskId, wantedType=data.nodeKind === "video" ? "video" : "image";
  await scope.observeTask(nodeId, taskId, async observation => {
    const patch=observedPatch(patchNode,observation);
    try {
      const latest=await api.getTask(taskId); if(!observation.current() || latest.id!==taskId)return;
      if(latest.status === "failed") { patch(nodeId,{status:"failed",errorMessage:failureMessage(latest),taskId,taskDurationMs:resolveTaskDurationMs(data,latest)});return; }
      if(latest.status === "completed") {
        let urls=await resolveCompletedUrls(latest,wantedType,observation); if(!observation.current())return;
        for(let retry=0;retry<3 && urls.length===0;retry++) {
          if(!await waitCanvasObservation(1000,observation))return;
          try { const again=await api.getTask(taskId);if(!observation.current() || again.id!==taskId)return;urls=await resolveCompletedUrls(again,wantedType,observation); }
          catch { if(!observation.current())return;break; }
        }
        if(!observation.current())return;
        patch(nodeId,{status:"completed",assetUrls:urls,errorMessage:undefined,taskId,taskDurationMs:resolveTaskDurationMs(data,latest)});return;
      }
    } catch { if(!observation.current())return; }
    patch(nodeId,{status:"pending",errorMessage:undefined,taskId});
    await scope.observeTask(nodeId,taskId,control=>pollTaskUntilDone(taskId,nodeId,patchNode,wantedType,control));
  }, "sync");
}

export function resumeCanvasNodeTaskPolls(nodes: CanvasFlowNode[], patchNode: PatchNode, scope: CanvasAsyncScope) {
  scope.reconcile();
  for (const node of nodes) {
    if (!isGenerateNode(node) || !isResumableCanvasNodeTask(node.data) || typeof node.data.taskId !== "number") continue;
    const taskId=node.data.taskId;
    void scope.observeTask(node.id,taskId,control=>pollTaskUntilDone(taskId,node.id,patchNode,node.data.nodeKind === "video" ? "video" : "image",control)).catch(()=>undefined);
  }
}

export function useCanvasNodeGenerate(
  providers: Provider[],
  nodes: CanvasFlowNode[],
  edges: Edge[],
  patchNode: PatchNode,
  scope: CanvasAsyncScope
) {
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const patchNodeRef = useRef(patchNode);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(() => {
    patchNodeRef.current = patchNode;
  }, [patchNode]);

  return useCallback(
    async (nodeId: string, data: GenerateNodeData, options: CanvasGenerateOptions = {}) => {
      if (data.nodeKind === "upload" || data.nodeKind === "annotate") return;

      const sourceNode = scope.node(nodeId);
      if (!scope.active || !sourceNode || sourceNode.data.kind !== "generate") return;
      if (((sourceNode.data as GenerateNodeData).taskId ?? null) !== (data.taskId ?? null)) return scope.runningNode(nodeId);
      return scope.runNode(nodeId, async markAccepted => {
      const currentNodes = scope.graphNodes();
      const currentEdges = scope.graphEdges(edgesRef.current);
      const sourcePatch = patchNodeRef.current;
      if(!scope.active)return;
      if(scope.recoveries().some(row=>row.kind === "task" && row.nodeId === nodeId)) {
        sourcePatch(nodeId,{status:"failed",errorMessage:"已有提交结果待核对，请先在本画布恢复记录中核对任务，再明确处理原记录；不会自动补发。"},{isCurrent:()=>scope.active});return;
      }
      const live=scope.node(nodeId);
      if(!live || live.data.kind!=="generate")return;
      const liveData=live.data as GenerateNodeData;
      if(!options.regenerate && typeof liveData.taskId === "number" && isResumableCanvasNodeTask(liveData)) {
        const taskId=liveData.taskId;markAccepted();
        await scope.observeTask(nodeId,taskId,control=>pollTaskUntilDone(taskId,nodeId,sourcePatch,liveData.nodeKind === "video" ? "video" : "image",control));return;
      }
      if(!options.regenerate && ["submitting","pending","running","awaiting_result"].includes(liveData.status) && typeof liveData.taskId !== "number") {
        const message="原提交尚未确认，请先核对生成页任务，不会自动补发。";
        const unknown=scope.begin("task",nodeId,()=>JSON.stringify([liveData.nodeKind,null]));
        if(unknown){scope.complete(unknown,{error:message});scope.release(unknown);}
        sourcePatch(nodeId,{status:"failed",errorMessage:message},{isCurrent:()=>scope.active});return;
      }
      let operation: CanvasAsyncOperation | null = null;
      const input = () => { const node=scope.node(nodeId); return node?.data.kind === "generate" ? JSON.stringify([(node.data as GenerateNodeData).nodeKind,(node.data as GenerateNodeData).taskId ?? null]) : "missing"; };
      const originalInput = input();
      const current = () => scope.active && (operation ? scope.current(operation) : input() === originalInput);
      const patch: PatchNode = (id, value, patchOptions) => {
        const next=!operation && options.regenerate && value.status === "failed" && isResumableCanvasNodeTask(data)
          ? {...value,status:"awaiting_result" as const} : value;
        if(current())sourcePatch(id,next,{...patchOptions,isCurrent:operation ? scope.guard(operation) : current});
      };
      const accepted = async (task: Task, wantedType: "image" | "video", extra: Partial<GenerateNodeData> = {}) => {
        if (!operation) return;
        if(!Number.isSafeInteger(task?.id) || task.id<=0)throw new Error("任务受理身份不完整，提交结果尚未确认。");
        const value: Partial<GenerateNodeData> = {status:"pending",taskId:task.id,...extra};
        scope.complete(operation,{patch:value});
        if (!current()) return;
        patch(nodeId,value); scope.finish(operation); markAccepted();
        await scope.observeTask(nodeId,task.id,control=>pollTaskUntilDone(task.id,nodeId,sourcePatch,wantedType,control));
      };
      const failed = (err: unknown) => {
        const status=err && typeof err === "object" && "status" in err ? err.status : undefined;
        const rejected=typeof status === "number" && [400,401,403,404,409,413,422,429].includes(status);
        const detail=err instanceof Error ? err.message : "提交失败";
        const message=rejected ? detail : `提交结果尚未确认，请核对生成页任务后处理原恢复记录；不会自动补发。${detail}`;
        if(operation)scope.complete(operation,{error:message});
        if(current()) {
          patch(nodeId,{status:rejected && options.regenerate && isResumableCanvasNodeTask(data) ? "awaiting_result" : "failed",errorMessage:message});
          if(operation) { if(rejected)scope.finish(operation);else scope.release(operation); }
        }
      };

      const upstream = collectUpstreamDeliverables(nodeId, currentNodes, currentEdges);
      const referenceImages = resolveCanvasInputReferenceImages(data.referenceImages, upstream.images);

      if (data.nodeKind === "img2img" && referenceImages.length === 0) {
        patch(nodeId, {
          status: "failed",
          errorMessage: "图生图需要上游图片，请先连线或使用上传图片节点。",
        });
        return;
      }

      if (data.nodeKind === "upscale") {
        if (referenceImages.length === 0) {
          patch(nodeId, {
            status: "failed",
            errorMessage: "放大需要上游图片，请连接上传图片或生成节点。",
          });
          return;
        }
        const provider =
          providers.find((item) => item.provider_name === data.requestedProvider) ||
          findUpscaleProvider(providers);
        if (!provider) {
          patch(nodeId, {
            status: "failed",
            errorMessage: "没有可用的放大模型，请先在设置中心完成接入。",
          });
          return;
        }

        const sourceImage = referenceImages[0]!;
        operation = scope.begin("task",nodeId,input); if(!operation)return;
        patch(nodeId, {
          status: "submitting",
          errorMessage: undefined,
          requestedProvider: provider.provider_name,
          referenceImages,
          taskStartedAt: Date.now(),
          taskDurationMs: undefined,
        });

        try {
          const task = await api.createTask({
            submission_key: operation.record.id,
            title: `${data.label || "高清放大"} / 高清放大`,
            workflow_key: IMAGE_UPSCALE_WORKFLOW_KEY,
            project_code: data.projectCode || defaultStudioForm.projectCode,
            requested_provider: provider.provider_name,
            classification: data.classification || "B",
            payload: {
              source_image: sourceImage,
              reference_image: sourceImage,
              upscale_style: data.upscaleStyle,
              upscale_noise: data.upscaleNoise,
              upscale_x2: data.upscaleScale,
            },
          });
          await accepted(task,"image");
        } catch (err) {
          failed(err);
        }
        return;
      }

      const form: StudioFormState = {
        ...defaultStudioForm,
        creationMode: creationModeForNodeKind(data.nodeKind),
        title: data.label,
        prompt: data.prompt,
        activeTemplateId: null,
        projectCode: data.projectCode || defaultStudioForm.projectCode,
        requestedProvider: data.requestedProvider,
        classification: data.classification || "B",
        style: data.style || defaultStudioForm.style,
        aspectRatio: resolveAspectRatioForSurface(
          data.nodeKind,
          data.aspectRatio || defaultAspectRatioFor(data.nodeKind)
        ),
        resolution: data.resolution || defaultStudioForm.resolution,
        referenceImages,
        notes: "",
        deliverable: "",
        imageCount: 1,
      };

      const provider = resolveStudioProviderForForm(providers, form);
      if (!provider) {
        patch(nodeId, {
          status: "failed",
          errorMessage:
            data.nodeKind === "video"
              ? "没有可用的视频模型，请先在生成页确认模型配置。"
              : "没有可用的图像模型，请先在生成页确认模型配置。",
        });
        return;
      }

      operation = scope.begin("task",nodeId,input); if(!operation)return;
      patch(nodeId, {
        status: "submitting",
        errorMessage: undefined,
        requestedProvider: provider.provider_name,
        referenceImages,
        taskStartedAt: Date.now(),
        taskDurationMs: undefined,
      });

      try {
        const draft = buildTaskSubmissionPayload({
          form,
          provider,
          sourceSurface: "canvas",
          canvasNodeId: nodeId,
          promptPolished: Boolean(data.promptPolished),
        });
        const task = await api.createTask({...draft.payload,submission_key:operation.record.id});
        await accepted(task,data.nodeKind === "video" ? "video" : "image",{promptPolished:false});
      } catch (err) {
        failed(err);
      }
      }, Boolean(options.regenerate));
    },
    [providers, scope]
  );
}
