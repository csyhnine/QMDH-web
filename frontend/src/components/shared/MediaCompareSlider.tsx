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

type NatSize = { w: number; h: number };

function loadImageSize(src: string): Promise<NatSize | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        w: Math.max(1, img.naturalWidth),
        h: Math.max(1, img.naturalHeight),
      });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function fitInto(maxW: number, maxH: number, natW: number, natH: number): NatSize {
  const scale = Math.min(maxW / natW, maxH / natH);
  return {
    w: Math.max(240, Math.round(natW * scale)),
    h: Math.max(160, Math.round(natH * scale)),
  };
}

/**
 * Before/after style compare: left of the handle shows the generated image,
 * right of the handle shows the original. Drag the center handle to reveal.
 *
 * Viewport is sized to the generated image so it fills the stage; the original
 * shares that frame with object-fit:contain (may letterbox if aspect differs).
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
  const [boxSize, setBoxSize] = useState<NatSize | null>(null);

  const updateFromClientX = useCallback((clientX: number) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, next)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBoxSize(null);

    void (async () => {
      const maxW = Math.min(1200, typeof window !== "undefined" ? window.innerWidth - 96 : 1200);
      const maxH = Math.min(680, typeof window !== "undefined" ? window.innerHeight * 0.62 : 680);
      // Prefer generated image for stage size so the result fills the compare frame.
      const left = await loadImageSize(leftSrc);
      if (cancelled) return;
      if (left) {
        setBoxSize(fitInto(maxW, maxH, left.w, left.h));
        return;
      }
      const right = await loadImageSize(rightSrc);
      if (cancelled) return;
      if (right) {
        setBoxSize(fitInto(maxW, maxH, right.w, right.h));
        return;
      }
      setBoxSize({ w: 960, h: 540 });
    })();

    return () => {
      cancelled = true;
    };
  }, [leftSrc, rightSrc]);

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
          : { width: "min(96vw, 1200px)", aspectRatio: "1 / 1", maxHeight: "62vh" }
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
