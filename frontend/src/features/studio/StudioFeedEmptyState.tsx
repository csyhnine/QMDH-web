import StudioTaskProgress from "./StudioTaskProgress";

type StudioFeedEmptyStateProps = {
  isRunning: boolean;
  status: string;
  virtualProgress: number;
  localStage?: string;
  queuePosition?: number;
};

export default function StudioFeedEmptyState({
  isRunning,
  status,
  virtualProgress,
  localStage,
  queuePosition,
}: StudioFeedEmptyStateProps) {
  const completed = status === "completed";
  return (
    <div className="feed-gallery-empty">
      <h3>{completed ? "任务已完成" : isRunning ? "任务正在处理中" : "任务还没有返回预览"}</h3>
      {isRunning || completed ? (
        <StudioTaskProgress
          percent={virtualProgress}
          status={status}
          localStage={localStage}
          queuePosition={queuePosition}
        />
      ) : (
        <p>任务执行完成后，这里会显示本轮生成结果和可复用资产。</p>
      )}
    </div>
  );
}
