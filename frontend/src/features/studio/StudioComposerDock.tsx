import { useRef } from "react";

import StudioComposerCollapsedBar from "./StudioComposerCollapsedBar";
import StudioComposerExpandedContent from "./StudioComposerExpandedContent";
import { getStudioComposerDockProps } from "./studioComposerDockProps";
import type { StudioComposerDockProps } from "./studioComposerDockTypes";
import { isComposerBlurWithinForm } from "./studioComposerDockUtils";

export default function StudioComposerDock(props: StudioComposerDockProps) {
  const {
    composerCollapsed,
    onComposerExpand,
    onComposerFocusChange,
    onSubmit,
  } = props;
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  function focusPromptAfterExpand() {
    onComposerExpand();
    window.requestAnimationFrame(() => promptTextareaRef.current?.focus());
  }

  function handlePromptSubmitShortcut() {
    formRef.current?.requestSubmit();
  }

  const { collapsedBarProps, expandedContentProps } = getStudioComposerDockProps(
    props,
    promptTextareaRef,
    focusPromptAfterExpand,
    handlePromptSubmitShortcut
  );

  function handleComposerBlur(event: React.FocusEvent<HTMLFormElement>) {
    if (isComposerBlurWithinForm(event)) {
      return;
    }
    onComposerFocusChange(false);
  }

  return (
    <form
      ref={formRef}
      className={composerCollapsed ? "composer-dock is-collapsed" : "composer-dock"}
      onSubmit={onSubmit}
      onFocusCapture={() => onComposerFocusChange(true)}
      onBlurCapture={handleComposerBlur}
    >
      {composerCollapsed ? (
        <StudioComposerCollapsedBar {...collapsedBarProps} />
      ) : null}

      <StudioComposerExpandedContent {...expandedContentProps} />
    </form>
  );
}
