import StudioNewProjectForm from "./StudioNewProjectForm";
import type { StudioWorkspaceCreateProjectPanelProps } from "./studioWorkspacePaneTypes";

export default function StudioWorkspaceCreateProjectPanel({
  canCreateProjects,
  newProjectName,
  showNewProjectForm,
  onCancelNewProject,
  onCreateProject,
  onNewProjectNameChange,
  onRequestNewProject,
}: StudioWorkspaceCreateProjectPanelProps) {
  return (
    <>
      {canCreateProjects ? (
        <button type="button" className="workspace-primary" onClick={onRequestNewProject}>
          + 新建个人项目
        </button>
      ) : null}

      {showNewProjectForm ? (
        <StudioNewProjectForm
          newProjectName={newProjectName}
          onCancelNewProject={onCancelNewProject}
          onCreateProject={onCreateProject}
          onNewProjectNameChange={onNewProjectNameChange}
        />
      ) : null}
    </>
  );
}
