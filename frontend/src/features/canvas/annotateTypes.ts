export type AnnotationTool = "pen" | "region" | "rect" | "ellipse" | "arrow" | "text";

export type AnnotationPoint = { x: number; y: number };

/** Coordinates are normalized 0–1 relative to the base image. */
export type AnnotationStroke =
  | {
      id: string;
      type: "pen";
      color: string;
      width: number;
      opacity?: number;
      points: AnnotationPoint[];
    }
  | {
      id: string;
      type: "region";
      color: string;
      width: number;
      opacity?: number;
      points: AnnotationPoint[];
    }
  | {
      id: string;
      type: "rect" | "ellipse";
      color: string;
      width: number;
      opacity?: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }
  | {
      id: string;
      type: "arrow";
      color: string;
      width: number;
      opacity?: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      id: string;
      type: "text";
      color: string;
      opacity?: number;
      x: number;
      y: number;
      text: string;
      fontSize: number;
    };

export const ANNOTATION_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ffffff",
  "#0f172a",
];

export const ANNOTATION_TOOL_LABEL: Record<AnnotationTool, string> = {
  pen: "画笔",
  region: "选区",
  rect: "矩形",
  ellipse: "椭圆",
  arrow: "箭头",
  text: "文字",
};

export const DEFAULT_ANNOTATION_OPACITY = 0.35;

export const defaultAnnotationState = {
  annotationStrokes: [] as AnnotationStroke[],
  annotationTool: "region" as AnnotationTool,
  annotationColor: "#ef4444",
  annotationWidth: 3,
  annotationOpacity: DEFAULT_ANNOTATION_OPACITY,
};

export function newAnnotationId(): string {
  return `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function clampAnnotationOpacity(value: unknown, fallback = DEFAULT_ANNOTATION_OPACITY): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(1, Math.max(0.05, num));
}

/** Convert #rgb/#rrggbb (+ optional existing alpha) to rgba() with the given opacity. */
export function annotationColorWithOpacity(color: string, opacity: number): string {
  const alpha = clampAnnotationOpacity(opacity, 1);
  const raw = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (hex) {
    let body = hex[1]!;
    if (body.length === 3) {
      body = body
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    const r = Number.parseInt(body.slice(0, 2), 16);
    const g = Number.parseInt(body.slice(2, 4), 16);
    const b = Number.parseInt(body.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(raw);
  if (rgba) {
    return `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${alpha})`;
  }
  return raw;
}
