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
    avatarKind: "private",
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
  options: { providerName: string; signal?: AbortSignal; kind?: "private" | "real" }
): Promise<ReferenceUploadItem> {
  const providerName = options.providerName;
  const signal = options.signal;
  const kind = options.kind || item.avatarKind || "private";
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
      const snapshot =
        kind === "real"
          ? await api.getSeedanceRealAvatarAsset(item.assetId, providerName || undefined)
          : await api.getSeedancePrivateAvatarAsset(item.assetId, providerName || undefined);
      const status = normalizeAvatarStatus(snapshot.status);
      if (status === "active") {
        return applyActiveAvatar(current, snapshot, kind);
      }
      if (status === "failed") {
        return {
          ...current,
          avatarStatus: "failed",
          avatarKind: kind,
          assetId: snapshot.asset_id,
          assetUrl: snapshot.asset_url,
          avatarError:
            kind === "real"
              ? "真人素材审核未通过，请确认素材与认证人物一致。"
              : "虚拟人像审核未通过，请换一张明确为虚拟角色的图。",
        };
      }
      current = {
        ...current,
        avatarStatus: "processing",
        avatarKind: kind,
        assetId: snapshot.asset_id,
        assetUrl: snapshot.asset_url,
      };
    } catch (error) {
      return {
        ...current,
        avatarStatus: "failed",
        avatarKind: kind,
        avatarError: error instanceof Error ? error.message : "查询人像状态失败",
      };
    }
  }
  return {
    ...current,
    avatarStatus: "failed",
    avatarKind: kind,
    avatarError: "人像审核超时，请稍后重试或换图。",
  };
}

export async function startSeedanceRealAvatarVerify(
  options: { providerName: string }
): Promise<{ taskId: string; h5Link: string }> {
  const started = await api.startSeedanceRealAvatarVerify({
    provider_name: options.providerName || undefined,
  });
  if (!started.task_id || !started.h5_link) {
    throw new Error("未拿到真人认证链接");
  }
  return { taskId: started.task_id, h5Link: started.h5_link };
}

export async function registerSeedanceRealAvatarForUpload(
  item: ReferenceUploadItem,
  options: { providerName: string; verifyTaskId: string }
): Promise<ReferenceUploadItem> {
  const mediaPath = item.mediaPath || item.storagePath;
  const registering: ReferenceUploadItem = {
    ...item,
    mediaPath,
    avatarStatus: "registering",
    avatarKind: "real",
    verifyTaskId: options.verifyTaskId,
    avatarError: undefined,
  };
  try {
    const registered = await api.registerSeedanceRealAvatar({
      verify_task_id: options.verifyTaskId,
      storage_path: mediaPath,
      name: item.fileName || "studio-real-reference",
      provider_name: options.providerName || undefined,
    });
    const status = normalizeAvatarStatus(registered.status);
    if (status === "active") {
      return applyActiveAvatar(registering, registered, "real");
    }
    if (status === "failed") {
      return {
        ...registering,
        avatarStatus: "failed",
        assetId: registered.asset_id,
        assetUrl: registered.asset_url,
        avatarError: "真人素材审核未通过，请确认素材与认证人物一致。",
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
      avatarError: error instanceof Error ? error.message : "真人入库失败",
    };
  }
}

function applyActiveAvatar(
  item: ReferenceUploadItem,
  snapshot: SeedancePrivateAvatarAsset,
  kind: "private" | "real" = "private"
): ReferenceUploadItem {
  const assetUrl = snapshot.asset_url || `asset://${snapshot.asset_id}`;
  return {
    ...item,
    mediaPath: item.mediaPath || item.storagePath,
    storagePath: assetUrl,
    assetId: snapshot.asset_id,
    assetUrl,
    avatarStatus: "active",
    avatarKind: kind,
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
      return "可入库（虚拟/真人）";
    case "verifying":
      return "等待真人 H5 认证…";
    case "registering":
      return item.avatarKind === "real" ? "真人入库中…" : "虚拟人入库中…";
    case "processing":
      return item.avatarKind === "real" ? "真人审核中…" : "虚拟人审核中…";
    case "active":
      return item.avatarKind === "real" ? "真人已可用" : "虚拟人已可用";
    case "failed":
      return item.avatarError || "入库失败";
    default:
      return null;
  }
}
