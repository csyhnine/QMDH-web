import { type KeyboardEvent } from "react";

import { type Project, type ProjectMember } from "../../api";

export type ProjectUserBrief = {
  id: number;
  name: string;
  display_name: string;
  role: string;
  is_active: boolean;
};

type StudioWorkspacePaneProps = {
  activeProject?: Project;
  allUsersBrief: ProjectUserBrief[];
  canManageProjects: boolean;
  memberDraftIds: Set<number>;
  memberSearchQuery: string;
  newProjectCode: string;
  newProjectName: string;
  projectMembers: ProjectMember[];
  projects: Project[];
  renameValue: string;
  renamingProjectCode: string | null;
  selectedProjectCode: string;
  showMemberEditor: boolean;
  showNewProjectForm: boolean;
  workspaceName: string;
  onCancelNewProject: () => void;
  onCloseMemberEditor: () => void;
  onCreateProject: () => void;
  onMemberDraftRemove: (userId: number) => void;
  onMemberDraftToggle: (userId: number) => void;
  onMemberSearchQueryChange: (value: string) => void;
  onNewProjectCodeChange: (value: string) => void;
  onNewProjectNameChange: (value: string) => void;
  onOpenMemberEditor: () => void;
  onProjectSelect: (project: Project) => void;
  onRenameCancel: () => void;
  onRenameCommit: (projectCode: string) => void;
  onRenameStart: (project: Project) => void;
  onRenameValueChange: (value: string) => void;
  onRequestNewProject: () => void;
  onSaveMemberChanges: (toAdd: number[], toRemove: number[]) => void;
};

