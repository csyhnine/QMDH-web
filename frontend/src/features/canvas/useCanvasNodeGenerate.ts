import { useCallback, useEffect, useRef } from "react";
import type { Edge } from "@xyflow/react";

import { api, type Provider, type Task } from "../../api";
import { defaultStudioForm, IMAGE_UPSCALE_WORKFLOW_KEY } from "../studio/studioConstants";
import { findUpscaleProvider } from "../studio/studioUpscaleActions";
import { resolveStudioProviderForForm } from "../studio/studioTaskFormUtils";
import { buildTaskSubmissionPayload } from "../studio/studioTaskSubmissionActions";
import type { StudioFormState } from "../studio/studioTypes";
import { collectUpstreamDeliverables } from "./canvasGraphUtils";
import type { CanvasFlowNode, GenerateNodeData } from "./canvasTypes";
import { isGenerateNode } from "./canvasTypes";

type PatchNode = (nodeId: string, patch: Partial<GenerateNodeData>) => void;

const activePollKeys = new Set<string>();

/** Soft client wait budget before surfacing「拉取结果」. */
const POLL_DEADLINE_MS = 15 * 60 * 1000;
const POLL_FAST_WINDOW_MS = 3 * 60 * 1000;
const POLL_FAST_INTERVAL_MS = 2000;
const POLL_SLOW_INTERVAL_MS = 5000;

const WAIT_TIMEOUT_MESSAGE = "等待较久，可点击「拉取结果」同步；也可在生成页查看任务。";
const LEGACY_WAIT_TIMEOUT_HINT = "等待超时";

