import type { SubmissionTracker } from "./studioTypes";
import { composerSubmitLabel } from "./studioComposerDockUtils";
import type { StudioFormState } from "./studioTypes";

type StudioComposerSubmitActionsProps = {
  availableProviderCount: number;
  creationMode: StudioFormState["creationMode"];
  hasActiveProject: boolean;
  submitting: boolean;
  submissionProgress: SubmissionTracker | null;
  uploadingReference: boolean;
};

export default function StudioComposerSubmitActions({
  availableProviderCount,
  creationMode,
  hasActiveProject,
  submitting,
  submissionProgress,
  uploadingReference,
}: StudioComposerSubmitActionsProps) {
  const submitLabel = submitting
    ? "正在创建..."
    : !hasActiveProject
      ? "请先新建项目"
      : composerSubmitLabel(creationMode, submitting);
  const showShortcut =
    !submitting && hasActiveProject && availableProviderCount > 0 && !uploadingReference;

  return (
    <div className="composer-toolbar-actions">
      {submissionProgress ? (
        <div className="composer-quickmeta">
          <span>{submissionProgress.stage}</span>
        </div>
      ) : null}

      <button
        type="submit"
        className="submit-button composer-submit-button"
        disabled={submitting || uploadingReference || availableProviderCount === 0 || !hasActiveProject}
        aria-label={showShortcut ? `${submitLabel}，快捷键 Ctrl 加 Enter` : submitLabel}
      >
        <span className="composer-submit-button-label">{submitLabel}</span>
        {showShortcut ? <span className="composer-submit-button-shortcut">Ctrl + Enter</span> : null}
      </button>
    </div>
  );
}
