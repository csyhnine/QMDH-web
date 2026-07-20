import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type NodeChange,
  type EdgeChange,
  type OnMoveEnd,
  type OnSelectionChangeFunc,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import GenerateNode from "./GenerateNode";
import GroupNode from "./GroupNode";
import NoteNode from "./NoteNode";
import CanvasContextMenu from "./CanvasContextMenu";
import {
  createBlankGenerateNode,
  createBlankNoteNode,
  type CanvasNodeDefaults,
} from "./canvasGraphUtils";
import type { CanvasFlowNode, CanvasNodeKind } from "./canvasTypes";

const nodeTypes = {
  generate: GenerateNode,
  group: GroupNode,
  note: NoteNode,
};

type ConnectFrom = {
  nodeId: string;
  handleType: "source" | "target";
};

type BoardMenu = {
  x: number;
  y: number;
  flow: { x: number; y: number };
  connectFrom?: ConnectFrom;
};

type CanvasBoardProps = {
  boardKey: string | number;
  nodes: CanvasFlowNode[];
  edges: Edge[];
  viewport: Viewport;
  nodeDefaults: CanvasNodeDefaults;
  canGroup: boolean;
  canUngroup: boolean;
  disabled?: boolean;
  onNodesChange: (changes: NodeChange<CanvasFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onEdgesReplace: (edges: Edge[]) => void;
  onAddNode: (node: CanvasFlowNode) => void;
  onAddConnectedNode: (
    node: CanvasFlowNode,
    connection: { source: string; target: string }
  ) => void;
  onDropImages: (files: File[], position: { x: number; y: number }) => void;
  onGroupSelection: () => void;
  onUngroupSelection: () => void;
  onViewportChange: (viewport: Viewport) => void;
  onSelectedNodeIdsChange: (nodeIds: string[]) => void;
};

function clientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ("changedTouches" in event && event.changedTouches[0]) {
    return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  }
  if ("clientX" in event) {
    return { x: event.clientX, y: event.clientY };
  }
  return null;
}

