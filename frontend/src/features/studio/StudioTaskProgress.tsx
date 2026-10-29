import "./StudioComfyProgress.css";

type Props = { percent: number; status: string; localStage?: string; queuePosition?: number };

export default function StudioTaskProgress({ percent, status, localStage, queuePosition }: Props) {
  const completed = status === "completed";
  const recovering = localStage === "recovering" || localStage === "review";
  const waiting =
    !recovering && (localStage === "queued" || localStage === "accepted" || (!localStage && status === "pending"));
  const value = completed ? 100 : Math.max(0, Math.min(95, Math.round(Number.isFinite(percent) ? percent : 0)));
  const label = completed
    ? "已完成"
    : recovering
      ? "等待恢复"
      : waiting
        ? "排队中"
        : localStage === "saving"
          ? "正在保存结果"
          : "生成中";
  const position = Number.isFinite(queuePosition) ? Math.max(0, Math.floor(queuePosition!)) : 0;
  return (
    <div
      className={`feed-task-progress unified-task-progress${recovering ? " is-recovering" : ""}${completed ? " is-completed" : ""}`}
    >
      <div className="feed-task-progress-head">
        <strong>
          {value}%{completed ? "" : " · 预估进度"}
        </strong>
        <span>{label}</span>
      </div>
      <div
        className="feed-task-progress-track"
        role="progressbar"
        aria-label={completed ? "任务完成进度" : "任务预估进度"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value}%，${label}${completed ? "" : "，预估进度"}`}
      >
        <b style={{ width: `${value}%` }} />
      </div>
      {!completed && (
        <p>
          {recovering
            ? "任务已保留，正在核对执行状态，进度暂时停留，请勿重复提交。"
            : waiting && localStage
              ? `前方 ${position} 项任务，轮到后自动执行。`
              : value >= 95
                ? "仍在处理，预估进度暂时停留；结果保存完成后到100%，请勿重复提交。"
              : localStage
                ? "进度按执行时间预估，结果保存完成后到100%；多张图片会逐张生成。"
                : "进度按执行时间预估，结果保存完成后到100%。"}
        </p>
      )}
    </div>
  );
}
