import type { Asset, Provider, Task, TaskCreatePayload } from "../../api";
import { IMAGE_UPSCALE_WORKFLOW_KEY, defaultUpscaleOptions } from "./studioConstants";
import { isRuntimeUpscaleProvider } from "./modelAdminUtils";

export function findUpscaleProvider(providers: Provider[]): Provider | undefined {
  return providers.find((provider) => isRuntimeUpscaleProvider(provider));
}

export function canUpscaleAsset(asset: Asset | undefined): boolean {
  return Boolean(asset && asset.asset_type === "image" && asset.storage_path.trim());
}

export function buildUpscaleTaskCreatePayload({
  asset,
  projectCode,
  provider,
  sourceTask,
}: {
  asset: Asset;
  projectCode: string;
  provider: Provider;
  sourceTask: Task;
}): TaskCreatePayload {
  const storagePath = asset.storage_path.trim();
  const titleBase = sourceTask.title.trim() || asset.name.trim() || "历史图片";

  return {
    title: `${titleBase} / 高清放大`,
    workflow_key: IMAGE_UPSCALE_WORKFLOW_KEY,
    project_code: projectCode,
    requested_provider: provider.provider_name,
    classification: sourceTask.classification,
    payload: {
      source_image: storagePath,
      reference_image: storagePath,
      upscale_style: defaultUpscaleOptions.style,
      upscale_noise: defaultUpscaleOptions.noise,
      upscale_x2: defaultUpscaleOptions.scale,
      source_task_id: sourceTask.id,
      source_asset_id: asset.id,
    },
  };
}
