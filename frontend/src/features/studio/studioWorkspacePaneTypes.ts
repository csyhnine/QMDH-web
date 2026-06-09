import type { Project } from "../../api";

export type StudioWorkspacePaneProps = {
  activeProject?: Project;
  canCreateProjects: boolean;
  newProjectName: string;
  projects: Project[];
  renameValue: string;
  renamingProjectCode: string | null;
  selectedProjectCode: string;
  showNewProjectForm: boolean;
  workspaceName: string;
  onCancelNewProject: () => void;
  onCreateProject: () => void;
  onNewProjectNameChange: (value: string) => void;
  onProjectDelete: (project: Project) => void;
  onProjectSelect: (project: Project) => void;
  onRenameCancel: () => void;
  onRenameCommit: (projectCode: string) => void;
  onRenameStart: (project: Project) => void;
  onRenameValueChange: (value: string) => void;
  onRequestNewProject: () => void;
};

export type StudioWorkspaceCreateProjectPanelProps = Pick<
  StudioWorkspacePaneProps,
  | "canCreateProjects"
  | "newProjectName"
  | "showNewProjectForm"
  | "onCancelNewProject"
  | "onCreateProject"
  | "onNewProjectNameChange"
  | "onRequestNewProject"
>;
