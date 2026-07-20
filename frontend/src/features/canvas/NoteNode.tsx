import { type Node, type NodeProps } from "@xyflow/react";

import { CanvasDraftTextarea } from "./CanvasDraftField";
import { useCanvasNodeActions } from "./canvasNodeContext";
import type { NoteNodeData } from "./canvasTypes";

type NoteNodeProps = NodeProps<Node<NoteNodeData, "note">>;

export default function NoteNode({ id, data, selected }: NoteNodeProps) {
  const { disabled, patchNoteNode } = useCanvasNodeActions();

  return (
    <div className={`qmdh-canvas-note-node${selected ? " is-selected" : ""}`}>
      <header>备注</header>
      <CanvasDraftTextarea
        value={data.text}
        disabled={disabled}
        placeholder="输入备注…"
        rows={4}
        onCommit={(text) => patchNoteNode(id, { text })}
      />
    </div>
  );
}
