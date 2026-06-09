import type {
  StudioWorkspaceProjectRenameKeyDownEvent,
  StudioWorkspaceProjectRenameKeyDownOptions,
} from "./studioWorkspaceProjectTypes";

export function handleStudioWorkspaceProjectRenameKeyDown(
  event: StudioWorkspaceProjectRenameKeyDownEvent,
  {
    projectCode,
    renameValue,
    onRenameCancel,
    onRenameCommit,
  }: StudioWorkspaceProjectRenameKeyDownOptions,
) {
  if (event.key === "Enter" && renameValue.trim()) {
    onRenameCommit(projectCode);
    return;
  }

  if (event.key === "Escape") {
    onRenameCancel();
  }
}
