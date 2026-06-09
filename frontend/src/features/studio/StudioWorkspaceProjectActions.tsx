import type { StudioWorkspaceProjectActionsProps } from "./studioWorkspaceProjectTypes";

export default function StudioWorkspaceProjectActions({
  project,
  onProjectDelete,
  onRenameStart,
}: StudioWorkspaceProjectActionsProps) {
  return (
    <div className="workspace-item-actions">
      <button
        type="button"
        className="project-rename-trigger"
        onClick={(event) => {
          event.stopPropagation();
          onRenameStart(project);
        }}
        title="重命名个人项目"
      >
        改名
      </button>
      <button
        type="button"
        className="project-rename-trigger"
        onClick={(event) => {
          event.stopPropagation();
          onProjectDelete(project);
        }}
        title="删除个人项目"
      >
        删除
      </button>
    </div>
  );
}
