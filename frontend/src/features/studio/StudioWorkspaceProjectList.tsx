import StudioWorkspaceProjectItem from "./StudioWorkspaceProjectItem";
import type { StudioWorkspaceProjectListProps } from "./studioWorkspaceProjectTypes";

export default function StudioWorkspaceProjectList({
  projects,
  renameValue,
  renamingProjectCode,
  selectedProjectCode,
  onProjectDelete,
  onProjectSelect,
  onRenameCancel,
  onRenameCommit,
  onRenameStart,
  onRenameValueChange,
}: StudioWorkspaceProjectListProps) {
  return (
    <div className="workspace-list">
      {projects.map((project) => (
        <StudioWorkspaceProjectItem
          key={project.id}
          project={project}
          renameValue={renameValue}
          renaming={renamingProjectCode === project.code}
          selected={project.code === selectedProjectCode}
          onProjectDelete={onProjectDelete}
          onProjectSelect={onProjectSelect}
          onRenameCancel={onRenameCancel}
          onRenameCommit={onRenameCommit}
          onRenameStart={onRenameStart}
          onRenameValueChange={onRenameValueChange}
        />
      ))}
    </div>
  );
}