export default function StudioWorkspacePane({
  activeProject,
  allUsersBrief,
  canManageProjects,
  memberDraftIds,
  memberSearchQuery,
  newProjectCode,
  newProjectName,
  projectMembers,
  projects,
  renameValue,
  renamingProjectCode,
  selectedProjectCode,
  showMemberEditor,
  showNewProjectForm,
  workspaceName,
  onCancelNewProject,
  onCloseMemberEditor,
  onCreateProject,
  onMemberDraftRemove,
  onMemberDraftToggle,
  onMemberSearchQueryChange,
  onNewProjectCodeChange,
  onNewProjectNameChange,
  onOpenMemberEditor,
  onProjectSelect,
  onRenameCancel,
  onRenameCommit,
  onRenameStart,
  onRenameValueChange,
  onRequestNewProject,
  onSaveMemberChanges,
}: StudioWorkspacePaneProps) {
  const filteredUsers = allUsersBrief
    .filter((user) => user.is_active)
    .filter((user) => {
      if (!memberSearchQuery.trim()) return true;
      const query = memberSearchQuery.toLowerCase();
      return user.name.toLowerCase().includes(query) || user.display_name.toLowerCase().includes(query);
    });

  const originalIds = new Set(projectMembers.filter((member) => !member.is_global).map((member) => member.id));
  const toAdd = [...memberDraftIds].filter((id) => !originalIds.has(id));
  const toRemove = [...originalIds].filter((id) => !memberDraftIds.has(id));
  const hasMemberChanges = toAdd.length > 0 || toRemove.length > 0;

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
    <>
      <aside className="workspace-pane">
        <div className="workspace-header">
          <div>
            <p className="workspace-kicker">开始创作</p>
            <h2>{workspaceName}</h2>
            <p>{activeProject?.summary ?? "从左侧切换项目，中间区域会按时间流展示这个项目的历史生成记录。"}</p>
          </div>
        </div>

        <button type="button" className="workspace-primary" onClick={onRequestNewProject}>
          + 新项目
        </button>

        {showNewProjectForm ? (
          <div className="new-project-form">
            <input
              type="text"
              placeholder="项目名称"
              value={newProjectName}
              onChange={(event) => onNewProjectNameChange(event.target.value)}
              className="member-search-input"
            />
            <input
              type="text"
              placeholder="项目代码（大写英文+数字）"
              value={newProjectCode}
              onChange={(event) => onNewProjectCodeChange(event.target.value.toUpperCase())}
              className="member-search-input"
            />
            <div className="new-project-actions">
              <button type="button" className="ghost-button" onClick={onCancelNewProject}>
                取消
              </button>
              <button
                type="button"
                className="workspace-primary member-save-btn"
                disabled={!newProjectName.trim() || !newProjectCode.trim()}
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
                    ✓
                  </button>
                  <button type="button" className="ghost-button ghost-button-sm" onClick={onRenameCancel}>
                    ✕
                  </button>
                </div>
              ) : (
                <button type="button" className="workspace-item-btn" onClick={() => onProjectSelect(project)}>
                  <strong>{project.name}</strong>
                  <span>{project.code} / {project.classification}</span>
                </button>
              )}
              {renamingProjectCode !== project.code && canManageProjects ? (
                <button
                  type="button"
                  className="project-rename-trigger"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRenameStart(project);
                  }}
                  title="重命名"
                >
                  ✎
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {projectMembers.length > 0 ? (
          <div className="workspace-members">
            <div className="workspace-members-header">
              <h4>项目成员 ({projectMembers.length})</h4>
              {canManageProjects ? (
                <button type="button" className="ghost-button ghost-button-sm" onClick={onOpenMemberEditor}>
                  编辑
                </button>
              ) : null}
            </div>
            <div className="member-list">
              {projectMembers.map((member) => (
                <div key={member.id} className="member-chip">
                  <span className="member-avatar">{member.display_name.slice(0, 1)}</span>
                  <span className="member-name">{member.display_name}</span>
                  <em className="member-role">{member.role}</em>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {showMemberEditor ? (
          <div className="member-editor-overlay">
            <div className="member-editor-left">
              <div className="member-editor-header">
                <h4>全体成员</h4>
                <button type="button" className="ghost-button" onClick={onCloseMemberEditor}>
                  ✕
                </button>
              </div>
              <input
                type="text"
                className="member-search-input"
                placeholder="搜索用户..."
                value={memberSearchQuery}
                onChange={(event) => onMemberSearchQueryChange(event.target.value)}
              />
              <div className="member-editor-list">
                {filteredUsers.map((user) => {
                  const isGlobal = projectMembers.some((member) => member.id === user.id && member.is_global);
                  const isInDraft = memberDraftIds.has(user.id);

                  return (
                    <label key={user.id} className={`member-editor-row${isInDraft || isGlobal ? " is-member" : ""}`}>
                      <input
                        type="checkbox"
                        checked={isInDraft || isGlobal}
                        disabled={isGlobal}
                        onChange={() => {
                          if (isGlobal) return;
                          onMemberDraftToggle(user.id);
                        }}
                      />
                      <span className="member-avatar">{user.display_name.slice(0, 1)}</span>
                      <span className="member-editor-name">
                        {user.display_name} <small>@{user.name}</small>
                      </span>
                      <em className="member-role">{isGlobal ? "全局" : user.role}</em>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </aside>

      {showMemberEditor ? (
        <div className="member-participants-floating">
          <h4>项目参与人</h4>
          <div className="member-selected-list">
            {projectMembers.filter((member) => member.is_global).map((member) => (
              <div key={member.id} className="member-selected-item">
                <span className="member-avatar">{member.display_name.slice(0, 1)}</span>
                <span className="member-selected-name">{member.display_name}</span>
                <em className="member-role">全局</em>
              </div>
            ))}
            {[...memberDraftIds].map((userId) => {
              const user = allUsersBrief.find((item) => item.id === userId);
              if (!user) return null;

              return (
                <div key={user.id} className="member-selected-item">
                  <span className="member-avatar">{user.display_name.slice(0, 1)}</span>
                  <span className="member-selected-name">{user.display_name}</span>
                  <button
                    type="button"
                    className="member-remove-btn"
                    onClick={() => onMemberDraftRemove(userId)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <div className="member-editor-footer">
            <span className="member-editor-summary">
              {hasMemberChanges
                ? `${toAdd.length > 0 ? `+${toAdd.length}` : ""}${toAdd.length > 0 && toRemove.length > 0 ? " " : ""}${toRemove.length > 0 ? `-${toRemove.length}` : ""}`
                : "未修改"}
            </span>
            <button
              type="button"
              className="workspace-primary member-save-btn"
              disabled={!hasMemberChanges}
              onClick={() => onSaveMemberChanges(toAdd, toRemove)}
            >
              保存
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
