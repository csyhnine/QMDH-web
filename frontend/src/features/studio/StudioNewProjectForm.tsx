type StudioNewProjectFormProps = {
  newProjectName: string;
  onCancelNewProject: () => void;
  onCreateProject: () => void;
  onNewProjectNameChange: (value: string) => void;
};

export default function StudioNewProjectForm({
  newProjectName,
  onCancelNewProject,
  onCreateProject,
  onNewProjectNameChange,
}: StudioNewProjectFormProps) {
  return (
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
  );
}
