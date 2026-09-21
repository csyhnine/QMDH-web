import { useRef } from "react";

import PromptPolishHistoryPanel from "../../components/shared/PromptPolishHistoryPanel";
import { usePromptPolishEnabled } from "../../lib/usePromptPolishEnabled";
import StudioComposerCollapsedBar from "./StudioComposerCollapsedBar";
import StudioComposerExpandedContent from "./StudioComposerExpandedContent";
import { getStudioComposerDockProps } from "./studioComposerDockProps";
import type { StudioComposerDockProps } from "./studioComposerDockTypes";
import { isComposerBlurWithinForm } from "./studioComposerDockUtils";
import { useStudioPromptPolish } from "./useStudioPromptPolish";

export default function StudioComposerDock(props: StudioComposerDockProps) {
  const {
    composerCollapsed,
    onComposerExpand,
    onComposerFocusChange,
    onSubmit,
    studioForm,
    referenceUploads,
    onPromptChange,
    onPromptPolished,
  } = props;
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const promptPolishEnabled = usePromptPolishEnabled();
  const {
    polishing,
    polishPrompt,
    error: polishError,
    notice: polishNotice,
    history: polishHistory,
    activeHistoryId: activePolishHistoryId,
    applyHistoryEntry,
    applySourceEntry,
  } = useStudioPromptPolish({
    studioForm,
    referenceUploads,
    onPromptChange,
    onPolished: onPromptPolished,
  });

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

  const showPolishSidebar = (promptPolishEnabled ?? false) && !composerCollapsed;

  return (
    <form
      ref={formRef}
      className={[
        composerCollapsed ? "composer-dock is-collapsed" : "composer-dock",
        showPolishSidebar ? "has-polish-sidebar" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onSubmit={onSubmit}
      onFocusCapture={() => onComposerFocusChange(true)}
      onBlurCapture={handleComposerBlur}
    >
      {composerCollapsed ? (
        <StudioComposerCollapsedBar {...collapsedBarProps} />
      ) : (
        <div className="composer-dock-row">
          <div className="composer-dock-main">
            <StudioComposerExpandedContent
              {...expandedContentProps}
              polishingPrompt={polishing}
              polishError={polishError}
              polishNotice={polishNotice}
              polishHistory={polishHistory}
              activePolishHistoryId={activePolishHistoryId}
              onSelectPolishHistory={applyHistoryEntry}
              onRestorePolishSource={applySourceEntry}
              promptPolishEnabled={promptPolishEnabled ?? false}
              onPolishPrompt={() => void polishPrompt()}
            />
          </div>
          {showPolishSidebar ? (
            <PromptPolishHistoryPanel
              className="composer-polish-sidebar"
              variant="sidebar"
              history={polishHistory}
              activeEntryId={activePolishHistoryId}
              currentPrompt={studioForm.prompt}
              disabled={polishing}
              showWhenEmpty
              onSelect={applyHistoryEntry}
              onRestoreSource={applySourceEntry}
            />
          ) : null}
        </div>
      )}
    </form>
  );
}
