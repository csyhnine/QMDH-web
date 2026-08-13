import { api, type SeedancePrivateAvatarAsset } from "../../api";
import type { ReferenceUploadItem } from "./studioTypes";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90_000;

export async function registerSeedancePrivateAvatarForUpload(
  item: ReferenceUploadItem,
  options: { providerName: string }
): Promise<ReferenceUploadItem> {
  const providerName = options.providerName;
  const mediaPath = item.mediaPath || item.storagePath;
  const registering: ReferenceUploadItem = {
    ...item,
    mediaPath,
    avatarStatus: "registering",
    avatarError: undefined,
  };

  try {
    const registered = await api.registerSeedancePrivateAvatar({
      storage_path: mediaPath,
      name: item.fileName || "studio-reference",
      provider_name: providerName || undefined,
    });
    const status = normalizeAvatarStatus(registered.status);
    if (status === "active") {
      return applyActiveAvatar(registering, registered);
    }
    if (status === "failed") {
      return {
        ...registering,
        avatarStatus: "failed",
        assetId: registered.asset_id,
        assetUrl: registered.asset_url,
        avatarError: "虚拟人像审核未通过，请换一张明确为虚拟角色的图。",
      };
    }
    return {
      ...registering,
      avatarStatus: "processing",
      assetId: registered.asset_id,
      assetUrl: registered.asset_url,
    };
  } catch (error) {
    return {
      ...registering,
      avatarStatus: "failed",
      avatarError: error instanceof Error ? error.message : "虚拟人像入库失败",
    };
  }
}

export async function pollSeedancePrivateAvatarUntilSettled(
  item: ReferenceUploadItem,
  options: { providerName: string; signal?: AbortSignal }
): Promise<ReferenceUploadItem> {
  const providerName = options.providerName;
  const signal = options.signal;
  if (!item.assetId) return item;
  if (item.avatarStatus === "active" || item.avatarStatus === "failed") return item;

  const started = Date.now();
  let current = item;
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    if (signal?.aborted) {
      return { ...current, avatarError: current.avatarError || "入库轮询已取消" };
    }
    await sleep(POLL_INTERVAL_MS);
    if (signal?.aborted) {
      return current;
    }
    try {
      const snapshot = await api.getSeedancePrivateAvatarAsset(item.assetId, providerName || undefined);
      const status = normalizeAvatarStatus(snapshot.status);
      if (status === "active") {
        return applyActiveAvatar(current, snapshot);
      }
      if (status === "failed") {
        return {
          ...current,
          avatarStatus: "failed",
          assetId: snapshot.asset_id,
          assetUrl: snapshot.asset_url,
          avatarError: "虚拟人像审核未通过，请换一张明确为虚拟角色的图。",
        };
      }
      current = {
        ...current,
        avatarStatus: "processing",
        assetId: snapshot.asset_id,
        assetUrl: snapshot.asset_url,
      };
    } catch (error) {
      return {
        ...current,
        avatarStatus: "failed",
        avatarError: error instanceof Error ? error.message : "查询虚拟人像状态失败",
      };
    }
  }
  return {
    ...current,
    avatarStatus: "failed",
    avatarError: "虚拟人像审核超时，请稍后重试或换图。",
  };
}

function applyActiveAvatar(
  item: ReferenceUploadItem,
  snapshot: SeedancePrivateAvatarAsset
): ReferenceUploadItem {
  const assetUrl = snapshot.asset_url || `asset://${snapshot.asset_id}`;
  return {
    ...item,
    mediaPath: item.mediaPath || item.storagePath,
    storagePath: assetUrl,
    assetId: snapshot.asset_id,
    assetUrl,
    avatarStatus: "active",
    avatarError: undefined,
  };
}

function normalizeAvatarStatus(status: string): ReferenceUploadItem["avatarStatus"] {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "failed" || normalized === "failure") return "failed";
  if (normalized === "processing" || normalized === "pending" || normalized === "queued") {
    return "processing";
  }
  return "processing";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function seedanceAvatarStatusLabel(item: ReferenceUploadItem): string | null {
  switch (item.avatarStatus) {
    case "idle":
      return "虚拟角色需入库";
    case "registering":
      return "人像入库中…";
    case "processing":
      return "人像审核中…";
    case "active":
      return "人像已可用";
    case "failed":
      return item.avatarError || "人像入库失败";
    default:
      return null;
  }
}

export function seedanceAvatarActionLabel(item: ReferenceUploadItem): string | null {
  if (item.avatarStatus === "idle") return "入库";
  if (item.avatarStatus === "failed") return "重试入库";
  return null;
}
