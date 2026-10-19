import type { SubmissionTracker } from "./studioTypes";
import { composerSubmitLabel } from "./studioComposerDockUtils";
import type { StudioFormState } from "./studioTypes";
import { useAuth } from "../../context/AuthContext";

type StudioComposerSubmitActionsProps = {
  availableProviderCount: number;
  creationMode: StudioFormState["creationMode"];
  hasActiveProject: boolean;
  prompt: string;
  referenceUploadCount: number;
  submitting: boolean;
  submissionProgress: SubmissionTracker | null;
  uploadingReference: boolean;
  promptPolishEnabled?: boolean;
  polishingPrompt?: boolean;
  onPolishPrompt?: () => void;
  requiresTwoImages?: boolean;
};

export default function StudioComposerSubmitActions({
  availableProviderCount,
  creationMode,
  hasActiveProject,
  prompt,
  referenceUploadCount,
  submitting,
  submissionProgress,
  uploadingReference,
  promptPolishEnabled = false,
  polishingPrompt = false,
  onPolishPrompt,
  requiresTwoImages = false,
}: StudioComposerSubmitActionsProps) {
  const { isGuest } = useAuth();
  const editNeedsReference = creationMode === "edit" && (requiresTwoImages ? referenceUploadCount !== 2 : referenceUploadCount === 0);
  const submitLabel = isGuest
    ? "登录后生成"
    : submitting
      ? "正在创建..."
      : !hasActiveProject
        ? "请先新建项目"
        : requiresTwoImages && editNeedsReference
          ? referenceUploadCount === 0 ? "请上传两张图片" : referenceUploadCount === 1 ? "请补充第 2 张图" : "请仅保留两张图"
          : composerSubmitLabel(creationMode, submitting, referenceUploadCount);
  const showShortcut =
    !isGuest &&
    !submitting &&
    hasActiveProject &&
    availableProviderCount > 0 &&
    !uploadingReference && !editNeedsReference;
  const canPolish = promptPolishEnabled && prompt.trim().length > 0 && !polishingPrompt && !submitting;

  return (
    <div className="composer-toolbar-actions">
      {submissionProgress ? (
        <div className="composer-quickmeta">
          <span>{({running: "执行中", completed: "已提交", queued: "排队中", pending: "等待中", failed: "提交失败"} as Record<string, string>)[submissionProgress.stage] ?? submissionProgress.stage}</span>
        </div>
      ) : null}

      {promptPolishEnabled ? (
        <button
          type="button"
          className="composer-polish-button composer-toolbar-polish-button"
          disabled={!canPolish}
          onClick={() => onPolishPrompt?.()}
          title="使用 LLM 优化当前提示词（会参考已上传图片）"
        >
          {polishingPrompt ? "润色中..." : "润色"}
        </button>
      ) : null}

      <button
        type="submit"
        className="submit-button composer-submit-button"
        disabled={
          isGuest ||
          submitting ||
          uploadingReference ||
          polishingPrompt ||
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
