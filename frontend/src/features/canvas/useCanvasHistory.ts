import { useCallback, useMemo, useRef, useState } from "react";
import type { Edge } from "@xyflow/react";

import type { CanvasFlowNode } from "./canvasTypes";

export const CANVAS_HISTORY_LIMIT = 15;

export type CanvasHistorySnapshot = {
  nodes: CanvasFlowNode[];
  edges: Edge[];
};

export function cloneCanvasSnapshot(
  nodes: CanvasFlowNode[],
  edges: Edge[]
): CanvasHistorySnapshot {
  return {
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
  };
}

export function useCanvasHistory() {
  const pastRef = useRef<CanvasHistorySnapshot[]>([]);
  const futureRef = useRef<CanvasHistorySnapshot[]>([]);
  const isRestoringRef = useRef(false);
  const [epoch, setEpoch] = useState(0);

  const bump = useCallback(() => {
    setEpoch((value) => value + 1);
  }, []);

  const push = useCallback(
    (nodes: CanvasFlowNode[], edges: Edge[]) => {
      if (isRestoringRef.current) return;
      pastRef.current.push(cloneCanvasSnapshot(nodes, edges));
      if (pastRef.current.length > CANVAS_HISTORY_LIMIT) {
        pastRef.current.shift();
      }
      futureRef.current = [];
      bump();
    },
    [bump]
  );

  const pushSnapshot = useCallback(
    (snapshot: CanvasHistorySnapshot) => {
      if (isRestoringRef.current) return;
      pastRef.current.push(cloneCanvasSnapshot(snapshot.nodes, snapshot.edges));
      if (pastRef.current.length > CANVAS_HISTORY_LIMIT) {
        pastRef.current.shift();
      }
      futureRef.current = [];
      bump();
    },
    [bump]
  );

  const clear = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    bump();
  }, [bump]);

  const undo = useCallback(
    (current: CanvasHistorySnapshot): CanvasHistorySnapshot | null => {
      const previous = pastRef.current.pop();
      if (!previous) return null;
      futureRef.current.push(cloneCanvasSnapshot(current.nodes, current.edges));
      bump();
      return previous;
    },
    [bump]
  );

  const redo = useCallback(
    (current: CanvasHistorySnapshot): CanvasHistorySnapshot | null => {
      const next = futureRef.current.pop();
      if (!next) return null;
      pastRef.current.push(cloneCanvasSnapshot(current.nodes, current.edges));
      if (pastRef.current.length > CANVAS_HISTORY_LIMIT) {
        pastRef.current.shift();
      }
      bump();
      return next;
    },
    [bump]
  );

  return useMemo(
    () => ({
      push,
      pushSnapshot,
      undo,
      redo,
      clear,
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
      isRestoringRef,
    }),
    [push, pushSnapshot, undo, redo, clear, epoch]
  );
}
