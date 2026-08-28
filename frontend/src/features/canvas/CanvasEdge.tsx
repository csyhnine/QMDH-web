import { useEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";

import { useCanvasEdgeInteraction } from "./canvasEdgeContext";

const HOVER_HIDE_DELAY_MS = 220;

type EdgeBreakButtonProps = {
  x: number;
  y: number;
  visible: boolean;
  selected: boolean;
  onDelete: () => void;
  onHoverChange: (hovered: boolean) => void;
};

function EdgeBreakButton({ x, y, visible, selected, onDelete, onHoverChange }: EdgeBreakButtonProps) {
  return (
    <div
      className={`qmdh-canvas-edge-break-wrap nodrag nopan${visible ? " is-visible" : ""}${selected ? " is-selected" : ""}`}
      style={{
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
      }}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      {visible ? (
        <button
          type="button"
          className="qmdh-canvas-edge-break"
          title="断开连线（Delete）"
          aria-label="断开连线"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export default function CanvasEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
}: EdgeProps<Edge>) {
  const { deleteElements } = useReactFlow();
  const { disabled } = useCanvasEdgeInteraction();
  const [hovered, setHovered] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const setHoverActive = (active: boolean) => {
    if (active) {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setHovered(true);
      return;
    }
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setHovered(false);
    }, HOVER_HIDE_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    },
    []
  );

  const showBreak = !disabled && (hovered || selected);
  const deleteEdge = () => {
    void deleteElements({ edges: [{ id }] });
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={40}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={40}
        className="qmdh-canvas-edge-hit"
        onMouseEnter={() => setHoverActive(true)}
        onMouseLeave={() => setHoverActive(false)}
      />
      <EdgeLabelRenderer>
        <EdgeBreakButton
          x={labelX}
          y={labelY}
          visible={showBreak}
          selected={Boolean(selected)}
          onDelete={deleteEdge}
          onHoverChange={setHoverActive}
        />
      </EdgeLabelRenderer>
    </>
  );
}
