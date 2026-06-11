import type { CSSProperties } from "react";

import type { Asset } from "../../api";
import { stylePresets } from "./studioConstants";

export function clampImageCount(value: number): number {
  return Math.max(1, Math.min(4, Math.trunc(value || 1)));
}

export function clampReferenceImageCount(value: number): number {
  return Math.max(0, Math.min(4, Math.trunc(value || 0)));
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Reference image could not be read"));
    };
    reader.onerror = () => reject(new Error("Reference image could not be read"));
    reader.readAsDataURL(file);
  });
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function buildPreviewStyle(seed: string): CSSProperties {
  const base = hashString(seed || "qmdh-preview");
  const hueA = base % 360;
  const hueB = (base * 1.9 + 48) % 360;
  const hueC = (base * 2.6 + 120) % 360;

  return {
    "--preview-glow": `hsla(${hueA}, 88%, 76%, 0.72)`,
    "--preview-start": `hsl(${hueB}, 72%, 72%)`,
    "--preview-end": `hsl(${hueC}, 28%, 26%)`,
  } as CSSProperties;
}

export function normalizeAspectRatio(value: string): string | null {
  const raw = value.trim();
  if (!raw.includes(":")) return null;
  const [width, height] = raw.split(":").map((item) => Number(item.trim()));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return `${width} / ${height}`;
}

export function getRenderableUrl(asset: Asset): string | null {
  const rawPath = asset.storage_path.trim();
  return /^(https?:|data:|blob:|\/)/.test(rawPath) ? rawPath : null;
}

export function isVideoAsset(asset: Asset | undefined): boolean {
  return asset?.asset_type === "video";
}

export function summarizeStoragePath(path: string): string {
  if (!path) return "未生成路径";
  if (path.length <= 42) return path;
  return `...${path.slice(-39)}`;
}

export function buildGalleryAssets(taskAssets: Asset[]): Asset[] {
  return [...taskAssets]
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
    .slice(0, 4);
}

export function inferStyleFromAsset(asset: Asset | undefined, fallback: string): string {
  if (!asset) return fallback;
  const matched = stylePresets.find((preset) => asset.tags.includes(preset.id));
  return matched?.id ?? fallback;
}
