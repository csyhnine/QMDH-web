export type AnnotationTool = "pen" | "rect" | "ellipse" | "arrow" | "text";

export type AnnotationPoint = { x: number; y: number };

/** Coordinates are normalized 0–1 relative to the base image. */
export type AnnotationStroke =
  | {
      id: string;
      type: "pen";
      color: string;
      width: number;
      points: AnnotationPoint[];
    }
  | {
      id: string;
      type: "rect" | "ellipse";
      color: string;
      width: number;
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
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      id: string;
      type: "text";
      color: string;
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
  rect: "矩形",
  ellipse: "椭圆",
  arrow: "箭头",
  text: "文字",
};

export const defaultAnnotationState = {
  annotationStrokes: [] as AnnotationStroke[],
  annotationTool: "pen" as AnnotationTool,
  annotationColor: "#ef4444",
  annotationWidth: 3,
};

export function newAnnotationId(): string {
  return `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
