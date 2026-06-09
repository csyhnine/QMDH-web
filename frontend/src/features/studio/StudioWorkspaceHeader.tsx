import type { Project } from "../../api";

type StudioWorkspaceHeaderProps = {
  activeProject?: Project;
  workspaceName: string;
};

export default function StudioWorkspaceHeader({
  activeProject,
  workspaceName,
}: StudioWorkspaceHeaderProps) {
  return (
    <div className="workspace-header">
      <div>
        <p className="workspace-kicker">开始创作</p>
        <h2>{workspaceName}</h2>
        <p>{activeProject?.summary ?? "左侧个人项目仅作为你的任务分组使用，历史记录只显示当前账号自己的生成结果。"}</p>
      </div>
    </div>
  );
}
