import { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";

import { useCanvasEdgeInteraction } from "./canvasEdgeContext";

function endpointBreakPosition(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  end: "source" | "target",
  ratio = 0.18
) {
  if (end === "source") {
    return {
      x: sourceX + (targetX - sourceX) * ratio,
      y: sourceY + (targetY - sourceY) * ratio,
    };
  }
  return {
    x: targetX + (sourceX - targetX) * ratio,
    y: targetY + (sourceY - targetY) * ratio,
  };
}

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
          title="断开连线"
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
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const showBreak = !disabled && (hovered || selected);
  const sourceBreak = endpointBreakPosition(sourceX, sourceY, targetX, targetY, "source");
  const targetBreak = endpointBreakPosition(sourceX, sourceY, targetX, targetY, "target");

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
        interactionWidth={32}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={32}
        className="qmdh-canvas-edge-hit"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <EdgeLabelRenderer>
        <EdgeBreakButton
          x={sourceBreak.x}
          y={sourceBreak.y}
          visible={showBreak}
          selected={Boolean(selected)}
          onDelete={deleteEdge}
          onHoverChange={setHovered}
        />
        <EdgeBreakButton
          x={targetBreak.x}
          y={targetBreak.y}
          visible={showBreak}
          selected={Boolean(selected)}
          onDelete={deleteEdge}
          onHoverChange={setHovered}
        />
      </EdgeLabelRenderer>
    </>
  );
}
