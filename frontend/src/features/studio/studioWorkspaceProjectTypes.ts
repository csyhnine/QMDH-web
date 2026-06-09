import type { KeyboardEvent } from "react";

import type { Project } from "../../api";

export type StudioWorkspaceProjectListProps = {
  projects: Project[];
  renameValue: string;
  renamingProjectCode: string | null;
  selectedProjectCode: string;
  onProjectDelete: (project: Project) => void;
  onProjectSelect: (project: Project) => void;
  onRenameCancel: () => void;
  onRenameCommit: (projectCode: string) => void;
  onRenameStart: (project: Project) => void;
  onRenameValueChange: (value: string) => void;
};

export type StudioWorkspaceProjectItemProps = {
  project: Project;
  renameValue: string;
  renaming: boolean;
  selected: boolean;
  onProjectDelete: (project: Project) => void;
  onProjectSelect: (project: Project) => void;
  onRenameCancel: () => void;
  onRenameCommit: (projectCode: string) => void;
  onRenameStart: (project: Project) => void;
  onRenameValueChange: (value: string) => void;
};

export type StudioWorkspaceProjectActionsProps = {
  project: Project;
  onProjectDelete: (project: Project) => void;
  onRenameStart: (project: Project) => void;
};

export type StudioWorkspaceProjectRenameFormProps = {
  projectCode: string;
  renameValue: string;
  onRenameCancel: () => void;
  onRenameCommit: (projectCode: string) => void;
  onRenameValueChange: (value: string) => void;
};

export type StudioWorkspaceProjectRenameKeyDownOptions = {
  projectCode: string;
  renameValue: string;
  onRenameCancel: () => void;
  onRenameCommit: (projectCode: string) => void;
};

export type StudioWorkspaceProjectRenameKeyDownEvent = KeyboardEvent<HTMLInputElement>;
