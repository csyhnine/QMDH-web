import { useCanvasMotion } from "./canvasMotion";
import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";

import type { GroupNodeData } from "./canvasTypes";

type GroupNodeProps = NodeProps<Node<GroupNodeData, "group">>;

export default function GroupNode({ id, data, selected }: GroupNodeProps) {
  const motionClass = useCanvasMotion(id);
  return (
    <div className={`qmdh-canvas-group-node${motionClass}${selected ? " is-selected" : ""}`}>
      <NodeResizer
        minWidth={160}
        minHeight={120}
        isVisible={selected}
        lineClassName="qmdh-canvas-group-resize-line"
        handleClassName="qmdh-canvas-group-resize-handle"
      />
      <header className="qmdh-canvas-group-label">{data.label || "编组"}</header>
    </div>
  );
}
