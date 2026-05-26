import { type KeyboardEvent } from "react";

import { type Project } from "../../api";

type StudioWorkspacePaneProps = {
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
  function handleRenameKeyDown(projectCode: string, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && renameValue.trim()) {
      onRenameCommit(projectCode);
      return;
    }

    if (event.key === "Escape") {
      onRenameCancel();
    }
  }

  return (
    <aside className="workspace-pane">
      <div className="workspace-header">
        <div>
          <p className="workspace-kicker">开始创作</p>
          <h2>{workspaceName}</h2>
          <p>{activeProject?.summary ?? "左侧个人项目仅作为你的任务分组使用，历史记录只显示当前账号自己的生成结果。"}</p>
        </div>
      </div>

      {canCreateProjects ? (
        <button type="button" className="workspace-primary" onClick={onRequestNewProject}>
          + 新建个人项目
        </button>
      ) : null}

      {showNewProjectForm ? (
        <div className="new-project-form">
          <input
            type="text"
            placeholder="个人项目名称"
            value={newProjectName}
            onChange={(event) => onNewProjectNameChange(event.target.value)}
            className="member-search-input"
          />
          <div className="new-project-actions">
            <button type="button" className="ghost-button" onClick={onCancelNewProject}>
              取消
            </button>
            <button
              type="button"
              className="workspace-primary member-save-btn"
              disabled={!newProjectName.trim()}
              onClick={onCreateProject}
            >
              创建
            </button>
          </div>
        </div>
      ) : null}

      <div className="workspace-list">
        {projects.map((project) => (
          <div
            key={project.id}
            className={project.code === selectedProjectCode ? "workspace-item active" : "workspace-item"}
          >
            {renamingProjectCode === project.code ? (
              <div className="project-rename-form">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => onRenameValueChange(event.target.value)}
                  className="member-search-input"
                  autoFocus
                  onKeyDown={(event) => handleRenameKeyDown(project.code, event)}
                />
                <button
                  type="button"
                  className="ghost-button ghost-button-sm"
                  onClick={() => onRenameCommit(project.code)}
                >
                  保存
                </button>
                <button type="button" className="ghost-button ghost-button-sm" onClick={onRenameCancel}>
                  取消
                </button>
              </div>
            ) : (
              <button type="button" className="workspace-item-btn" onClick={() => onProjectSelect(project)}>
                <strong>{project.name}</strong>
                <span>个人项目 / {project.classification}</span>
              </button>
            )}
            {renamingProjectCode !== project.code && project.can_manage ? (
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
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
