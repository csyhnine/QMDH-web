import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";

import type { ComposerMenuKey } from "./studioTypes";

type UseStudioComposerCollapseOptions = {
  activeComposerMenu: ComposerMenuKey;
  composerFocused: boolean;
  isStudioDockLayout: boolean;
  latestTaskId: number | null | undefined;
  setActiveComposerMenu: Dispatch<SetStateAction<ComposerMenuKey>>;
  submitting: boolean;
  uploadingReference: boolean;
};

export function useStudioComposerCollapse({
  activeComposerMenu,
  composerFocused,
  isStudioDockLayout,
  latestTaskId,
  setActiveComposerMenu,
  submitting,
  uploadingReference,
}: UseStudioComposerCollapseOptions) {
  const [composerCollapsed, setComposerCollapsed] = useState(false);
  const composerToolbarRef = useRef<HTMLDivElement | null>(null);
  const studioScrollPaneRef = useRef<HTMLDivElement | null>(null);
  const composerCollapseLockUntilRef = useRef(0);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!composerToolbarRef.current) return;
      if (!(event.target instanceof Node)) return;
      if (!composerToolbarRef.current.contains(event.target)) {
        setActiveComposerMenu(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [setActiveComposerMenu]);

  useEffect(() => {
    if (!isStudioDockLayout) {
      setComposerCollapsed(false);
      return undefined;
    }

    const pane = studioScrollPaneRef.current;
    if (!pane) return undefined;

    const evaluateComposerCollapse = () => {
      const now = Date.now();
      const scrollTop = pane.scrollTop;
      const distanceFromBottom = pane.scrollHeight - pane.clientHeight - scrollTop;
      const engaged = composerFocused || activeComposerMenu !== null || submitting || uploadingReference;
      setComposerCollapsed((current) => {
        if (engaged) return false;
        if (scrollTop < 140) return false;

        if (now < composerCollapseLockUntilRef.current) {
          return current;
        }

        let next = false;
        if (current) {
          next = distanceFromBottom >= 220;
        } else if (scrollTop > 220 && distanceFromBottom > 300) {
          next = true;
        }

        if (next !== current) {
          composerCollapseLockUntilRef.current = now + 220;
        }
        return next;
      });
    };

    const frameId = window.requestAnimationFrame(() => {
      evaluateComposerCollapse();
    });
    pane.addEventListener("scroll", evaluateComposerCollapse, { passive: true });
    window.addEventListener("resize", evaluateComposerCollapse);
    return () => {
      window.cancelAnimationFrame(frameId);
      pane.removeEventListener("scroll", evaluateComposerCollapse);
      window.removeEventListener("resize", evaluateComposerCollapse);
    };
  }, [activeComposerMenu, composerCollapsed, composerFocused, isStudioDockLayout, latestTaskId, submitting, uploadingReference]);

  return {
    composerCollapsed,
    composerToolbarRef,
    setComposerCollapsed,
    studioScrollPaneRef,
  };
}
