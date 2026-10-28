import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { dayNumber, type PlanningProject, type Stage } from "./planning";
import { resizeWorkEndpoint } from "./staffPlanning";

type Edge = "start" | "end";
type Preview = { projectId: number; stageId: string; edge: Edge; stage: Stage; x: number; y: number };
type Gesture = { id: number; element: HTMLButtonElement; project: PlanningProject; original: Stage; edge: Edge; y: number; scroll: number; clientX: number; clientY: number; stage: Stage; moved: boolean };

export default function usePillarResize({ board, rowHeight, start, days, disabled, onCommit, onBusy }: {
  board: RefObject<HTMLDivElement | null>; rowHeight: number; start: string; days: number; disabled: boolean;
  onCommit: (project: PlanningProject, stage: Stage, edge: Edge, offset: number) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null), [landed, setLanded] = useState("");
  const gesture = useRef<Gesture | null>(null), frame = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ onCommit, onBusy, rowHeight });
  latest.current = { onCommit, onBusy, rowHeight };
  function land(project: PlanningProject, stage: Stage) {
    setLanded(`${project.id}:${stage.id}`);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLanded(""), 260);
  }
  function update() {
    const g = gesture.current;
    if (!g) return;
    if (Math.abs(g.clientY - g.y) >= 4) g.moved = true;
    const offset = g.moved ? Math.round((g.clientY - g.y + (board.current?.scrollTop || 0) - g.scroll) / latest.current.rowHeight) : 0;
    g.stage = resizeWorkEndpoint(g.original, g.edge, offset);
    setPreview({ projectId: g.project.id!, stageId: g.original.id, edge: g.edge, stage: g.stage, x: g.clientX, y: g.clientY });
  }
  function finish(commit: boolean) {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    if (g.element.hasPointerCapture(g.id)) g.element.releasePointerCapture(g.id);
    setPreview(null);
    latest.current.onBusy(false);
    const offset = dayNumber(g.stage[g.edge]) - dayNumber(g.original[g.edge]);
    if (commit && offset) {
      land(g.project, g.stage);
      latest.current.onCommit(g.project, g.original, g.edge, offset);
    }
  }
  function tick() {
    const g = gesture.current, element = board.current;
    if (!g || !element) return;
    const box = element.getBoundingClientRect(), before = element.scrollTop;
    if (g.moved && g.clientY < box.top + 64) element.scrollTop -= Math.min(14, (box.top + 64 - g.clientY) / 3);
    else if (g.moved && g.clientY > box.bottom - 28) element.scrollTop += Math.min(14, (g.clientY - box.bottom + 28) / 3);
    if (element.scrollTop !== before) update();
    frame.current = requestAnimationFrame(tick);
  }
  useEffect(() => {
    const cancel = () => finish(false);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gesture.current) { event.preventDefault(); event.stopPropagation(); cancel(); }
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      cancelAnimationFrame(frame.current);
      if (timer.current) clearTimeout(timer.current);
      if (gesture.current) latest.current.onBusy(false);
    };
  }, []);
  useEffect(() => { finish(false); }, [start, days, rowHeight, disabled]);
  return { preview, landed, bind(project: PlanningProject, stage: Stage, edge: Edge) {
    return {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (event.button !== 0 || disabled || stage.milestone || gesture.current) return;
        event.preventDefault(); event.stopPropagation();
        event.currentTarget.focus({ preventScroll: true });
        gesture.current = { id: event.pointerId, element: event.currentTarget, project, original: stage, edge, y: event.clientY, scroll: board.current?.scrollTop || 0, clientX: event.clientX, clientY: event.clientY, stage, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        latest.current.onBusy(true);
        update();
        frame.current = requestAnimationFrame(tick);
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const g = gesture.current;
        if (!g || g.id !== event.pointerId) return;
        g.clientX = event.clientX; g.clientY = event.clientY; update();
      },
      onPointerUp(event: PointerEvent<HTMLButtonElement>) {
        const g = gesture.current;
        if (!g || g.id !== event.pointerId) return;
        g.clientX = event.clientX; g.clientY = event.clientY; update(); finish(true);
      },
      onPointerCancel: () => finish(false),
      onLostPointerCapture: () => finish(false),
      onClick: (event: React.MouseEvent) => { event.preventDefault(); event.stopPropagation(); },
      onKeyDown(event: React.KeyboardEvent) {
        if (gesture.current || disabled || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const next = resizeWorkEndpoint(stage, edge, (event.key === "ArrowUp" ? -1 : 1) * (event.shiftKey ? 7 : 1));
        const offset = dayNumber(next[edge]) - dayNumber(stage[edge]);
        if (offset) { land(project, stage); latest.current.onCommit(project, stage, edge, offset); }
      },
    };
  } };
}
