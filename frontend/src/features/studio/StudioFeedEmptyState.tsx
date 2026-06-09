type StudioFeedEmptyStateProps = {
  isRunning: boolean;
  status: string;
  virtualProgress: number;
};

export default function StudioFeedEmptyState({
  isRunning,
  status,
  virtualProgress,
}: StudioFeedEmptyStateProps) {
  return (
    <div className="feed-gallery-empty">
      <h3>{isRunning ? "任务正在执行中" : "任务还没有返回预览"}</h3>
      {isRunning ? (
        <div className="feed-task-progress">
          <div className="feed-task-progress-head">
            <strong>{virtualProgress}% 进度中</strong>
            <span>{status === "running" ? "生成中" : "排队中"}</span>
          </div>
          <div className="feed-task-progress-track" aria-hidden="true">
            <b style={{ width: `${virtualProgress}%` }} />
          </div>
          <p>系统正在排队或执行，本轮结果返回后会自动显示在这里。</p>
        </div>
      ) : (
        <p>任务执行完成后，这里会显示本轮生成结果和可复用资产。</p>
      )}
    </div>
  );
}
