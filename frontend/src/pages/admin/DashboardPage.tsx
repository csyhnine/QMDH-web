import { type DashboardStats } from "../../api";

function formatDateTime(value: string | null): string {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${month}/${day}`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function formatToken(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatCount(value);
}

function formatCostRows(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "¥0.00";
  return rows
    .map((row) => {
      const currency = String(row.currency || "CNY");
      const total = Number(row.total_cost || 0);
      return `${currency === "CNY" ? "¥" : "$"}${total.toFixed(2)}`;
    })
    .join(" + ");
}

function rowMax<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((max, row) => Math.max(max, pick(row)), 0);
}

export type DashboardPageProps = {
  dashboard: DashboardStats | null;
  userCanUseOpsViews: boolean;
  dashboardStatsDays: number;
  lastSyncedAt: string | null;
  onChangeDays: (days: number) => void;
  onRefresh: () => void;
};

export default function DashboardPage({
  dashboard,
  userCanUseOpsViews,
  dashboardStatsDays,
  lastSyncedAt,
  onChangeDays,
  onRefresh,
}: DashboardPageProps) {
  if (!userCanUseOpsViews) {
    return (
      <section className="ops-dashboard">
        <div className="floating-error">当前账号没有查看运营看板的权限。</div>
      </section>
    );
  }

  if (!dashboard) {
    return (
      <section className="ops-dashboard">
        <div className="template-empty">看板数据加载中。</div>
      </section>
    );
  }

  const maxDailyTaskCount = rowMax(dashboard.daily_series, (item) =>
    item.image_generate_count + item.image_edit_count + item.video_generate_count
  );
  const maxChatTokens = rowMax(dashboard.daily_series, (item) => item.chat_total_tokens);
  const executionMax = rowMax(dashboard.execution_rankings, (item) =>
    item.image_generate_count + item.image_edit_count + item.video_generate_count + item.chat_turn_count
  );

  return (
    <section className="ops-dashboard">
      <header className="ops-dashboard-head">
        <div>
          <h1>运营看板</h1>
          <p>以任务执行频次与 Chat token 为主，成本数据保留为次级参考。</p>
        </div>
        <div className="ops-toolbar">
          <div className="ops-segment">
            <button type="button" className={dashboardStatsDays === 7 ? "active" : ""} onClick={() => onChangeDays(7)}>
              7 天
            </button>
            <button type="button" className={dashboardStatsDays === 30 ? "active" : ""} onClick={() => onChangeDays(30)}>
              30 天
            </button>
            <button type="button" className={dashboardStatsDays === 90 ? "active" : ""} onClick={() => onChangeDays(90)}>
              90 天
            </button>
          </div>
          <div className="ops-date-range">
            <span>统计窗口：最近 {dashboardStatsDays} 天</span>
            <span>刷新于 {formatDateTime(lastSyncedAt)}</span>
          </div>
          <button type="button" className="ops-icon-button" onClick={onRefresh}>
            刷新
          </button>
        </div>
      </header>

      <div className="ops-kpi-grid">
        <article className="ops-kpi-card ops-kpi-blue">
          <div>
            <span>今日生图</span>
            <strong>{formatCount(dashboard.today_image_generate_count)}</strong>
            <small>本周 {formatCount(dashboard.week_image_generate_count)} 次</small>
          </div>
          <i>图</i>
        </article>
        <article className="ops-kpi-card ops-kpi-purple">
          <div>
            <span>今日视频任务</span>
            <strong>{formatCount(dashboard.today_video_generate_count)}</strong>
            <small>本周 {formatCount(dashboard.week_video_generate_count)} 次</small>
          </div>
          <i>视</i>
        </article>
        <article className="ops-kpi-card ops-kpi-green">
          <div>
            <span>窗口内 Chat 轮次</span>
            <strong>{formatCount(dashboard.window_chat_turn_count)}</strong>
            <small>Prompt {formatToken(dashboard.window_chat_prompt_tokens)} tokens</small>
          </div>
          <i>聊</i>
        </article>
        <article className="ops-kpi-card ops-kpi-orange">
          <div>
            <span>窗口内 Chat Token</span>
            <strong>{formatToken(dashboard.window_chat_total_tokens)}</strong>
            <small>Completion {formatToken(dashboard.window_chat_completion_tokens)} tokens</small>
          </div>
          <i>T</i>
        </article>
        <article className="ops-kpi-card ops-kpi-red">
          <div>
            <span>任务成功率</span>
            <strong>{dashboard.success_rate.toFixed(1)}%</strong>
            <small>
              {formatCount(dashboard.successful_tasks)} 成功 / {formatCount(dashboard.failed_tasks)} 失败
            </small>
          </div>
          <i>成</i>
        </article>
      </div>

      <div className="ops-dashboard-grid">
        <section className="ops-panel ops-panel-wide">
          <div className="ops-panel-head">
            <h2>每日任务执行趋势</h2>
            <span>按上海时间自然日统计</span>
          </div>
          <div className="ops-task-series">
            {dashboard.daily_series.map((day) => {
              const taskCount = day.image_generate_count + day.image_edit_count + day.video_generate_count;
              const taskHeight = maxDailyTaskCount === 0 ? 6 : Math.max(12, (taskCount / maxDailyTaskCount) * 100);
              return (
                <div key={day.date} className="ops-task-series-day">
                  <div className="ops-task-series-bars">
                    <div className="ops-task-series-stack" style={{ height: `${taskHeight}%` }}>
                      {day.image_generate_count > 0 ? (
                        <span
                          className="ops-task-series-segment image"
                          style={{ height: `${(day.image_generate_count / Math.max(taskCount, 1)) * 100}%` }}
                          title={`生图 ${day.image_generate_count}`}
                        />
                      ) : null}
                      {day.image_edit_count > 0 ? (
                        <span
                          className="ops-task-series-segment edit"
                          style={{ height: `${(day.image_edit_count / Math.max(taskCount, 1)) * 100}%` }}
                          title={`修图 ${day.image_edit_count}`}
                        />
                      ) : null}
                      {day.video_generate_count > 0 ? (
                        <span
                          className="ops-task-series-segment video"
                          style={{ height: `${(day.video_generate_count / Math.max(taskCount, 1)) * 100}%` }}
                          title={`视频 ${day.video_generate_count}`}
                        />
                      ) : null}
                    </div>
                  </div>
                  <strong>{taskCount}</strong>
                  <small>{formatDayLabel(day.date)}</small>
                </div>
              );
            })}
          </div>
          <div className="ops-inline-legend">
            <span><i className="ops-legend-chip image" />生图</span>
            <span><i className="ops-legend-chip edit" />修图</span>
            <span><i className="ops-legend-chip video" />视频</span>
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>每日 Chat Token</h2>
            <span>窗口内消息使用量</span>
          </div>
          <div className="ops-token-series">
            {dashboard.daily_series.map((day) => {
              const barWidth = maxChatTokens === 0 ? 0 : (day.chat_total_tokens / maxChatTokens) * 100;
              return (
                <div key={day.date} className="ops-token-row">
                  <span>{formatDayLabel(day.date)}</span>
                  <div>
                    <b style={{ width: `${barWidth}%` }} />
                  </div>
                  <strong>{formatToken(day.chat_total_tokens)}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="ops-panel ops-panel-wide">
          <div className="ops-panel-head">
            <h2>执行人排行</h2>
            <span>按任务次数 + Chat 轮次排序</span>
          </div>
          <div className="ops-execution-table">
            <div className="ops-execution-head">
              <span>执行人</span>
              <span>生图</span>
              <span>修图</span>
              <span>视频</span>
              <span>Chat 轮次</span>
              <span>Chat Token</span>
              <span>最近活动</span>
            </div>
            {dashboard.execution_rankings.length > 0 ? (
              dashboard.execution_rankings.map((row) => {
                const activity =
                  row.image_generate_count + row.image_edit_count + row.video_generate_count + row.chat_turn_count;
                const width = executionMax === 0 ? 0 : (activity / executionMax) * 100;
                return (
                  <div key={row.user_name} className="ops-execution-body">
                    <span className="ops-execution-user">
                      <strong>{row.user_name}</strong>
                      <b style={{ width: `${width}%` }} />
                    </span>
                    <span>{formatCount(row.image_generate_count)}</span>
                    <span>{formatCount(row.image_edit_count)}</span>
                    <span>{formatCount(row.video_generate_count)}</span>
                    <span>{formatCount(row.chat_turn_count)}</span>
                    <span>{formatToken(row.chat_total_tokens)}</span>
                    <span>{formatDateTime(row.last_activity_at)}</span>
                  </div>
                );
              })
            ) : (
              <div className="template-empty">当前窗口内还没有可展示的执行记录。</div>
            )}
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>失败原因</h2>
            <span>任务失败聚合</span>
          </div>
          <div className="ops-table-list">
            {(dashboard.failure_reasons.length ? dashboard.failure_reasons : [{ reason: "暂无失败", count: 0 }]).map((row) => (
              <div key={String(row.reason)} className="ops-failure-row">
                <span>{String(row.reason)}</span>
                <strong>{formatCount(Number(row.count || 0))}</strong>
                <div>
                  <b
                    style={{
                      width: `${dashboard.failed_tasks === 0 ? 0 : (Number(row.count || 0) / dashboard.failed_tasks) * 100}%`,
                    }}
                  />
                </div>
                <em>{dashboard.failed_tasks === 0 ? "0%" : `${(((Number(row.count || 0) / dashboard.failed_tasks) * 100)).toFixed(1)}%`}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-head">
            <h2>成本参考</h2>
            <span>降级为次级信息</span>
          </div>
          <div className="ops-cost-secondary">
            <strong>{formatCostRows(dashboard.cost_by_currency)}</strong>
            <p>{dashboard.cost_formula}</p>
            <ul>
              {dashboard.cost_notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </section>
  );
}
