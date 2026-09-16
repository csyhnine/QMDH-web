import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";

import type { ComposerMenuKey } from "./studioTypes";

/** Scroll down far enough before auto-collapsing the composer. */
const COLLAPSE_MIN_SCROLL_TOP = 220;
/** Require extra headroom below the viewport before collapsing. */
const COLLAPSE_MIN_DISTANCE_FROM_BOTTOM = 360;
/** Scrolling back near the top always expands the composer. */
const EXPAND_MAX_SCROLL_TOP = 140;
/** Ignore rapid collapse/expand flips while layout settles. */
const COLLAPSE_LOCK_MS = 400;

type UseStudioComposerCollapseOptions = {
  activeComposerMenu: ComposerMenuKey;
  composerFocused: boolean;
  isStudioDockLayout: boolean;
  setActiveComposerMenu: Dispatch<SetStateAction<ComposerMenuKey>>;
  submitting: boolean;
  uploadingReference: boolean;
};

export function useStudioComposerCollapse({
  activeComposerMenu,
  composerFocused,
  isStudioDockLayout,
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
        if (scrollTop < EXPAND_MAX_SCROLL_TOP) return false;

        if (now < composerCollapseLockUntilRef.current) {
          return current;
        }

        let next = current;
        if (current) {
          // Once collapsed, stay collapsed until the user scrolls back toward the top.
          // Do not use distanceFromBottom here: collapsing shrinks the dock and would
          // otherwise re-trigger an immediate expand (layout feedback loop).
          next = true;
        } else if (scrollTop > COLLAPSE_MIN_SCROLL_TOP && distanceFromBottom > COLLAPSE_MIN_DISTANCE_FROM_BOTTOM) {
          next = true;
        } else {
          next = false;
        }

        if (next !== current) {
          composerCollapseLockUntilRef.current = now + COLLAPSE_LOCK_MS;
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
  }, [activeComposerMenu, composerFocused, isStudioDockLayout, submitting, uploadingReference]);

  return {
    composerCollapsed,
    composerToolbarRef,
    setComposerCollapsed,
    studioScrollPaneRef,
  };
}
