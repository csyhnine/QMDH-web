import {
  annotationColorWithOpacity,
  clampAnnotationOpacity,
  type AnnotationPoint,
  type AnnotationStroke,
} from "./annotateTypes";

function strokePx(width: number, canvasW: number): number {
  return Math.max(1, (width / 480) * canvasW);
}

function toCanvas(point: AnnotationPoint, w: number, h: number): { x: number; y: number } {
  return { x: point.x * w, y: point.y * h };
}

function strokeOpacity(stroke: AnnotationStroke, fallback: number): number {
  return clampAnnotationOpacity(stroke.opacity, fallback);
}

export function drawAnnotationStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: AnnotationStroke[],
  canvasW: number,
  canvasH: number
) {
  for (const stroke of strokes) {
    ctx.save();
    if (stroke.type === "pen") {
      if (stroke.points.length < 2) {
        ctx.restore();
        continue;
      }
      ctx.globalAlpha = strokeOpacity(stroke, 1);
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = strokePx(stroke.width, canvasW);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const first = toCanvas(stroke.points[0]!, canvasW, canvasH);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < stroke.points.length; i += 1) {
        const p = toCanvas(stroke.points[i]!, canvasW, canvasH);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    } else if (stroke.type === "region") {
      if (stroke.points.length < 3) {
        ctx.restore();
        continue;
      }
      const alpha = strokeOpacity(stroke, 0.35);
      ctx.beginPath();
      const first = toCanvas(stroke.points[0]!, canvasW, canvasH);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < stroke.points.length; i += 1) {
        const p = toCanvas(stroke.points[i]!, canvasW, canvasH);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = annotationColorWithOpacity(stroke.color, alpha);
      ctx.fill();
      ctx.strokeStyle = annotationColorWithOpacity(stroke.color, Math.min(1, alpha + 0.35));
      ctx.lineWidth = Math.max(1, strokePx(stroke.width, canvasW) * 0.6);
      ctx.lineJoin = "round";
      ctx.stroke();
    } else if (stroke.type === "rect") {
      const alpha = strokeOpacity(stroke, 0.35);
      const x = stroke.x * canvasW;
      const y = stroke.y * canvasH;
      const w = stroke.w * canvasW;
      const h = stroke.h * canvasH;
      ctx.fillStyle = annotationColorWithOpacity(stroke.color, alpha);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = annotationColorWithOpacity(stroke.color, Math.min(1, alpha + 0.35));
      ctx.lineWidth = strokePx(stroke.width, canvasW);
      ctx.strokeRect(x, y, w, h);
    } else if (stroke.type === "ellipse") {
      const alpha = strokeOpacity(stroke, 0.35);
      const cx = (stroke.x + stroke.w / 2) * canvasW;
      const cy = (stroke.y + stroke.h / 2) * canvasH;
      const rx = Math.abs(stroke.w * canvasW) / 2;
      const ry = Math.abs(stroke.h * canvasH) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, Math.PI * 2);
      ctx.fillStyle = annotationColorWithOpacity(stroke.color, alpha);
      ctx.fill();
      ctx.strokeStyle = annotationColorWithOpacity(stroke.color, Math.min(1, alpha + 0.35));
      ctx.lineWidth = strokePx(stroke.width, canvasW);
      ctx.stroke();
    } else if (stroke.type === "arrow") {
      const start = toCanvas({ x: stroke.x1, y: stroke.y1 }, canvasW, canvasH);
      const end = toCanvas({ x: stroke.x2, y: stroke.y2 }, canvasW, canvasH);
      const lw = strokePx(stroke.width, canvasW);
      ctx.globalAlpha = strokeOpacity(stroke, 1);
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = lw;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const head = Math.max(10, lw * 3.5);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    } else if (stroke.type === "text") {
      const p = toCanvas({ x: stroke.x, y: stroke.y }, canvasW, canvasH);
      const size = Math.max(12, (stroke.fontSize / 480) * canvasW);
      ctx.globalAlpha = strokeOpacity(stroke, 1);
      ctx.fillStyle = stroke.color;
      ctx.font = `700 ${size}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textBaseline = "top";
      const lines = stroke.text.split("\n");
      lines.forEach((line, index) => {
        ctx.fillText(line, p.x, p.y + index * size * 1.25);
      });
    }
    ctx.restore();
  }
}

export async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("底图加载失败，请确认图片可访问"));
    img.src = url;
  });
}

export async function exportAnnotatedDataUrl(
  baseUrl: string,
  strokes: AnnotationStroke[]
): Promise<{ dataUrl: string; fileName: string }> {
  const img = await loadImageElement(baseUrl);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) throw new Error("底图像素尺寸无效");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("无法创建画布");

  // 1:1 draw — keep source pixels; only enable high-quality smoothing if sizes ever differ.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawAnnotationStrokes(ctx, strokes, width, height);

  const stamp = Date.now();
  const preferPng = /\.png(\?|$)/i.test(baseUrl) || /image\/png/i.test(baseUrl);
  if (preferPng) {
    return { dataUrl: canvas.toDataURL("image/png"), fileName: `annotate-${stamp}.png` };
  }
  // High-quality JPEG keeps photographic detail without a second hard downscale.
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.95), fileName: `annotate-${stamp}.jpg` };
}
