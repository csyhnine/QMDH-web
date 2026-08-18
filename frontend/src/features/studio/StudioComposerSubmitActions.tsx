import type { SubmissionTracker } from "./studioTypes";
import { composerSubmitLabel } from "./studioComposerDockUtils";
import type { StudioFormState } from "./studioTypes";
import { useAuth } from "../../context/AuthContext";

type StudioComposerSubmitActionsProps = {
  availableProviderCount: number;
  creationMode: StudioFormState["creationMode"];
  hasActiveProject: boolean;
  referenceUploadCount: number;
  submitting: boolean;
  submissionProgress: SubmissionTracker | null;
  uploadingReference: boolean;
};

export default function StudioComposerSubmitActions({
  availableProviderCount,
  creationMode,
  hasActiveProject,
  referenceUploadCount,
  submitting,
  submissionProgress,
  uploadingReference,
}: StudioComposerSubmitActionsProps) {
  const { isGuest } = useAuth();
  const editNeedsReference = creationMode === "edit" && referenceUploadCount === 0;
  const submitLabel = isGuest
    ? "登录后生成"
    : submitting
      ? "正在创建..."
      : !hasActiveProject
        ? "请先新建项目"
        : composerSubmitLabel(creationMode, submitting, referenceUploadCount);
  const showShortcut =
    !isGuest &&
    !submitting &&
    hasActiveProject &&
    availableProviderCount > 0 &&
    !uploadingReference;

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
        disabled={
          isGuest ||
          submitting ||
          uploadingReference ||
          availableProviderCount === 0 ||
          !hasActiveProject ||
          editNeedsReference
        }
        aria-label={showShortcut ? `${submitLabel}，快捷键 Ctrl 加 Enter` : submitLabel}
      >
        <span className="composer-submit-button-label">{submitLabel}</span>
        {showShortcut ? <span className="composer-submit-button-shortcut">Ctrl + Enter</span> : null}
      </button>
    </div>
  );
}

