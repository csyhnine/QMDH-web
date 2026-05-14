import { type DashboardStats } from "../../api";

/* ─── Chart helpers (extracted from App.tsx) ─── */

const chartColors = [
  "#3778f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function metricValue(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return value == null ? "—" : String(value);
}

function metricNumber(item: Record<string, unknown>, key: string): number {
  const value = item[key];
  return typeof value === "number" ? value : 0;
}

function metricList(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  return "—";
}

function formatCost(value: unknown, currency: unknown): string {
  const num = typeof value === "number" ? value : 0;
  const cur = typeof currency === "string" ? currency : "CNY";
  return `${cur === "CNY" ? "¥" : "$"}${num.toFixed(2)}`;
}

function formatCostBreakdown(rows: Array<Record<string, unknown>>): string {
  if (!rows || rows.length === 0) return "¥0.00";
  return rows.map((row) => formatCost(row.total_cost, row.currency)).join(" + ");
}

function sumMetric(rows: Array<Record<string, unknown>>, key: string): number {
  return rows.reduce((total, row) => total + metricNumber(row, key), 0);
}

function percentOf(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDayLabel(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  return `${parts[1]}/${parts[2]}`;
}

function svgLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

function svgAreaPath(
  points: Array<{ x: number; y: number }>,
  baseline: number
): string {
  if (points.length === 0) return "";
  const line = svgLinePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L${last.x},${baseline} L${first.x},${baseline} Z`;
}

function costFailureChartGeometry(
  series: Array<{ total_cost: number; failed_tasks: number }>
): { costPts: Array<{ x: number; y: number }>; failPts: Array<{ x: number; y: number }>; maxCost: number; maxFail: number } {
  const width = 560;
  const height = 198;
  const padX = 30;
  const padY = 12;
  const maxCost = Math.max(1, ...series.map((d) => d.total_cost));
  const maxFail = Math.max(1, ...series.map((d) => d.failed_tasks));
  const len = series.length || 1;
  const stepX = (width - padX * 2) / Math.max(1, len - 1);
  const costPts = series.map((d, i) => ({
    x: padX + i * stepX,
    y: padY + (1 - d.total_cost / maxCost) * (height - padY * 2),
  }));
  const failPts = series.map((d, i) => ({
    x: padX + i * stepX,
    y: padY + (1 - d.failed_tasks / maxFail) * (height - padY * 2),
  }));
  return { costPts, failPts, maxCost, maxFail };
}

function yAxisTicks(maxValue: number, ticks: number): number[] {
  const step = maxValue / Math.max(1, ticks - 1);
  return Array.from({ length: ticks }, (_, i) => maxValue - i * step);
}

function xAxisTickIndexes(len: number): number[] {
  if (len <= 7) return Array.from({ length: len }, (_, i) => i);
  const step = Math.max(1, Math.floor(len / 6));
  const indexes: number[] = [];
  for (let i = 0; i < len; i += step) indexes.push(i);
  if (indexes[indexes.length - 1] !== len - 1) indexes.push(len - 1);
  return indexes;
}

function modelSliceColor(modelName: string, rankings: Array<Record<string, unknown>>): string {
  const index = rankings.findIndex((r) => metricValue(r, "name") === modelName);
  return chartColors[index >= 0 ? index % chartColors.length : 0];
}

function donutBackground(rows: Array<Record<string, unknown>>): string {
  const total = sumMetric(rows, "count");
  if (total === 0) return "#e5e7eb";
  let acc = 0;
  const stops = rows.map((row, i) => {
    const start = acc;
    acc += percentOf(metricNumber(row, "count"), total);
    return `${chartColors[i % chartColors.length]} ${start}% ${acc}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function metricQuota(item: Record<string, unknown>): string {
  const used = metricNumber(item, "quota_used");
  const limit = metricNumber(item, "quota_limit");
  if (limit === 0) return "不限额";
  return `${formatCost(used, "CNY")} / ${formatCost(limit, "CNY")}`;
}

/* ─── Props ─── */

export type DashboardPageProps = {
  dashboard: DashboardStats | null;
  userCanUseOpsViews: boolean;
  dashboardStatsDays: number;
  lastSyncedAt: string | null;
  onChangeDays: (days: number) => void;
  onRefresh: () => void;
};

/* ─── Component ─── */

export default function DashboardPage({
  dashboard,
  userCanUseOpsViews,
  dashboardStatsDays,
  lastSyncedAt,
  onChangeDays,
  onRefresh,
}: DashboardPageProps) {
  const dashboardModelTotal = dashboard ? sumMetric(dashboard.model_rankings, "count") : 0;
  const dashboardAccountQuotaTotal = dashboard ? sumMetric(dashboard.account_usage, "quota_limit") : 0;
  const dashboardAccountUsedTotal = dashboard ? sumMetric(dashboard.account_usage, "quota_used") : 0;
  const dashboardProjectTotal = dashboard ? sumMetric(dashboard.project_rankings, "count") : 0;
  const dashboardFailureTotal = dashboard ? sumMetric(dashboard.failure_reasons, "count") : 0;

  return (
    <section className="ops-dashboard">
      <header className="ops-dashboard-head">
        <div>
          <h1>运营看板</h1>
          <p>全局概览与运营洞察</p>
        </div>
        <div className="ops-toolbar">
          <div className="ops-segment">
            <button type="button" className={dashboardStatsDays === 7 ? "active" : ""} onClick={() => onChangeDays(7)}>日</button>
            <button type="button" className={dashboardStatsDays === 7 ? "active" : ""} onClick={() => onChangeDays(7)}>周</button>
            <button type="button" className={dashboardStatsDays === 30 ? "active" : ""} onClick={() => onChangeDays(30)}>月</button>
          </div>
          <div className="ops-date-range">
            <span>最近 {dashboardStatsDays} 天</span>
            <span>至</span>
            <span>{lastSyncedAt ? formatDate(lastSyncedAt) : "当前"}</span>
          </div>
          <button type="button" className="ops-icon-button" onClick={onRefresh}>刷新</button>
          <button type="button" className="ops-export-button">导出报告</button>
        </div>
      </header>

      {!userCanUseOpsViews ? (
        <div className="floating-error">当前账号没有查看运营看板的权限。</div>
      ) : dashboard ? (
        <>
          <div className="ops-kpi-grid">
            <article className="ops-kpi-card ops-kpi-blue">
              <div><span>任务总览</span><strong>{dashboard.total_tasks}</strong><small>成功率 {dashboard.success_rate}%</small></div>
              <i>⌁</i>
            </article>
            <article className="ops-kpi-card ops-kpi-green">
              <div><span>真实成本</span><strong>{formatCostBreakdown(dashboard.cost_by_currency)}</strong><small>{dashboard.cost_unit}</small></div>
              <i>￥</i>
            </article>
            <article className="ops-kpi-card ops-kpi-purple">
              <div><span>账号额度</span><strong>{formatCost(dashboardAccountUsedTotal, "CNY")}</strong><small>额度 {formatCost(dashboardAccountQuotaTotal, "CNY")}</small></div>
              <i>▣</i>
            </article>
            <article className="ops-kpi-card ops-kpi-orange">
              <div><span>模型调用</span><strong>{dashboardModelTotal}</strong><small>覆盖 {dashboard.model_rankings.length} 个模型</small></div>
              <i>∿</i>
            </article>
            <article className="ops-kpi-card ops-kpi-red">
              <div><span>失败次数</span><strong>{dashboard.failed_tasks}</strong><small>{formatPercent(percentOf(dashboard.failed_tasks, dashboard.total_tasks))}</small></div>
              <i>!</i>
            </article>
          </div>

          <div className="ops-dashboard-grid">
            {/* Cost & Failure Trend Chart */}
            <section className="ops-panel ops-panel-wide">
              <div className="ops-panel-head">
                <h2>真实成本与失败趋势</h2>
                <span>左轴：成本（{dashboard.cost_unit}）· 右轴：失败次数</span>
              </div>
              {(() => {
                const dailySeries = dashboard.daily_series ?? [];
                const hasTrendActivity = dailySeries.some((d) => d.total_tasks > 0 || d.total_cost > 0);
                const geom = costFailureChartGeometry(
                  dailySeries.map((d) => ({ total_cost: d.total_cost, failed_tasks: d.failed_tasks }))
                );
                const costTicks = yAxisTicks(geom.maxCost, 5);
                const failTicks = yAxisTicks(geom.maxFail, 5);
                const xIndexes = xAxisTickIndexes(dailySeries.length);
                if (!hasTrendActivity) {
                  return (
                    <div className="ops-line-chart">
                      <div className="template-empty" style={{ gridColumn: "1 / -1", minHeight: 220 }}>
                        所选时间范围内暂无任务与成本数据。
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="ops-line-chart ops-line-chart-dual">
                    <div className="ops-y-axis">
                      {costTicks.map((t) => <span key={`cost-${t}`}>{t >= 10 ? t.toFixed(0) : t.toFixed(2)}</span>)}
                    </div>
                    <svg viewBox="0 0 560 220" role="img" aria-label="真实成本与失败趋势">
                      <defs>
                        <linearGradient id="costFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#3778f6" stopOpacity="0.24" />
                          <stop offset="100%" stopColor="#3778f6" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      <path d={svgAreaPath(geom.costPts, 198)} fill="url(#costFill)" />
                      <path d={svgLinePath(geom.costPts)} fill="none" stroke="#3778f6" strokeWidth={3} strokeLinejoin="round" />
                      <path d={svgLinePath(geom.failPts)} fill="none" stroke="#e85d5d" strokeWidth={2.5} strokeDasharray="5 4" strokeLinejoin="round" />
                      {geom.costPts.map((p, i) => (
                        <circle key={`cp-${dailySeries[i]?.date ?? i}`} cx={p.x} cy={p.y} r={4} fill="#3778f6" stroke="white" strokeWidth={2} />
                      ))}
                      {geom.failPts.map((p, i) => (
                        <circle key={`fp-${dailySeries[i]?.date ?? i}`} cx={p.x} cy={p.y} r={3} fill="#e85d5d" stroke="white" strokeWidth={2} />
                      ))}
                      <text x={420} y={24} fill="#6b7687" fontSize="11">— 成本</text>
                      <text x={420} y={38} fill="#e85d5d" fontSize="11">··· 失败</text>
                    </svg>
                    <div className="ops-y-axis">
                      {failTicks.map((t) => <span key={`fail-${t}`}>{t >= 10 ? t.toFixed(0) : t.toFixed(1)}</span>)}
                    </div>
                    <div className="ops-x-axis">
                      {xIndexes.map((i) => <span key={dailySeries[i]?.date ?? i}>{formatDayLabel(dailySeries[i]?.date ?? "")}</span>)}
                    </div>
                  </div>
                );
              })()}
            </section>

            {/* Model Distribution Donut */}
            <section className="ops-panel">
              <div className="ops-panel-head"><h2>模型调用分布</h2></div>
              <div className="ops-donut-layout">
                <div className="ops-donut" style={{ background: donutBackground(dashboard.model_rankings) }}>
                  <div><strong>{dashboardModelTotal}</strong><span>总调用</span></div>
                </div>
                <div className="ops-legend-list">
                  {dashboard.model_rankings.slice(0, 5).map((row, index) => (
                    <div key={metricValue(row, "name")} className="ops-legend-row">
                      <i style={{ background: chartColors[index % chartColors.length] }} />
                      <span>{metricValue(row, "name")}</span>
                      <strong>{formatPercent(percentOf(metricNumber(row, "count"), dashboardModelTotal))}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Project Rankings */}
            <section className="ops-panel">
              <div className="ops-panel-head"><h2>项目排行（按任务）</h2></div>
              <div className="ops-table-list">
                {dashboard.project_rankings.slice(0, 5).map((row) => (
                  <div key={metricValue(row, "code")} className="ops-rank-row">
                    <span>{metricValue(row, "code")}</span>
                    <div><b style={{ width: `${percentOf(metricNumber(row, "count"), dashboardProjectTotal)}%` }} /></div>
                    <strong>{metricValue(row, "count")}</strong>
                    <em>{formatPercent(percentOf(metricNumber(row, "count"), dashboardProjectTotal))}</em>
                  </div>
                ))}
              </div>
            </section>

            {/* Failure Reasons */}
            <section className="ops-panel">
              <div className="ops-panel-head"><h2>失败原因分析</h2><span>全部</span></div>
              <div className="ops-table-list">
                {(dashboard.failure_reasons.length ? dashboard.failure_reasons : [{ reason: "暂无失败", count: 0 }]).slice(0, 5).map((row) => (
                  <div key={metricValue(row, "reason")} className="ops-failure-row">
                    <span>{metricValue(row, "reason")}</span>
                    <strong>{metricValue(row, "count") || "0"}</strong>
                    <div><b style={{ width: `${percentOf(metricNumber(row, "count"), dashboardFailureTotal || 1)}%` }} /></div>
                    <em>{formatPercent(percentOf(metricNumber(row, "count"), dashboardFailureTotal || 1))}</em>
                  </div>
                ))}
              </div>
            </section>

            {/* Model Calls Stacked Chart */}
            <section className="ops-panel ops-panel-large">
              <div className="ops-panel-head">
                <h2>模型调用趋势</h2>
                <div className="ops-inline-legend">
                  {dashboard.model_rankings.slice(0, 4).map((row, index) => (
                    <span key={metricValue(row, "name")}><i style={{ background: chartColors[index % chartColors.length] }} />{metricValue(row, "name")}</span>
                  ))}
                </div>
              </div>
              {(() => {
                const modelDays = dashboard.model_calls_by_day ?? [];
                const hasModelTrend = modelDays.length > 0 && modelDays.some((day) => day.slices.some((s) => s.count > 0));
                if (!hasModelTrend) return <div className="template-empty">所选时间范围内暂无模型调用记录。</div>;
                const dayTotals = modelDays.map((day) => day.slices.reduce((sum, slice) => sum + slice.count, 0));
                const maxDayTotal = Math.max(1, ...dayTotals);
                return (
                  <div className="ops-stacked-chart">
                    {modelDays.map((day, dayIx) => {
                      const dayTotal = dayTotals[dayIx] ?? 0;
                      const activeSlices = day.slices.filter((s) => s.count > 0);
                      const barSlices = dayTotal === 0 ? [{ model_name: "—", count: 0 }] : activeSlices;
                      return (
                        <div key={day.date} className="ops-stack-day">
                          <div style={{ height: dayTotal === 0 ? "10%" : `${Math.max(14, (dayTotal / maxDayTotal) * 100)}%` }}>
                            <div>
                              {barSlices.map((slice) => (
                                <span key={`${day.date}-${slice.model_name}`} style={{ height: dayTotal === 0 ? "100%" : `${(slice.count / dayTotal) * 100}%`, background: modelSliceColor(slice.model_name, dashboard.model_rankings) }} />
                              ))}
                            </div>
                          </div>
                          <small>{formatDayLabel(day.date)}</small>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </section>

            {/* Account Quota */}
            <section className="ops-panel ops-panel-wide">
              <div className="ops-panel-head"><h2>账号额度监管</h2><span>软监管</span></div>
              <div className="ops-account-list">
                {dashboard.account_usage.slice(0, 4).map((account) => (
                  <div key={metricValue(account, "name")} className="ops-account-row">
                    <span><strong>{metricValue(account, "display_name")}</strong><small>{metricValue(account, "role")} / {metricList(account, "project_codes")}</small></span>
                    <div><b style={{ width: `${percentOf(metricNumber(account, "quota_used"), metricNumber(account, "quota_limit"))}%` }} /></div>
                    <em>{metricQuota(account)}</em>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : (
        <div className="template-empty">看板数据加载中。</div>
      )}
    </section>
  );
}
