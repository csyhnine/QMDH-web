import StudioWorkspaceCreateProjectPanel from "./StudioWorkspaceCreateProjectPanel";
import StudioWorkspaceHeader from "./StudioWorkspaceHeader";
import StudioWorkspaceProjectList from "./StudioWorkspaceProjectList";
import type { StudioWorkspacePaneProps } from "./studioWorkspacePaneTypes";

export default function StudioWorkspacePane({
  activeProject,
  canCreateProjects,
  newProjectName,
  projects,
  renameValue,
  renamingProjectCode,
  selectedProjectCode,
  showNewProjectForm,
  workspaceName,
  onCancelNewProject,
  onCreateProject,
  onNewProjectNameChange,
  onProjectDelete,
  onProjectSelect,
  onRenameCancel,
  onRenameCommit,
  onRenameStart,
  onRenameValueChange,
  onRequestNewProject,
}: StudioWorkspacePaneProps) {
  return (
    <aside className="workspace-pane">
      <StudioWorkspaceHeader activeProject={activeProject} workspaceName={workspaceName} />

      <StudioWorkspaceCreateProjectPanel
        canCreateProjects={canCreateProjects}
        newProjectName={newProjectName}
        showNewProjectForm={showNewProjectForm}
        onCancelNewProject={onCancelNewProject}
        onCreateProject={onCreateProject}
        onNewProjectNameChange={onNewProjectNameChange}
        onRequestNewProject={onRequestNewProject}
      />

      <StudioWorkspaceProjectList
        projects={projects}
        renameValue={renameValue}
        renamingProjectCode={renamingProjectCode}
        selectedProjectCode={selectedProjectCode}
        onProjectDelete={onProjectDelete}
        onProjectSelect={onProjectSelect}
        onRenameCancel={onRenameCancel}
        onRenameCommit={onRenameCommit}
        onRenameStart={onRenameStart}
        onRenameValueChange={onRenameValueChange}
      />
    </aside>
  );
}
