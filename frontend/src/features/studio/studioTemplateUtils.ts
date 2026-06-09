import type { PromptTemplateRecord } from "../../api";

export type TemplatePreviewLayout = "single" | "columns" | "stacked";

export function previewStyleClass(style: string): string {
  switch (style) {
    case "editorial":
      return "template-preview-style-editorial";
    case "minimal":
      return "template-preview-style-minimal";
    case "cinematic":
      return "template-preview-style-cinematic";
    default:
      return "template-preview-style-modern";
  }
}

export function templatePrimaryCategory(template: PromptTemplateRecord): string {
  return template.category.trim() || "未分类";
}

export function templateSecondaryCategory(template: PromptTemplateRecord): string {
  return template.subcategory.trim() || "其他";
}

export function templatePreviewImages(template: PromptTemplateRecord): Array<{ key: string; src: string; label: string }> {
  const images: Array<{ key: string; src: string; label: string }> = [];
  if (template.source_image_path.trim()) {
    images.push({ key: "source", src: template.source_image_path, label: "原图" });
  }
  if (template.preview_image_path.trim()) {
    images.push({ key: "preview", src: template.preview_image_path, label: "最终图" });
  }
  return images;
}

export function inferTemplatePreviewLayout(
  imageCount: number,
  measuredAspectRatios: number[],
  templateAspectRatio: string | null | undefined
): TemplatePreviewLayout {
  if (imageCount <= 1) return "single";
  if (measuredAspectRatios.length > 0) {
    return measuredAspectRatios.some((ratio) => ratio >= 1) ? "stacked" : "columns";
  }
  const templateRatio = parseAspectRatioValue(templateAspectRatio);
  if (templateRatio !== null) {
    return templateRatio >= 1 ? "stacked" : "columns";
  }
  return "columns";
}

export function previewFrameRatio(aspectRatio: number | undefined, layout: TemplatePreviewLayout): string {
  if (!aspectRatio || !Number.isFinite(aspectRatio)) {
    return layout === "columns" ? "4 / 5" : "16 / 10";
  }
  if (aspectRatio >= 1.2) return "16 / 9";
  if (aspectRatio <= 0.8) return "4 / 5";
  return "1 / 1";
}

export function previewOrientationClass(aspectRatio: number | undefined): string {
  if (!aspectRatio || !Number.isFinite(aspectRatio)) return "is-balanced";
  if (aspectRatio >= 1.2) return "is-wide";
  if (aspectRatio <= 0.8) return "is-tall";
  return "is-balanced";
}

function parseAspectRatioValue(value: string | null | undefined): number | null {
  const raw = String(value || "").trim();
  if (!raw.includes(":")) return null;
  const [width, height] = raw.split(":").map((item) => Number(item.trim()));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return width / height;
}
