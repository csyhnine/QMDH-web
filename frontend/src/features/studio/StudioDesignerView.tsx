import StudioCanvasView from "./StudioCanvasView";
import StudioWorkspacePane from "./StudioWorkspacePane";
import { buildStudioCanvasProps } from "./studioCanvasProps";
import type { StudioDesignerViewProps } from "./studioDesignerViewTypes";
import { useAuth } from "../../context/AuthContext";

export default function StudioDesignerView(props: StudioDesignerViewProps) {
  const { isGuest } = useAuth();
  const {
    activeViewIsStudio,
    derivedState,
    isStudioDockLayout,
    state,
    studioForm,
    studioProjects,
  } = props;
  const { activeProject, workspaceName } = derivedState;
  const canvasProps = buildStudioCanvasProps(props);

  return (
    <>
      {activeViewIsStudio ? (
        <StudioWorkspacePane
          activeProject={activeProject}
          canCreateProjects={!isGuest}
          newProjectName={studioProjects.newProjectName}
          projects={state.projects}
          renameValue={studioProjects.renameValue}
          renamingProjectCode={studioProjects.renamingProjectCode}
          selectedProjectCode={studioForm.projectCode}
          showNewProjectForm={studioProjects.showNewProjectForm}
          workspaceName={workspaceName}
          onCancelNewProject={studioProjects.resetNewProjectDraft}
          onCreateProject={studioProjects.createProject}
          onNewProjectNameChange={studioProjects.setNewProjectName}
          onProjectDelete={studioProjects.deleteProject}
          onProjectSelect={studioProjects.selectProject}
          onRenameCancel={studioProjects.cancelProjectRename}
          onRenameCommit={studioProjects.commitProjectRename}
          onRenameStart={studioProjects.startProjectRename}
          onRenameValueChange={studioProjects.setRenameValue}
          onRequestNewProject={studioProjects.requestNewProject}
        />
      ) : null}

      <main className={isStudioDockLayout ? "canvas-area canvas-studio-layout" : "canvas-area"}>
        <StudioCanvasView {...canvasProps} />
      </main>
    </>
  );
}
