import type { StudioWorkspaceProjectRenameFormProps } from "./studioWorkspaceProjectTypes";
import { handleStudioWorkspaceProjectRenameKeyDown } from "./studioWorkspaceProjectUtils";

export default function StudioWorkspaceProjectRenameForm({
  projectCode,
  renameValue,
  onRenameCancel,
  onRenameCommit,
  onRenameValueChange,
}: StudioWorkspaceProjectRenameFormProps) {
  return (
    <div className="project-rename-form">
      <input
        type="text"
        value={renameValue}
        onChange={(event) => onRenameValueChange(event.target.value)}
        className="member-search-input"
        autoFocus
        onKeyDown={(event) =>
          handleStudioWorkspaceProjectRenameKeyDown(event, {
            projectCode,
            renameValue,
            onRenameCancel,
            onRenameCommit,
          })
        }
      />
      <button
        type="button"
        className="ghost-button ghost-button-sm"
        onClick={() => onRenameCommit(projectCode)}
      >
        保存
      </button>
      <button type="button" className="ghost-button ghost-button-sm" onClick={onRenameCancel}>
        取消
      </button>
    </div>
  );
}
