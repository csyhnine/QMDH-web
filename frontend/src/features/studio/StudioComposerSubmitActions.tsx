import type { SubmissionTracker } from "./studioTypes";

type StudioComposerSubmitActionsProps = {
  availableProviderCount: number;
  hasActiveProject: boolean;
  selectedStyleLabel: string;
  serviceHealthy: boolean;
  submitting: boolean;
  submissionProgress: SubmissionTracker | null;
  uploadingReference: boolean;
};

export default function StudioComposerSubmitActions({
  availableProviderCount,
  hasActiveProject,
  selectedStyleLabel,
  serviceHealthy,
  submitting,
  submissionProgress,
  uploadingReference,
}: StudioComposerSubmitActionsProps) {
  return (
    <div className="composer-toolbar-actions">
      <div className="composer-quickmeta">
        <span>{selectedStyleLabel}</span>
        <span>{serviceHealthy ? "服务在线" : "服务异常"}</span>
        {submissionProgress ? <span>{submissionProgress.stage}</span> : null}
      </div>

      <button
        type="submit"
        className="submit-button"
        disabled={submitting || uploadingReference || availableProviderCount === 0 || !hasActiveProject}
      >
        {submitting ? "正在创建..." : !hasActiveProject ? "请先新建项目" : "开始生成"}
      </button>
    </div>
  );
}