function CanvasBoardInner({
  boardKey,
  nodes,
  edges,
  viewport,
  nodeDefaults,
  canGroup,
  canUngroup,
  disabled = false,
  onNodesChange,
  onEdgesChange,
  onEdgesReplace,
  onAddNode,
  onAddConnectedNode,
  onDropImages,
  onGroupSelection,
  onUngroupSelection,
  onViewportChange,
  onSelectedNodeIdsChange,
}: CanvasBoardProps) {
  const { screenToFlowPosition } = useReactFlow();
  const [menu, setMenu] = useState<BoardMenu | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!menu) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const onConnect = useCallback(
    (connection: Connection) => {
      onEdgesReplace(
        addEdge({ ...connection, id: `e-${connection.source}-${connection.target}-${Date.now()}` }, edges)
      );
    },
    [edges, onEdgesReplace]
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (disabled || connectionState.isValid || !connectionState.fromNode) return;
      const point = clientPoint(event);
      if (!point) return;
      const target = event.target as Element | null;
      if (target?.closest?.(".react-flow__handle")) return;
      setMenu({
        x: point.x,
        y: point.y,
        flow: screenToFlowPosition(point),
        connectFrom: {
          nodeId: connectionState.fromNode.id,
          handleType: connectionState.fromHandle?.type === "target" ? "target" : "source",
        },
      });
    },
    [disabled, screenToFlowPosition]
  );

  const onMoveEnd: OnMoveEnd = useCallback(
    (_event, nextViewport) => {
      onViewportChange(nextViewport);
    },
    [onViewportChange]
  );

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      onSelectedNodeIdsChange(selectedNodes.map((node) => node.id));
    },
    [onSelectedNodeIdsChange]
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | ReactMouseEvent) => {
      event.preventDefault();
      if (disabled) return;
      const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setMenu({ x: event.clientX, y: event.clientY, flow });
    },
    [disabled, screenToFlowPosition]
  );

  const addKind = useCallback(
    (kind: CanvasNodeKind) => {
      if (!menu) return;
      const node = createBlankGenerateNode(kind, menu.flow, nodeDefaults);
      if (menu.connectFrom) {
        const connection =
          menu.connectFrom.handleType === "source"
            ? { source: menu.connectFrom.nodeId, target: node.id }
            : { source: node.id, target: menu.connectFrom.nodeId };
        onAddConnectedNode(node, connection);
      } else {
        onAddNode(node);
      }
      setMenu(null);
    },
    [menu, nodeDefaults, onAddConnectedNode, onAddNode]
  );

  const addNote = useCallback(() => {
    if (!menu) return;
    onAddNode(createBlankNoteNode(menu.flow));
    setMenu(null);
  }, [menu, onAddNode]);

  const handleDragOver = useCallback(
    (event: DragEvent) => {
      if (disabled) return;
      if (![...event.dataTransfer.types].includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((event: DragEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) return;
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
      if (files.length === 0) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onDropImages(files, position);
    },
    [disabled, onDropImages, screenToFlowPosition]
  );

  const lastPaneClickRef = useRef(0);

  const addNoteAtClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (disabled) return;
      const flow = screenToFlowPosition({ x: clientX, y: clientY });
      onAddNode(createBlankNoteNode(flow, "备注"));
    },
    [disabled, onAddNode, screenToFlowPosition]
  );

  const isBlankCanvasTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    if (
      target.closest(
        ".react-flow__node, .react-flow__edge, .react-flow__handle, .react-flow__controls, .react-flow__minimap, .react-flow__panel, .qmdh-canvas-context-menu, .qmdh-canvas-drop-overlay"
      )
    ) {
      return false;
    }
    return Boolean(target.closest(".react-flow, .react-flow__pane, .react-flow__viewport, .react-flow__container"));
  }, []);

  const onPaneClick = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      setMenu(null);
      if (disabled) return;
      if (!isBlankCanvasTarget(event.target)) return;
      const now = Date.now();
      if (now - lastPaneClickRef.current < 350) {
        lastPaneClickRef.current = 0;
        event.preventDefault();
        addNoteAtClientPoint(event.clientX, event.clientY);
        return;
      }
      lastPaneClickRef.current = now;
    },
    [addNoteAtClientPoint, disabled, isBlankCanvasTarget]
  );

  const onPaneDoubleClick = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      if (disabled) return;
      if (!isBlankCanvasTarget(event.target)) return;
      event.preventDefault();
      lastPaneClickRef.current = 0;
      addNoteAtClientPoint(event.clientX, event.clientY);
    },
    [addNoteAtClientPoint, disabled, isBlankCanvasTarget]
  );

  const defaultViewport = useMemo(() => viewport, [viewport]);

  return (
    <div
      className={`qmdh-canvas-board-inner${dragOver ? " is-file-drag" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ReactFlow
        key={boardKey}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={disabled ? undefined : onNodesChange}
        onEdgesChange={disabled ? undefined : onEdgesChange}
        onConnect={disabled ? undefined : onConnect}
        onConnectEnd={disabled ? undefined : onConnectEnd}
        onMoveEnd={onMoveEnd}
        onSelectionChange={onSelectionChange}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={onPaneClick}
        onDoubleClick={onPaneDoubleClick}
        defaultViewport={defaultViewport}
        minZoom={0.2}
        maxZoom={2}
        deleteKeyCode={disabled ? null : ["Backspace", "Delete"]}
        multiSelectionKeyCode={disabled ? null : ["Meta", "Control"]}
        selectionOnDrag={!disabled}
        selectionMode={SelectionMode.Partial}
        panOnDrag={disabled ? true : [1, 2]}
        panOnScroll
        nodesDraggable={!disabled}
        nodesConnectable={!disabled}
        elementsSelectable={!disabled}
        proOptions={{ hideAttribution: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls showInteractive={!disabled} />
        <MiniMap pannable zoomable />
      </ReactFlow>
      {dragOver ? <div className="qmdh-canvas-drop-overlay">松开以创建「上传图片」节点</div> : null}
      {menu ? (
        <CanvasContextMenu
          x={menu.x}
          y={menu.y}
          title={menu.connectFrom ? "添加并连接节点" : "画布菜单"}
          canGroup={!menu.connectFrom && canGroup}
          canUngroup={!menu.connectFrom && canUngroup}
          onAdd={addKind}
          onAddNote={addNote}
          onGroup={() => {
            onGroupSelection();
            setMenu(null);
          }}
          onUngroup={() => {
            onUngroupSelection();
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}

export default function CanvasBoard(props: CanvasBoardProps) {
  return (
    <div className="qmdh-canvas-board">
      <ReactFlowProvider>
        <CanvasBoardInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
