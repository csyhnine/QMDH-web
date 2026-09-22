import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  type ChatExperienceOverview,
  type ChatExperienceTurnRow,
  type ChatTelemetryAlertRecord,
} from "../../api";

const OUTCOME_LABELS: Record<string, string> = {
  success: "成功",
  agent_success: "Agent 成功",
  upstream_error: "上游错误",
  attachment_error: "附件错误",
  interrupted: "连接中断",
  stream_error: "流错误",
  agent_error: "Agent 错误",
};

const CLIENT_EVENT_LABELS: Record<string, string> = {
  "chat.send.clicked": "点击发送",
  "chat.send.blocked_busy": "处理中重复点击",
  "chat.stream.client_error": "客户端流错误",
  "chat.stream.status": "进度文案",
  "chat.conversation.switch": "处理中切换会话",
  "chat.attachment.upload.start": "附件上传开始",
  "chat.attachment.upload.success": "附件上传成功",
  "chat.attachment.upload.error": "附件上传失败",
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function formatBytes(value: number): string {
  if (value <= 0) return "0 B";
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${ms}ms`;
}

function userLabel(row: ChatExperienceTurnRow): string {
  return row.user_display_name || row.user_name || "—";
}

export default function ChatExperiencePage() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<ChatExperienceOverview | null>(null);
  const [turns, setTurns] = useState<ChatExperienceTurnRow[]>([]);
  const [turnTotal, setTurnTotal] = useState(0);
  const [alerts, setAlerts] = useState<ChatTelemetryAlertRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [evaluatingAlerts, setEvaluatingAlerts] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextOverview, nextTurns, nextAlerts] = await Promise.all([
        api.chatExperienceOverview(days),
        api.chatExperienceTurns(days, 50, 0),
        api.chatExperienceAlerts("open", 20),
      ]);
      setOverview(nextOverview);
      setTurns(nextTurns.items);
      setTurnTotal(nextTurns.total);
      setAlerts(nextAlerts.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 Chat 体验分析失败");
      setOverview(null);
      setTurns([]);
      setTurnTotal(0);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  async function runAlertEvaluation() {
    setEvaluatingAlerts(true);
    setAlertMessage("");
    setError("");
    try {
      const result = await api.chatExperienceEvaluateAlerts();
      const summary = [
        result.created ? `新建 ${result.created}` : "",
        result.updated ? `更新 ${result.updated}` : "",
        result.resolved ? `恢复 ${result.resolved}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      setAlertMessage(summary || "未发现新的告警");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "告警评估失败");
    } finally {
      setEvaluatingAlerts(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const outcomeEntries = useMemo(() => {
    if (!overview) return [];
    return Object.entries(overview.outcome_totals)
      .filter(([, count]) => count > 0)
      .sort((left, right) => right[1] - left[1]);
  }, [overview]);

  const clientEventEntries = useMemo(() => {
    if (!overview) return [];
    return Object.entries(overview.client_event_totals)
      .filter(([, count]) => count > 0)
      .sort((left, right) => right[1] - left[1]);
  }, [overview]);

  return (
    <section className="ops-dashboard generation-analytics-page chat-experience-page">
      <header className="ops-dashboard-head">
        <div>
          <h1>Chat 体验分析</h1>
          <p>
            基于 `chat_turn_telemetry` 漏斗数据，衡量发送成功率、Pack 耗时、上游调用率与客户端异常。
            {overview ? <> 当前窗口自 {formatDateTime(overview.window_started_at)}。</> : null}
          </p>
        </div>
        <div className="ops-toolbar">
          <div className="ops-segment">
            {[7, 30, 90].map((option) => (
              <button
                key={option}
                type="button"
                className={days === option ? "active" : ""}
                onClick={() => setDays(option)}
              >
                {option} 天
              </button>
            ))}
          </div>
          <button type="button" className="ops-icon-button" onClick={() => void refresh()} disabled={loading}>
            {loading ? "刷新中..." : "刷新"}
          </button>
          <button
            type="button"
            className="ops-icon-button"
            onClick={() => void runAlertEvaluation()}
            disabled={loading || evaluatingAlerts}
          >
            {evaluatingAlerts ? "评估中..." : "立即评估告警"}
          </button>
        </div>
      </header>

      {error ? <div className="floating-error">{error}</div> : null}
      {alertMessage ? <div className="floating-notice success">{alertMessage}</div> : null}

      {alerts.length > 0 ? (
        <section className="ops-panel chat-experience-alerts">
          <div className="ops-panel-head">
            <h2>当前告警</h2>
            <span>基于近 1 小时滑动窗口，每小时自动评估</span>
          </div>
          <div className="chat-experience-alert-list">
            {alerts.map((alert) => (
              <article
                key={alert.id}
                className={`chat-experience-alert ${alert.severity === "critical" ? "is-critical" : "is-warning"}`}
              >
                <strong>{alert.title}</strong>
                <p>{alert.message}</p>
                <small>
                  最近触发 {formatDateTime(alert.last_seen_at)} · 累计 {formatCount(alert.occurrence_count)} 次
                </small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!overview && !loading ? <div className="template-empty">暂无 Chat 埋点数据。</div> : null}

      {overview ? (
        <>
          <div className="ops-kpi-grid">
            <article className="ops-kpi-card ops-kpi-blue">
              <div>
                <span>对话轮次</span>
                <strong>{formatCount(overview.turn_count)}</strong>
              </div>
              <p>已完成统计的 Chat turn 数</p>
            </article>
            <article className="ops-kpi-card ops-kpi-green">
              <div>
                <span>成功率</span>
                <strong>{formatPercent(overview.success_rate)}</strong>
              </div>
              <p>success + agent_success 占比</p>
            </article>
            <article className="ops-kpi-card ops-kpi-purple">
              <div>
                <span>上游调用率</span>
                <strong>{formatPercent(overview.upstream_call_rate)}</strong>
              </div>
              <p>真正调用模型 API 的请求比例</p>
            </article>
            <article className="ops-kpi-card ops-kpi-orange">
              <div>
                <span>Pack P95</span>
                <strong>{formatDuration(overview.p95_pack_duration_ms)}</strong>
              </div>
              <p>附件/上下文打包耗时的 95 分位</p>
            </article>
            <article className="ops-kpi-card ops-kpi-blue">
              <div>
                <span>TTFT P95</span>
                <strong>{formatDuration(overview.p95_ttft_ms)}</strong>
              </div>
              <p>首字延迟 95 分位</p>
            </article>
            <article className="ops-kpi-card ops-kpi-green">
              <div>
                <span>带附件轮次</span>
                <strong>{formatPercent(overview.attachment_turn_share)}</strong>
              </div>
              <p>{formatCount(overview.attachment_turn_count)} 次含附件</p>
            </article>
          </div>

          <div className="ops-panel-grid">
            <section className="ops-panel">
              <div className="ops-panel-head">
                <h2>失败原因分布</h2>
                <span>按 outcome 统计</span>
              </div>
              {outcomeEntries.length === 0 ? (
                <p className="template-empty">暂无 outcome 数据</p>
              ) : (
                <div className="admin-table-panel">
                  {outcomeEntries.map(([key, count]) => (
                    <div key={key} className="admin-table-row">
                      <span>{OUTCOME_LABELS[key] || key}</span>
                      <strong>{formatCount(count)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="ops-panel">
              <div className="ops-panel-head">
                <h2>客户端事件</h2>
                <span>重复点击 / network error / 切换会话等</span>
              </div>
              {clientEventEntries.length === 0 ? (
                <p className="template-empty">暂无客户端事件</p>
              ) : (
                <div className="admin-table-panel">
                  {clientEventEntries.map(([key, count]) => (
                    <div key={key} className="admin-table-row">
                      <span>{CLIENT_EVENT_LABELS[key] || key}</span>
                      <strong>{formatCount(count)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="admin-table-panel generation-analytics-table">
            <div className="ops-panel-head">
              <h2>最近轮次明细</h2>
              <span>共 {formatCount(turnTotal)} 条</span>
            </div>
            <div className="admin-table-head generation-analytics-session-head">
              <span>时间</span>
              <span>用户</span>
              <span>模型</span>
              <span>结果</span>
              <span>Pack</span>
              <span>上游</span>
              <span>附件</span>
              <span>客户端事件</span>
            </div>
            {turns.map((row) => (
              <div key={row.id} className="admin-table-row generation-analytics-session-row">
                <span>{formatDateTime(row.started_at)}</span>
                <span title={row.correlation_id}>{userLabel(row)}</span>
                <span title={row.provider_name}>{row.model_name || "—"}</span>
                <span>{OUTCOME_LABELS[row.outcome] || row.outcome}</span>
                <span>{formatDuration(row.pack_duration_ms)}</span>
                <span>{row.upstream_called ? "是" : "否"}</span>
                <span>
                  {row.attachment_count > 0
                    ? `${row.attachment_count} · ${formatBytes(row.attachment_total_bytes)}`
                    : "—"}
                </span>
                <span>{row.client_event_count > 0 ? formatCount(row.client_event_count) : "—"}</span>
              </div>
            ))}
          </section>
        </>
      ) : null}
    </section>
  );
}
