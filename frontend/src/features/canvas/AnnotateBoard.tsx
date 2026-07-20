import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  ANNOTATION_COLORS,
  ANNOTATION_TOOL_LABEL,
  newAnnotationId,
  type AnnotationStroke,
  type AnnotationTool,
} from "./annotateTypes";
import { drawAnnotationStrokes, loadImageElement } from "./annotateDraw";

type AnnotateBoardProps = {
  baseUrl: string;
  strokes: AnnotationStroke[];
  tool: AnnotationTool;
  color: string;
  width: number;
  disabled?: boolean;
  onChangeStrokes: (strokes: AnnotationStroke[]) => void;
  onToolChange: (tool: AnnotationTool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
};

export default function AnnotateBoard({
  baseUrl,
  strokes,
  tool,
  color,
  width,
  disabled = false,
  onChangeStrokes,
  onToolChange,
  onColorChange,
  onWidthChange,
}: AnnotateBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const draftRef = useRef<AnnotationStroke | null>(null);
  const drawingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const paint = useCallback((nextStrokes: AnnotationStroke[], draft: AnnotationStroke | null = null) => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = Number(canvas.dataset.cssWidth || canvas.width);
    const cssH = Number(canvas.dataset.cssHeight || canvas.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, cssW, cssH);
    drawAnnotationStrokes(ctx, nextStrokes, cssW, cssH);
    if (draft) drawAnnotationStrokes(ctx, [draft], cssW, cssH);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const img = await loadImageElement(baseUrl);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const maxW = 420;
        const scale = Math.min(1, maxW / Math.max(1, img.naturalWidth || maxW));
        const cssW = Math.max(160, Math.round((img.naturalWidth || maxW) * scale));
        const cssH = Math.max(160, Math.round((img.naturalHeight || maxW) * scale));
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        canvas.dataset.cssWidth = String(cssW);
        canvas.dataset.cssHeight = String(cssH);
        imageRef.current = img;
        setReady(true);
        setError("");
        paint(strokes, null);
      } catch (err) {
        if (!cancelled) {
          imageRef.current = null;
          setReady(false);
          setError(err instanceof Error ? err.message : "底图加载失败");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, paint]);

  useEffect(() => {
    if (!ready) return;
    paint(strokes, draftRef.current);
  }, [paint, ready, strokes]);

  function normFromEvent(event: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled || !ready) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = normFromEvent(event);
    drawingRef.current = true;

    if (tool === "text") {
      const text = window.prompt("输入标注文字", "");
      drawingRef.current = false;
      if (!text?.trim()) return;
      onChangeStrokes(
        strokes.concat({
          id: newAnnotationId(),
          type: "text",
          color,
          x: p.x,
          y: p.y,
          text: text.trim(),
          fontSize: Math.max(14, width * 5),
        })
      );
      return;
    }

    if (tool === "pen") {
      draftRef.current = { id: newAnnotationId(), type: "pen", color, width, points: [p] };
    } else if (tool === "rect" || tool === "ellipse") {
      draftRef.current = { id: newAnnotationId(), type: tool, color, width, x: p.x, y: p.y, w: 0, h: 0 };
    } else {
      draftRef.current = {
        id: newAnnotationId(),
        type: "arrow",
        color,
        width,
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
      };
    }
    paint(strokes, draftRef.current);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !draftRef.current) return;
    const p = normFromEvent(event);
    const draft = draftRef.current;
    if (draft.type === "pen") {
      draftRef.current = { ...draft, points: draft.points.concat(p) };
    } else if (draft.type === "rect" || draft.type === "ellipse") {
      draftRef.current = { ...draft, w: p.x - draft.x, h: p.y - draft.y };
    } else if (draft.type === "arrow") {
      draftRef.current = { ...draft, x2: p.x, y2: p.y };
    }
    paint(strokes, draftRef.current);
  }

  function onPointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const draft = draftRef.current;
    draftRef.current = null;
    if (!draft) return;
    if (draft.type === "pen" && draft.points.length < 2) {
      paint(strokes, null);
      return;
    }
    if ((draft.type === "rect" || draft.type === "ellipse") && Math.abs(draft.w) < 0.01 && Math.abs(draft.h) < 0.01) {
      paint(strokes, null);
      return;
    }
    onChangeStrokes(strokes.concat(draft));
  }

  return (
    <div className="qmdh-canvas-annotate nodrag nopan">
      <div className="qmdh-canvas-annotate-tools">
        {(Object.keys(ANNOTATION_TOOL_LABEL) as AnnotationTool[]).map((item) => (
          <button
            key={item}
            type="button"
            className={tool === item ? "is-active" : ""}
            disabled={disabled}
            onClick={() => onToolChange(item)}
          >
            {ANNOTATION_TOOL_LABEL[item]}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled || strokes.length === 0}
          onClick={() => onChangeStrokes(strokes.slice(0, -1))}
        >
          撤销
        </button>
        <button type="button" disabled={disabled || strokes.length === 0} onClick={() => onChangeStrokes([])}>
          清空
        </button>
      </div>

      <div className="qmdh-canvas-annotate-colors">
        {ANNOTATION_COLORS.map((item) => (
          <button
            key={item}
            type="button"
            className={`qmdh-canvas-annotate-swatch${color === item ? " is-active" : ""}`}
            style={{ background: item }}
            disabled={disabled}
            aria-label={item}
            onClick={() => onColorChange(item)}
          />
        ))}
        <label className="qmdh-canvas-annotate-width">
          粗细
          <input
            type="range"
            min={1}
            max={12}
            value={width}
            disabled={disabled}
            onChange={(event) => onWidthChange(Number(event.target.value))}
          />
        </label>
      </div>

      {error ? <p className="qmdh-canvas-node-error">{error}</p> : null}
      <div className="qmdh-canvas-annotate-stage">
        <canvas
          ref={canvasRef}
          className="qmdh-canvas-annotate-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </div>
  );
}
