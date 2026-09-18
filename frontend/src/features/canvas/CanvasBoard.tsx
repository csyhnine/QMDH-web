import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
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
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import GenerateNode from "./GenerateNode";
import GroupNode from "./GroupNode";
import NoteNode from "./NoteNode";
import CanvasEdge from "./CanvasEdge";
import CanvasContextMenu from "./CanvasContextMenu";
import { CanvasEdgeInteractionProvider } from "./canvasEdgeContext";
import {
  createBlankGenerateNode,
  createBlankNoteNode,
  type CanvasNodeDefaults,
} from "./canvasGraphUtils";
import type { CanvasFlowNode, CanvasNodeKind } from "./canvasTypes";

const FIT_VIEW_OPTIONS = { padding: 0.2, duration: 240 } as const;
const MIDDLE_DOUBLE_MS = 380;
const MENU_PANE_SUPPRESS_MS = 480;

const nodeTypes = {
  generate: GenerateNode,
  group: GroupNode,
  note: NoteNode,
};

const edgeTypes = {
  default: CanvasEdge,
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
  disconnectEdgeId?: string;
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
  const { screenToFlowPosition, fitView, setCenter, getZoom, getNodes } = useReactFlow();
  const boardInnerRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<BoardMenu | null>(null);
  const menuRef = useRef<BoardMenu | null>(null);
  const suppressPaneUntilRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const suppressFileDropRef = useRef(false);
  const lastMiddleClickRef = useRef(0);

  useEffect(() => {
    menuRef.current = menu;
  }, [menu]);

  const openMenu = useCallback((next: BoardMenu) => {
    menuRef.current = next;
    setMenu(next);
  }, []);

  const closeMenu = useCallback(() => {
    menuRef.current = null;
    setMenu(null);
  }, []);

  const executeMenuAction = useCallback(
    (action: (currentMenu: BoardMenu) => void) => {
      const currentMenu = menuRef.current;
      if (!currentMenu) return;
      suppressPaneUntilRef.current = Date.now() + MENU_PANE_SUPPRESS_MS;
      action(currentMenu);
      window.setTimeout(() => closeMenu(), 0);
    },
    [closeMenu]
  );

  useEffect(() => {
    if (!menu) return;

    function isMenuTarget(target: EventTarget | null) {
      return target instanceof Element && Boolean(target.closest(".qmdh-canvas-context-menu"));
    }

    function onDocumentPointerDown(event: PointerEvent) {
      if (isMenuTarget(event.target)) {
        return;
      }
      if (event.button === 0) {
        closeMenu();
      }
    }

    function onDocumentClickCapture(event: MouseEvent) {
      if (Date.now() < suppressPaneUntilRef.current) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }

    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("click", onDocumentClickCapture, true);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      document.removeEventListener("click", onDocumentClickCapture, true);
    };
  }, [closeMenu, menu]);

  const placeNodeFromMenu = useCallback(
    (node: CanvasFlowNode, currentMenu: BoardMenu) => {
      if (currentMenu.connectFrom) {
        const connection =
          currentMenu.connectFrom.handleType === "source"
            ? { source: currentMenu.connectFrom.nodeId, target: node.id }
            : { source: node.id, target: currentMenu.connectFrom.nodeId };
        onAddConnectedNode(node, connection);
      } else {
        onAddNode(node);
      }
    },
    [onAddConnectedNode, onAddNode]
  );

  useEffect(() => {
    if (!menu) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMenu, menu]);

  const fitToNodes = useCallback(() => {
    if (getNodes().length === 0) return;
    void fitView(FIT_VIEW_OPTIONS);
  }, [fitView, getNodes]);

  /** Board remount (enter project/template): center viewport on nodes. */
  const onFlowInit = useCallback(() => {
    window.setTimeout(() => fitToNodes(), 40);
  }, [fitToNodes]);

  /** Double middle-click on the pane triggers the fit-view control. */
  useEffect(() => {
    const root = boardInnerRef.current;
    if (!root) return;

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 1) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".react-flow__minimap, .react-flow__controls, .qmdh-canvas-context-menu")
      ) {
        return;
      }
      const now = Date.now();
      if (now - lastMiddleClickRef.current < MIDDLE_DOUBLE_MS) {
        event.preventDefault();
        event.stopPropagation();
        lastMiddleClickRef.current = 0;
        fitToNodes();
        return;
      }
      lastMiddleClickRef.current = now;
    }

    root.addEventListener("pointerdown", onPointerDown, true);
    return () => root.removeEventListener("pointerdown", onPointerDown, true);
  }, [fitToNodes]);

  const onMiniMapClick = useCallback(
    (_event: ReactMouseEvent, position: XYPosition) => {
      setCenter(position.x, position.y, { zoom: getZoom(), duration: 160 });
    },
    [getZoom, setCenter]
  );
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
      openMenu({
        x: point.x,
        y: point.y,
        flow: screenToFlowPosition(point),
        connectFrom: {
          nodeId: connectionState.fromNode.id,
          handleType: connectionState.fromHandle?.type === "target" ? "target" : "source",
        },
      });
    },
    [disabled, openMenu, screenToFlowPosition]
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
      openMenu({ x: event.clientX, y: event.clientY, flow });
    },
    [disabled, openMenu, screenToFlowPosition]
  );

  const onEdgeContextMenu = useCallback(
    (event: MouseEvent | ReactMouseEvent, edge: Edge) => {
      event.preventDefault();
      if (disabled) return;
      openMenu({
        x: event.clientX,
        y: event.clientY,
        flow: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        disconnectEdgeId: edge.id,
      });
    },
    [disabled, openMenu, screenToFlowPosition]
  );

  const disconnectEdge = useCallback(
    (edgeId: string) => {
      onEdgesReplace(edges.filter((edge) => edge.id !== edgeId));
    },
    [edges, onEdgesReplace]
  );

  const addKind = useCallback(
    (kind: CanvasNodeKind) => {
      executeMenuAction((currentMenu) => {
        const node = createBlankGenerateNode(kind, currentMenu.flow, nodeDefaults);
        placeNodeFromMenu(node, currentMenu);
      });
    },
    [executeMenuAction, nodeDefaults, placeNodeFromMenu]
  );

  const addNote = useCallback(() => {
    executeMenuAction((currentMenu) => {
      onAddNode(createBlankNoteNode(currentMenu.flow));
    });
  }, [executeMenuAction, onAddNode]);

  const handleNodeMediaDragStartCapture = useCallback((event: DragEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(".qmdh-canvas-node")) return;
    if (!(target instanceof HTMLImageElement || target instanceof HTMLVideoElement)) return;
    event.preventDefault();
    suppressFileDropRef.current = true;
  }, []);

  const handleNodeMediaDragEndCapture = useCallback(() => {
    suppressFileDropRef.current = false;
    setDragOver(false);
  }, []);

  const handleDragOver = useCallback(
    (event: DragEvent) => {
      if (disabled || suppressFileDropRef.current) return;
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
      if (disabled || suppressFileDropRef.current) {
        suppressFileDropRef.current = false;
        return;
      }
      const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
      if (files.length === 0) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onDropImages(files, position);
    },
    [disabled, onDropImages, screenToFlowPosition]
  );

  const onPaneClick = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      if (menuRef.current) return;
      if (Date.now() < suppressPaneUntilRef.current) return;
      if ("button" in event && event.button !== 0) return;

      const target = event.target;
      if (target instanceof Element && target.closest(".qmdh-canvas-context-menu")) {
        return;
      }
      closeMenu();
    },
    [closeMenu]
  );

  const defaultViewport = useMemo(() => viewport, [viewport]);

  const contextMenuPortal =
    menu && typeof document !== "undefined"
      ? createPortal(
          menu.disconnectEdgeId ? (
            <div
              className="qmdh-canvas-context-menu"
              style={{ left: menu.x, top: menu.y }}
              role="menu"
            >
              <header>连线</header>
              <button
                type="button"
                role="menuitem"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  executeMenuAction((currentMenu) => {
                    if (currentMenu.disconnectEdgeId) {
                      disconnectEdge(currentMenu.disconnectEdgeId);
                    }
                  });
                }}
              >
                断开连线
              </button>
              <button
                type="button"
                className="muted"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  closeMenu();
                }}
              >
                取消
              </button>
            </div>
          ) : (
            <CanvasContextMenu
              x={menu.x}
              y={menu.y}
              title={menu.connectFrom ? "添加并连接节点" : "画布菜单"}
              canGroup={!menu.connectFrom && canGroup}
              canUngroup={!menu.connectFrom && canUngroup}
              onAdd={addKind}
              onAddNote={addNote}
              onGroup={() => {
                executeMenuAction(() => onGroupSelection());
              }}
              onUngroup={() => {
                executeMenuAction(() => onUngroupSelection());
              }}
              onClose={closeMenu}
            />
          ),
          document.body
        )
      : null;

  return (
    <div
      ref={boardInnerRef}
      className={`qmdh-canvas-board-inner${dragOver ? " is-file-drag" : ""}`}
      onDragStartCapture={handleNodeMediaDragStartCapture}
      onDragEndCapture={handleNodeMediaDragEndCapture}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <CanvasEdgeInteractionProvider disabled={Boolean(disabled)}>
        <ReactFlow
          key={boardKey}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={disabled ? undefined : onNodesChange}
          onEdgesChange={disabled ? undefined : onEdgesChange}
          onConnect={disabled ? undefined : onConnect}
          onConnectEnd={disabled ? undefined : onConnectEnd}
          onMoveEnd={onMoveEnd}
          onSelectionChange={onSelectionChange}
          onPaneContextMenu={onPaneContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneClick={onPaneClick}
          onInit={onFlowInit}
          defaultViewport={defaultViewport}
          minZoom={0.2}
          maxZoom={2}
          deleteKeyCode={disabled ? null : ["Delete", "Backspace"]}
          multiSelectionKeyCode={disabled ? null : ["Meta", "Control"]}
          selectionOnDrag={!disabled}
          selectionMode={SelectionMode.Partial}
          panOnDrag={disabled ? true : [1, 2]}
          panOnScroll
          zoomOnDoubleClick={false}
          nodesDraggable={!disabled}
          nodesConnectable={!disabled}
          elementsSelectable={!disabled}
          edgesFocusable={!disabled}
          proOptions={{ hideAttribution: true }}
          style={{ width: "100%", height: "100%" }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls showInteractive={!disabled} fitViewOptions={FIT_VIEW_OPTIONS} />
          <MiniMap
            className="qmdh-canvas-minimap"
            pannable
            zoomable
            ariaLabel="画布缩略图，拖拽或点击可移动视角"
            onClick={onMiniMapClick}
            maskColor="rgba(15, 23, 42, 0.18)"
            maskStrokeColor="rgba(37, 99, 235, 0.9)"
            maskStrokeWidth={2}
            nodeStrokeWidth={2}
            style={{ width: 176, height: 128 }}
          />
        </ReactFlow>
      </CanvasEdgeInteractionProvider>
      {dragOver ? <div className="qmdh-canvas-drop-overlay">松开以创建「上传图片」节点</div> : null}
      {contextMenuPortal}
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
