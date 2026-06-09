import StudioWorkspaceProjectActions from "./StudioWorkspaceProjectActions";
import StudioWorkspaceProjectRenameForm from "./StudioWorkspaceProjectRenameForm";
import type { StudioWorkspaceProjectItemProps } from "./studioWorkspaceProjectTypes";

export default function StudioWorkspaceProjectItem({
  project,
  renameValue,
  renaming,
  selected,
  onProjectDelete,
  onProjectSelect,
  onRenameCancel,
  onRenameCommit,
  onRenameStart,
  onRenameValueChange,
}: StudioWorkspaceProjectItemProps) {
  return (
    <div className={selected ? "workspace-item active" : "workspace-item"}>
      {renaming ? (
        <StudioWorkspaceProjectRenameForm
          projectCode={project.code}
          renameValue={renameValue}
          onRenameCancel={onRenameCancel}
          onRenameCommit={onRenameCommit}
          onRenameValueChange={onRenameValueChange}
        />
      ) : (
        <button type="button" className="workspace-item-btn" onClick={() => onProjectSelect(project)}>
          <strong>{project.name}</strong>
          <span>个人项目 / {project.classification}</span>
        </button>
      )}
      {!renaming && project.can_manage ? (
        <StudioWorkspaceProjectActions
          project={project}
          onProjectDelete={onProjectDelete}
          onRenameStart={onRenameStart}
        />
      ) : null}
    </div>
  );
}
