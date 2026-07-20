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
    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (attempt > 0) await sleep(2000);

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

      const nextStatus: GenerateNodeData["status"] =
        latest.status === "running" ? "running" : "pending";
      if (nextStatus !== lastBusyStatus) {
        lastBusyStatus = nextStatus;
        patchNode(nodeId, {
          status: nextStatus,
          taskId,
        });
      }
    }
    patchNode(nodeId, {
      status: "failed",
      errorMessage: "等待超时，请稍后在生成页查看任务状态。",
      taskId,
    });
  } finally {
    activePollKeys.delete(pollKey);
  }
}

export function resumeCanvasNodeTaskPolls(
  nodes: CanvasFlowNode[],
  patchNode: PatchNode
) {
  for (const node of nodes) {
    if (!isGenerateNode(node)) continue;
    const { taskId, status, nodeKind } = node.data;
    if (typeof taskId !== "number") continue;
    if (status !== "pending" && status !== "running" && status !== "submitting") continue;
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
