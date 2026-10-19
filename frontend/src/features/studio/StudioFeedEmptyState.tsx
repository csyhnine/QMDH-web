import "./StudioComfyProgress.css";

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
  if (isRunning && localStage) {
    const waiting = localStage === "queued";
    const recovering = localStage === "recovering";
    return <div className="feed-gallery-empty" role="status">
      <h3>{recovering ? "等待连接恢复或状态核对" : waiting ? "等待本机执行" : "本机正在生成"}</h3>
      <div className={`feed-task-progress-track comfy-task-progress${recovering ? " is-recovering" : ""}`}
        role="progressbar" aria-label={recovering ? "等待恢复" : waiting ? "排队中" : "本机生成中"}
        aria-valuetext={recovering ? "任务已保留，等待恢复" : waiting ? "等待轮到执行" : "正在执行，暂未提供准确百分比"}>
        <b />
      </div>
      <p>{recovering ? "任务已保留，系统会继续核对原任务，请勿重复提交。" : waiting
        ? `前方 ${queuePosition ?? 0} 项任务，轮到后自动执行。` : "生成完成后自动保存结果，多张图片会逐张生成。"}</p>
    </div>;
  }
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
