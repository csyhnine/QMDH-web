import { useCallback, useEffect, useRef, useState } from "react";

export type MediaCompareSliderProps = {
  /** Left side — generated / result */
  leftSrc: string;
  /** Right side — original / reference */
  rightSrc: string;
  leftLabel?: string;
  rightLabel?: string;
  className?: string;
};

/**
 * Before/after style compare: left of the handle shows the generated image,
 * right of the handle shows the original. Drag the center handle to reveal.
 */
export default function MediaCompareSlider({
  leftSrc,
  rightSrc,
  leftLabel = "生成图",
  rightLabel = "原图",
  className = "",
}: MediaCompareSliderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [position, setPosition] = useState(50);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number } | null>(null);

  const updateFromClientX = useCallback((clientX: number) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(92, Math.max(8, next)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const natW = Math.max(1, img.naturalWidth);
      const natH = Math.max(1, img.naturalHeight);
      const maxW = Math.min(1200, typeof window !== "undefined" ? window.innerWidth - 96 : 1200);
      const maxH = Math.min(780, typeof window !== "undefined" ? window.innerHeight * 0.72 : 780);
      const scale = Math.min(1, maxW / natW, maxH / natH);
      setBoxSize({
        w: Math.max(240, Math.round(natW * scale)),
        h: Math.max(160, Math.round(natH * scale)),
      });
    };
    img.onerror = () => {
      if (!cancelled) setBoxSize({ w: 960, h: 540 });
    };
    img.src = leftSrc;
    return () => {
      cancelled = true;
    };
  }, [leftSrc]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      if (!draggingRef.current) return;
      updateFromClientX(event.clientX);
    }
    function onPointerUp() {
      draggingRef.current = false;
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [updateFromClientX]);

  return (
    <div
      ref={rootRef}
      className={`media-compare-slider${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={`${leftLabel}与${rightLabel}对比，拖动中间滑杆切换显示比例`}
      style={
        boxSize
          ? { width: boxSize.w, height: boxSize.h }
          : { width: "min(96vw, 1200px)", aspectRatio: "16 / 9", maxHeight: "72vh" }
      }
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        draggingRef.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        updateFromClientX(event.clientX);
      }}
    >
      <img className="media-compare-slider-base" src={rightSrc} alt={rightLabel} draggable={false} />
      <img
        className="media-compare-slider-overlay"
        src={leftSrc}
        alt={leftLabel}
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />

      <div className="media-compare-slider-handle" style={{ left: `${position}%` }} aria-hidden="true">
        <span className="media-compare-slider-knob">
          <span className="media-compare-slider-chevron">‹</span>
          <span className="media-compare-slider-chevron">›</span>
        </span>
      </div>

      <span className="media-compare-slider-badge is-left">{leftLabel}</span>
      <span className="media-compare-slider-badge is-right">{rightLabel}</span>
    </div>
  );
}
