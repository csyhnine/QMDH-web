import { useCallback } from "react";
import type { Edge } from "@xyflow/react";

import { api, type Provider } from "../../api";
import { defaultStudioForm, IMAGE_UPSCALE_WORKFLOW_KEY } from "../studio/studioConstants";
import { findUpscaleProvider } from "../studio/studioUpscaleActions";
import { resolveStudioProviderForForm } from "../studio/studioTaskFormUtils";
import { buildTaskSubmissionPayload } from "../studio/studioTaskSubmissionActions";
import type { StudioFormState } from "../studio/studioTypes";
import { collectUpstreamDeliverables } from "./canvasGraphUtils";
import type { CanvasFlowNode, GenerateNodeData } from "./canvasTypes";

type PatchNode = (nodeId: string, patch: Partial<GenerateNodeData>) => void;

async function sleep(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function pollTaskUntilDone(
  taskId: number,
  nodeId: string,
  patchNode: PatchNode,
  wantedType: "image" | "video"
) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await sleep(2000);
    const [tasks, assets] = await Promise.all([api.tasks(), api.assets()]);
    const latest = tasks.find((item) => item.id === taskId);
    if (!latest) continue;
    if (latest.status === "failed") {
      const message =
        typeof latest.result?.error === "string"
          ? latest.result.error
          : typeof latest.result?.message === "string"
            ? latest.result.message
            : "生成失败，请重试";
      patchNode(nodeId, { status: "failed", errorMessage: message });
      return;
    }
    if (latest.status === "completed") {
      const urls = assets
        .filter(
          (asset) =>
            asset.source_task_id === taskId &&
            (asset.asset_type === wantedType || asset.asset_type === "image")
        )
        .map((asset) => asset.storage_path)
        .filter(Boolean);
      patchNode(nodeId, {
        status: "completed",
        assetUrls: urls,
        errorMessage: undefined,
      });
      return;
    }
    patchNode(nodeId, {
      status: latest.status === "running" ? "running" : "pending",
      taskId,
    });
  }
  patchNode(nodeId, { status: "failed", errorMessage: "等待超时，请稍后在生成页查看任务状态。" });
}

export function useCanvasNodeGenerate(
  providers: Provider[],
  nodes: CanvasFlowNode[],
  edges: Edge[],
  patchNode: PatchNode
) {
  return useCallback(
    async (nodeId: string, data: GenerateNodeData) => {
      if (data.nodeKind === "upload" || data.nodeKind === "annotate") return;

      const upstream = collectUpstreamDeliverables(nodeId, nodes, edges);
      const referenceImages = Array.from(
        new Set([...data.referenceImages, ...upstream.images].filter(Boolean))
      );

      if (data.nodeKind === "img2img" && referenceImages.length === 0) {
        patchNode(nodeId, {
          status: "failed",
          errorMessage: "图生图需要上游图片，请先连线或使用上传图片节点。",
        });
        return;
      }

      if (data.nodeKind === "upscale") {
        if (referenceImages.length === 0) {
          patchNode(nodeId, {
            status: "failed",
            errorMessage: "放大需要上游图片，请连接上传图片或生成节点。",
          });
          return;
        }
        const provider =
          providers.find((item) => item.provider_name === data.requestedProvider) ||
          findUpscaleProvider(providers);
        if (!provider) {
          patchNode(nodeId, {
            status: "failed",
            errorMessage: "没有可用的放大模型，请先在设置中心完成接入。",
          });
          return;
        }

        const sourceImage = referenceImages[0]!;
        patchNode(nodeId, {
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
          patchNode(nodeId, { status: "pending", taskId: task.id });
          await pollTaskUntilDone(task.id, nodeId, patchNode, "image");
        } catch (err) {
          patchNode(nodeId, {
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
        patchNode(nodeId, {
          status: "failed",
          errorMessage:
            data.nodeKind === "video"
              ? "没有可用的视频模型，请先在生成页确认模型配置。"
              : "没有可用的图像模型，请先在生成页确认模型配置。",
        });
        return;
      }

      patchNode(nodeId, {
        status: "submitting",
        errorMessage: undefined,
        requestedProvider: provider.provider_name,
        referenceImages,
      });

      try {
        const draft = buildTaskSubmissionPayload({ form, provider });
        const task = await api.createTask(draft.payload);
        patchNode(nodeId, { status: "pending", taskId: task.id });
        await pollTaskUntilDone(
          task.id,
          nodeId,
          patchNode,
          data.nodeKind === "video" ? "video" : "image"
        );
      } catch (err) {
        patchNode(nodeId, {
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "提交失败",
        });
      }
    },
    [edges, nodes, patchNode, providers]
  );
}