async function sleep(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

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

async function resolveCompletedUrls(task: Task, wantedType: "image" | "video"): Promise<string[]> {
  const fromResult = collectResultUrls(task.result);
  if (fromResult.length > 0) return fromResult;

  try {
    const assets = await api.assets();
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
  taskId: number,
  nodeId: string,
  patchNode: PatchNode,
  wantedType: "image" | "video"
) {
  const pollKey = `${nodeId}:${taskId}`;
  if (activePollKeys.has(pollKey)) return;
  activePollKeys.add(pollKey);

  try {
    let lastBusyStatus: GenerateNodeData["status"] | "" = "";
    const startedAt = Date.now();
    let attempt = 0;
    let softNotified = false;

    // Keep polling until the Studio task finishes. After POLL_DEADLINE_MS surface
    // awaiting_result so the user can sync / regenerate, but do not abandon the taskId.
    for (;;) {
      if (attempt > 0) {
        const elapsed = Date.now() - startedAt;
        await sleep(elapsed < POLL_FAST_WINDOW_MS ? POLL_FAST_INTERVAL_MS : POLL_SLOW_INTERVAL_MS);
      }
      attempt += 1;

      const elapsed = Date.now() - startedAt;
      if (!softNotified && elapsed >= POLL_DEADLINE_MS) {
        softNotified = true;
        lastBusyStatus = "awaiting_result";
        patchNode(nodeId, {
          status: "awaiting_result",
          errorMessage: WAIT_TIMEOUT_MESSAGE,
          taskId,
        });
      }

      let latest: Task;
      try {
        latest = await api.getTask(taskId);
      } catch {
        // Fall back to list when single-task fetch fails (auth/network blip).
        try {
          const tasks = await api.tasks();
          const found = tasks.find((item) => item.id === taskId);
          if (!found) continue;
          latest = found;
        } catch {
          continue;
        }
      }

      if (latest.status === "failed") {
        patchNode(nodeId, { status: "failed", errorMessage: failureMessage(latest), taskId });
        return;
      }

      if (latest.status === "completed") {
        let urls = await resolveCompletedUrls(latest, wantedType);
        // Asset rows can lag result slightly; give them a couple more ticks.
        for (let retry = 0; retry < 3 && urls.length === 0; retry += 1) {
          await sleep(1000);
          try {
            latest = await api.getTask(taskId);
          } catch {
            break;
          }
          urls = await resolveCompletedUrls(latest, wantedType);
        }
        patchNode(nodeId, {
          status: "completed",
          assetUrls: urls,
          errorMessage: undefined,
          taskId,
        });
        return;
      }

      if (softNotified) {
        // Stay on awaiting_result so「拉取结果」remains available while we keep polling.
        continue;
      }

      const nextStatus: GenerateNodeData["status"] =
        latest.status === "running" ? "running" : "pending";
      if (nextStatus !== lastBusyStatus) {
        lastBusyStatus = nextStatus;
        patchNode(nodeId, {
          status: nextStatus,
          errorMessage: undefined,
          taskId,
        });
      }
    }
  } finally {
    activePollKeys.delete(pollKey);
  }
}

export async function syncCanvasNodeTask(
  nodeId: string,
  data: GenerateNodeData,
  patchNode: PatchNode
): Promise<void> {
  if (typeof data.taskId !== "number") return;
  const taskId = data.taskId;
  const wantedType = data.nodeKind === "video" ? "video" : "image";

  // One-shot fetch so「拉取结果」works even when a background poller is already attached.
  try {
    const latest = await api.getTask(taskId);
    if (latest.status === "failed") {
      patchNode(nodeId, { status: "failed", errorMessage: failureMessage(latest), taskId });
      return;
    }
    if (latest.status === "completed") {
      let urls = await resolveCompletedUrls(latest, wantedType);
      for (let retry = 0; retry < 3 && urls.length === 0; retry += 1) {
        await sleep(1000);
        try {
          const again = await api.getTask(taskId);
          urls = await resolveCompletedUrls(again, wantedType);
        } catch {
          break;
        }
      }
      patchNode(nodeId, {
        status: "completed",
        assetUrls: urls,
        errorMessage: undefined,
        taskId,
      });
      return;
    }
  } catch {
    // Fall through to resume polling.
  }

  patchNode(nodeId, {
    status: "pending",
    errorMessage: undefined,
    taskId,
  });
  await pollTaskUntilDone(taskId, nodeId, patchNode, wantedType);
}

export function resumeCanvasNodeTaskPolls(nodes: CanvasFlowNode[], patchNode: PatchNode) {
  for (const node of nodes) {
    if (!isGenerateNode(node)) continue;
    const { taskId, nodeKind } = node.data;
    if (!isResumableCanvasNodeTask(node.data) || typeof taskId !== "number") continue;
    void pollTaskUntilDone(
      taskId,
      node.id,
      patchNode,
      nodeKind === "video" ? "video" : "image"
    );
  }
}

export function useCanvasNodeGenerate(
  providers: Provider[],
  nodes: CanvasFlowNode[],
  edges: Edge[],
  patchNode: PatchNode
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
    async (nodeId: string, data: GenerateNodeData) => {
      if (data.nodeKind === "upload" || data.nodeKind === "annotate") return;

      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const patch = patchNodeRef.current;

      const upstream = collectUpstreamDeliverables(nodeId, currentNodes, currentEdges);
      const referenceImages = Array.from(
        new Set([...data.referenceImages, ...upstream.images].filter(Boolean))
      );

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
        patch(nodeId, {
          status: "submitting",
          errorMessage: undefined,
          requestedProvider: provider.provider_name,
          referenceImages,
        });

        try {
          const task = await api.createTask({
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
          patch(nodeId, { status: "pending", taskId: task.id });
          await pollTaskUntilDone(task.id, nodeId, patch, "image");
        } catch (err) {
          patch(nodeId, {
            status: "failed",
            errorMessage: err instanceof Error ? err.message : "提交失败",
          });
        }
        return;
      }

      const form: StudioFormState = {
        ...defaultStudioForm,
        creationMode: data.creationMode,
        title: data.label,
        prompt: data.prompt,
        projectCode: data.projectCode || defaultStudioForm.projectCode,
        requestedProvider: data.requestedProvider,
        classification: data.classification || "B",
        style: data.style || defaultStudioForm.style,
        aspectRatio: data.aspectRatio || defaultStudioForm.aspectRatio,
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

      patch(nodeId, {
        status: "submitting",
        errorMessage: undefined,
        requestedProvider: provider.provider_name,
        referenceImages,
      });

      try {
        const draft = buildTaskSubmissionPayload({ form, provider });
        const task = await api.createTask(draft.payload);
        patch(nodeId, { status: "pending", taskId: task.id });
        await pollTaskUntilDone(
          task.id,
          nodeId,
          patch,
          data.nodeKind === "video" ? "video" : "image"
        );
      } catch (err) {
        patch(nodeId, {
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "提交失败",
        });
      }
    },
    [providers]
  );
}
