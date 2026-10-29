import { type Dispatch, type SetStateAction, useLayoutEffect, useMemo, useRef, useState } from "react";

import { api, type Project } from "../../api";
import { useAuth } from "../../context/AuthContext";
import type { ProjectMutation } from "./studioProjectCollection";
import type { StudioFormState } from "./studioTypes";

type UseStudioProjectsOptions = {
  getProjects: () => Project[];
  applyProjectMutation: (change: ProjectMutation) => void;
  refreshProjects: (isCurrent: () => boolean) => Promise<Project[]>;
  onError: (message: string, isCurrent?: () => boolean) => void;
  selectedProjectCode: string;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
};
type Editor = { code: string | null; open: boolean; value: string; version: number; pending: Operation | null };
type Operation = { kind: "create" | "rename" | "delete"; intent: number; promise: Promise<void> };
const emptyEditor = (): Editor => ({ code: null, open: false, value: "", version: 0, pending: null });

export type StudioProjectsState = ReturnType<typeof useStudioProjects>;

export function useStudioProjects(options: UseStudioProjectsOptions) {
  const { currentUser, isGuest } = useAuth();
  const [, redraw] = useState(0);
  const scope = useMemo(() => ({
    active: false, create: emptyEditor(), rename: emptyEditor(), pending: new Map<string, Operation>(),
    intent: 0, selectedCode: options.selectedProjectCode,
  }), [currentUser?.id, currentUser?.name, isGuest]);
  const currentScope = useRef(scope), latest = useRef(options);
  const isCurrent = () => scope.active && currentScope.current === scope;
  useLayoutEffect(() => {
    currentScope.current.active = false;
    currentScope.current = scope; scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  useLayoutEffect(() => {
    latest.current = options;
    if (scope.selectedCode !== options.selectedProjectCode) {
      scope.selectedCode = options.selectedProjectCode; scope.intent += 1;
    }
  }, [scope, options]);
  const createEditor = scope.create, renameEditor = scope.rename;
  function publish() { if (isCurrent()) redraw((value) => isCurrent() ? value + 1 : value); }
  function report(operation: Operation, message: string) {
    const ownsFeedback = () => isCurrent() && scope.intent === operation.intent;
    if (ownsFeedback()) latest.current.onError(message, ownsFeedback);
  }
  async function refreshAfter(operation: Operation, label: string) {
    if (!isCurrent()) return;
    try { await latest.current.refreshProjects(isCurrent); }
    catch (error) {
      report(operation, `${label}已成功，但项目列表刷新失败：${error instanceof Error ? error.message : "请稍后刷新列表"}。请勿重复提交本次变更。`);
    }
  }
  function canMutate() { return isCurrent() && Boolean(currentUser) && !isGuest; }
  function selectProject(project: Project) {
    if (!isCurrent()) return;
    scope.selectedCode = project.code; scope.intent += 1;
    latest.current.setStudioForm((current) => {
      if (!isCurrent()) return current;
      const target = latest.current.getProjects().find((row) => row.code === project.code);
      return target ? { ...current, projectCode: target.code, classification: target.classification } : current;
    });
  }
  function requestNewProject() {
    if (!isCurrent()) return;
    if (!scope.create.open) scope.create = { ...emptyEditor(), open: true };
    scope.intent += 1; publish();
  }
  function resetNewProjectDraft() {
    if (!isCurrent() || scope.create !== createEditor) return;
    scope.create = emptyEditor(); scope.intent += 1; publish();
  }
  function setNewProjectName(change: SetStateAction<string>) {
    if (!isCurrent() || scope.create !== createEditor) return;
    const value = typeof change === "function" ? change(createEditor.value) : change;
    if (value === createEditor.value) return;
    createEditor.value = value; createEditor.version += 1; scope.intent += 1; publish();
  }
  function startProjectRename(project: Project) {
    if (!isCurrent()) return;
    scope.rename = { ...emptyEditor(), code: project.code, open: true, value: project.name };
    scope.intent += 1; publish();
  }
  function cancelProjectRename() {
    if (!isCurrent() || scope.rename !== renameEditor) return;
    scope.rename = emptyEditor(); scope.intent += 1; publish();
  }
  function setRenameValue(change: SetStateAction<string>) {
    if (!isCurrent() || scope.rename !== renameEditor) return;
    const value = typeof change === "function" ? change(renameEditor.value) : change;
    if (value === renameEditor.value) return;
    renameEditor.value = value; renameEditor.version += 1; scope.intent += 1; publish();
  }
  function createProject(): Promise<void> {
    const editor = createEditor, name = editor.value.trim(), version = editor.version;
    if (!canMutate() || scope.create !== editor || !editor.open || !name) return Promise.resolve();
    if (editor.pending) return editor.pending.promise;
    const operation: Operation = { kind: "create", intent: scope.intent, promise: Promise.resolve() };
    editor.pending = operation; publish();
    operation.promise = (async () => {
      let accepted = false;
      try {
        const created = await api.createProject(name); accepted = true;
        if (!isCurrent()) return;
        latest.current.applyProjectMutation({ type: "upsert", project: created });
        if (scope.create === editor && editor.version === version) scope.create = emptyEditor();
        publish(); await refreshAfter(operation, "创建个人项目");
      } catch (error) {
        report(operation, `${accepted ? "创建已成功，但列表同步失败：" : "创建个人项目失败："}${error instanceof Error ? error.message : "请稍后重试"}`);
      } finally { if (editor.pending === operation) editor.pending = null; publish(); }
    })();
    return operation.promise;
  }
  function commitProjectRename(code: string): Promise<void> {
    const editor = renameEditor, name = editor.value.trim(), version = editor.version;
    if (!canMutate() || scope.rename !== editor || editor.code !== code || !name) return Promise.resolve();
    const existing = scope.pending.get(code); if (existing) return existing.promise;
    const operation: Operation = { kind: "rename", intent: scope.intent, promise: Promise.resolve() };
    editor.pending = operation; scope.pending.set(code, operation); publish();
    operation.promise = (async () => {
      let accepted = false;
      try {
        const renamed = await api.renameProject(code, name); accepted = true;
        if (!isCurrent()) return;
        latest.current.applyProjectMutation({ type: "upsert", project: renamed });
        if (scope.rename === editor && editor.version === version) scope.rename = emptyEditor();
        publish(); await refreshAfter(operation, "重命名个人项目");
      } catch (error) {
        report(operation, `${accepted ? "改名已成功，但列表同步失败：" : "重命名个人项目失败："}${error instanceof Error ? error.message : "请稍后重试"}`);
      } finally {
        if (editor.pending === operation) editor.pending = null;
        if (scope.pending.get(code) === operation) scope.pending.delete(code); publish();
      }
    })();
    return operation.promise;
  }
  function deleteProject(project: Project): Promise<void> {
    if (!canMutate()) return Promise.resolve();
    const code = project.code, existing = scope.pending.get(code); if (existing) return existing.promise;
    if (!window.confirm(`删除个人项目“${project.name}”后，当前分组会从活动列表移除。是否继续？`)) return Promise.resolve();
    const editor = scope.rename, version = editor.version;
    const operation: Operation = { kind: "delete", intent: scope.intent, promise: Promise.resolve() };
    scope.pending.set(code, operation); publish();
    operation.promise = (async () => {
      let accepted = false;
      try {
        await api.deleteProject(code); accepted = true;
        if (!isCurrent()) return;
        latest.current.applyProjectMutation({ type: "delete", code });
        latest.current.setStudioForm((current) => {
          if (!isCurrent() || current.projectCode !== code) return current;
          const fallback = latest.current.getProjects().find((row) => row.code !== code && scope.pending.get(row.code)?.kind !== "delete");
          scope.selectedCode = fallback?.code ?? "";
          return fallback ? { ...current, projectCode: fallback.code, classification: fallback.classification } : { ...current, projectCode: "" };
        });
        if (scope.rename === editor && editor.code === code && editor.version === version) scope.rename = emptyEditor();
        publish(); await refreshAfter(operation, "删除个人项目");
      } catch (error) {
        report(operation, `${accepted ? "删除已成功，但列表同步失败：" : "删除个人项目失败："}${error instanceof Error ? error.message : "请稍后重试"}`);
      } finally { if (scope.pending.get(code) === operation) scope.pending.delete(code); publish(); }
    })();
    return operation.promise;
  }
  return {
    cancelProjectRename, commitProjectRename, createProject, deleteProject,
    newProjectName: createEditor.value, renameValue: renameEditor.value, renamingProjectCode: renameEditor.code,
    requestNewProject, resetNewProjectDraft, selectProject, setNewProjectName, setRenameValue,
    startProjectRename, showNewProjectForm: createEditor.open, creatingProject: Boolean(createEditor.pending), renamingProject: Boolean(renameEditor.pending),
    deletingProjectCodes: [...scope.pending].filter(([, operation]) => operation.kind === "delete").map(([code]) => code),
  };
}
