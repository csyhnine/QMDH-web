import { ADDABLE_NODE_KINDS, NODE_KIND_LABEL, type CanvasNodeKind } from "./canvasTypes";

type CanvasContextMenuProps = {
  x: number;
  y: number;
  title?: string;
  canGroup?: boolean;
  canUngroup?: boolean;
  onAdd: (kind: CanvasNodeKind) => void;
  onAddNote?: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  onClose: () => void;
};

export default function CanvasContextMenu({
  x,
  y,
  title = "添加节点",
  canGroup = false,
  canUngroup = false,
  onAdd,
  onAddNote,
  onGroup,
  onUngroup,
  onClose,
}: CanvasContextMenuProps) {
  return (
    <div className="qmdh-canvas-context-menu" style={{ left: x, top: y }} role="menu">
      <header>{title}</header>
      {canGroup ? (
        <button type="button" role="menuitem" onClick={() => onGroup?.()}>
          编组所选
        </button>
      ) : null}
      {canUngroup ? (
        <button type="button" role="menuitem" onClick={() => onUngroup?.()}>
          解散编组
        </button>
      ) : null}
      {(canGroup || canUngroup) && <div className="qmdh-canvas-context-menu-sep" />}
      {ADDABLE_NODE_KINDS.map((kind) => (
        <button key={kind} type="button" role="menuitem" onClick={() => onAdd(kind)}>
          {NODE_KIND_LABEL[kind]}
        </button>
      ))}
      <button type="button" role="menuitem" onClick={() => onAddNote?.()}>
        备注文字
      </button>
      <button type="button" className="muted" onClick={onClose}>
        取消
      </button>
    </div>
  );
}
