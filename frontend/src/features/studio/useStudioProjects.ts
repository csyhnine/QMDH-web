import { type Dispatch, type SetStateAction, useState } from "react";

import { api, type Project } from "../../api";
import type { StudioFormState } from "./studioTypes";

type UseStudioProjectsOptions = {
  loadData: () => Promise<void>;
  onError: (message: string) => void;
  projects: Project[];
  selectedProjectCode: string;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
};

export type StudioProjectsState = ReturnType<typeof useStudioProjects>;

export function useStudioProjects({
  loadData,
  onError,
  projects,
  selectedProjectCode,
  setStudioForm,
}: UseStudioProjectsOptions) {
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [renamingProjectCode, setRenamingProjectCode] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function selectProject(project: Project) {
    setStudioForm((current) => ({
      ...current,
      projectCode: project.code,
      classification: project.classification,
    }));
  }

  function resetNewProjectDraft() {
    setShowNewProjectForm(false);
    setNewProjectName("");
  }

  async function createProject() {
    const trimmedName = newProjectName.trim();
    if (!trimmedName) return;

    try {
      await api.createProject(trimmedName);
      resetNewProjectDraft();
      await loadData();
    } catch (err) {
      onError(err instanceof Error ? err.message : "创建个人项目失败");
    }
  }

  function startProjectRename(project: Project) {
    setRenamingProjectCode(project.code);
    setRenameValue(project.name);
  }

  function cancelProjectRename() {
    setRenamingProjectCode(null);
    setRenameValue("");
  }

  async function commitProjectRename(projectCode: string) {
    if (!renameValue.trim()) return;

    try {
      await api.renameProject(projectCode, renameValue.trim());
      cancelProjectRename();
      await loadData();
    } catch (err) {
      onError(err instanceof Error ? err.message : "重命名个人项目失败");
    }
  }

  async function deleteProject(project: Project) {
    const confirmed = window.confirm(`删除个人项目“${project.name}”后，当前分组会从活动列表移除。是否继续？`);
    if (!confirmed) return;

    try {
      await api.deleteProject(project.code);
      if (selectedProjectCode === project.code) {
        const fallbackProject = projects.find((item) => item.code !== project.code);
        if (fallbackProject) {
          selectProject(fallbackProject);
        }
      }
      cancelProjectRename();
      await loadData();
    } catch (err) {
      onError(err instanceof Error ? err.message : "删除个人项目失败");
    }
  }

  return {
    cancelProjectRename,
    commitProjectRename,
    createProject,
    deleteProject,
    newProjectName,
    renameValue,
    renamingProjectCode,
    requestNewProject: () => setShowNewProjectForm(true),
    resetNewProjectDraft,
    selectProject,
    setNewProjectName,
    setRenameValue,
    showNewProjectForm,
    startProjectRename,
  };
}
