import { useCallback, useEffect, useMemo, useState } from "react";

import { api, type UsageLogPage, type UsageLogRecord } from "../../api";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const UNGROUPED_LABEL = "未分组";

type FilterDraft = {
  startAt: string;
  endAt: string;
  userName: string;
  groupName: string;
  modelName: string;
  providerName: string;
  capability: string;
  entryType: string;
  status: string;
  includeTaskSummary: boolean;
};

function defaultStartAt(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  date.setHours(0, 0, 0, 0);
  return toLocalDateTimeInput(date);
}

function defaultEndAt(): string {
  return toLocalDateTimeInput(new Date());
}

function toLocalDateTimeInput(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function toIsoParam(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatLatency(ms: number): string {
  if (ms <= 0) return "—";
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} min`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${ms} ms`;
}

function formatCost(record: UsageLogRecord): string {
  const symbol = record.cost_currency === "CNY" ? "¥" : record.cost_currency === "USD" ? "$" : "";
  return `${symbol}${record.cost.toFixed(record.cost_currency === "USD" ? 4 : 2)} ${record.cost_currency}`;
}

function formatTokenCount(value: number): string {
  if (value <= 0) return "—";
  return new Intl.NumberFormat("zh-CN").format(value);
}

function groupLabel(groupName: string): string {
  return groupName.trim() || UNGROUPED_LABEL;
}

function capabilityLabel(value: string): string {
  if (value === "image.generate") return "图片生成";
  if (value === "image.edit") return "图片编辑";
  if (value === "video.generate") return "视频生成";
  if (value === "chat.completions") return "对话";
  return value || "—";
}

function usageKindClass(kind: string): string {
  if (kind === "失败") return "usage-kind-failed";
  if (kind === "对话") return "usage-kind-chat";
  return "usage-kind-success";
}

function defaultFilters(): FilterDraft {
  return {
    startAt: defaultStartAt(),
    endAt: defaultEndAt(),
    userName: "",
    groupName: "",
    modelName: "",
    providerName: "",
    capability: "",
    entryType: "all",
    status: "all",
    includeTaskSummary: true,
  };
}

function formatWindowCost(rows: UsageLogPage["window_cost_by_currency"]): string {
  if (rows.length === 0) return "¥0.00";
  return rows
    .map((row) => {
      const symbol = row.currency === "CNY" ? "¥" : row.currency === "USD" ? "$" : "";
      return `${symbol}${row.total_cost.toFixed(2)} ${row.currency}`;
    })
    .join(" + ");
}

export default function UsageLogsPage() {
  const [filters, setFilters] = useState<FilterDraft>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterDraft>(defaultFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<UsageLogPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadLogs = useCallback(async (nextPage: number, nextFilters: FilterDraft, nextPageSize: number) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.usageLogs({
        page: nextPage,
        page_size: nextPageSize,
        start_at: toIsoParam(nextFilters.startAt),
        end_at: toIsoParam(nextFilters.endAt),
        user_name: nextFilters.userName.trim() || undefined,
        group_name: nextFilters.groupName.trim() || undefined,
        model_name: nextFilters.modelName.trim() || undefined,
        provider_name: nextFilters.providerName.trim() || undefined,
        capability: nextFilters.capability || undefined,
        entry_type: nextFilters.entryType !== "all" ? nextFilters.entryType : undefined,
        status: nextFilters.status !== "all" ? nextFilters.status : undefined,
        include_task_summary: nextFilters.includeTaskSummary,
      });
      setData(response);
      if (response.page !== nextPage) {
        setPage(response.page);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载使用日志失败");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs(page, appliedFilters, pageSize);
  }, [appliedFilters, loadLogs, page, pageSize]);

  const totalPages = data?.total_pages ?? 1;
  const safePage = data?.page ?? page;

  const pageSummary = useMemo(() => {
    const total = data?.total ?? 0;
    if (total === 0) return "共 0 条记录";
    const start = (safePage - 1) * pageSize + 1;
    const end = Math.min(safePage * pageSize, total);
    return `共 ${total} 条记录，当前显示 ${start}-${end}`;
  }, [data?.total, pageSize, safePage]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters(filters);
  }

  function resetFilters() {
    const next = defaultFilters();
    setFilters(next);
    setAppliedFilters(next);
    setPage(1);
  }

  return (
    <div className="admin-page usage-logs-page">
      <header className="admin-page-head">
        <div>
          <h1>使用日志</h1>
          <p>查看模型调用、对话与任务计费的明细记录，支持按用户、模型与时间筛选。</p>
        </div>
        <div className="admin-head-actions">
          <button type="button" onClick={() => void loadLogs(page, appliedFilters, pageSize)} disabled={loading}>
            {loading ? "刷新中..." : "刷新"}
          </button>
        </div>
      </header>

      <div className="admin-kpi-grid admin-kpi-grid-4">
        <article className="admin-kpi-card admin-blue">
          <span>筛选范围内记录</span>
          <strong>{data?.total ?? 0}</strong>
          <small>{pageSummary}</small>
          <i>●</i>
        </article>
        <article className="admin-kpi-card admin-green">
          <span>筛选范围内花费</span>
          <strong>{formatWindowCost(data?.window_cost_by_currency ?? [])}</strong>
          <small>按币种分别汇总</small>
          <i>●</i>
        </article>
        <article className="admin-kpi-card admin-purple">
          <span>当前页</span>
          <strong>
            {safePage} / {Math.max(totalPages, 1)}
          </strong>
          <small>每页 {pageSize} 条</small>
          <i>●</i>
        </article>
        <article className="admin-kpi-card admin-gray">
          <span>时间范围</span>
          <strong>{appliedFilters.startAt.slice(0, 10)}</strong>
          <small>至 {appliedFilters.endAt.slice(0, 10)}</small>
          <i>●</i>
        </article>
      </div>

      <section className="admin-table-panel">
        <div className="admin-toolbar usage-logs-toolbar">
          <label className="usage-log-field">
            <span>开始时间</span>
            <input
              type="datetime-local"
              value={filters.startAt}
              onChange={(event) => setFilters((current) => ({ ...current, startAt: event.target.value }))}
            />
          </label>
          <label className="usage-log-field">
            <span>结束时间</span>
            <input
              type="datetime-local"
              value={filters.endAt}
              onChange={(event) => setFilters((current) => ({ ...current, endAt: event.target.value }))}
            />
          </label>
          <label className="usage-log-field">
            <span>用户</span>
            <input
              value={filters.userName}
              onChange={(event) => setFilters((current) => ({ ...current, userName: event.target.value }))}
              placeholder="用户名"
            />
          </label>
          <label className="usage-log-field">
            <span>分组</span>
            <input
              value={filters.groupName}
              onChange={(event) => setFilters((current) => ({ ...current, groupName: event.target.value }))}
              placeholder="账号分组"
            />
          </label>
          <label className="usage-log-field">
            <span>模型</span>
            <input
              value={filters.modelName}
              onChange={(event) => setFilters((current) => ({ ...current, modelName: event.target.value }))}
              placeholder="模型名称"
            />
          </label>
          <label className="usage-log-field">
            <span>Provider</span>
            <input
              value={filters.providerName}
              onChange={(event) => setFilters((current) => ({ ...current, providerName: event.target.value }))}
              placeholder="Provider 名称"
            />
          </label>
          <select
            aria-label="能力筛选"
            value={filters.capability}
            onChange={(event) => setFilters((current) => ({ ...current, capability: event.target.value }))}
          >
            <option value="">全部能力</option>
            <option value="image.generate">图片生成</option>
            <option value="image.edit">图片编辑</option>
            <option value="video.generate">视频生成</option>
            <option value="chat.completions">对话</option>
          </select>
          <select
            aria-label="记录类型"
            value={filters.entryType}
            onChange={(event) => setFilters((current) => ({ ...current, entryType: event.target.value }))}
          >
            <option value="all">全部类型</option>
            <option value="provider_call.recorded">Provider 调用</option>
            <option value="chat.message.completed">对话消息</option>
            <option value="task.finalized">任务汇总</option>
          </select>
          <select
            aria-label="状态筛选"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="all">全部状态</option>
            <option value="success">成功</option>
            <option value="failed">失败</option>
          </select>
          <label className="model-toggle usage-log-toggle">
            <input
              type="checkbox"
              checked={filters.includeTaskSummary}
              onChange={(event) =>
                setFilters((current) => ({ ...current, includeTaskSummary: event.target.checked }))
              }
            />
            <span>含任务汇总行</span>
          </label>
          <button type="button" className="admin-primary-button" onClick={applyFilters}>
            查询
          </button>
          <button type="button" onClick={resetFilters}>
            重置
          </button>
        </div>

        {error ? <div className="floating-error">{error}</div> : null}

        <div className="admin-list-summary">
          <span>{pageSummary}</span>
          <label className="admin-pagination-size">
            <span>每页</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="admin-data-table usage-logs-table">
          <div className="admin-table-row admin-table-head">
            <span>时间</span>
            <span>用户</span>
            <span>分组</span>
            <span>类型</span>
            <span>模型</span>
            <span>能力</span>
            <span>用时</span>
            <span>输入</span>
            <span>输出</span>
            <span>花费</span>
            <span>详情</span>
          </div>
          {(data?.items ?? []).map((record) => (
            <div key={record.id} className="admin-table-row">
              <span>{formatDateTime(record.recorded_at)}</span>
              <span>
                <strong>{record.user_display_name || record.user_name}</strong>
                <small>@{record.user_name}</small>
              </span>
              <span>{groupLabel(record.group_name)}</span>
              <span>
                <em className={`usage-kind-pill ${usageKindClass(record.usage_kind)}`}>{record.usage_kind}</em>
              </span>
              <span>
                <strong className="usage-model-name">{record.model_name || "—"}</strong>
                {record.provider_name && record.provider_name !== record.model_name ? (
                  <small>{record.provider_name}</small>
                ) : null}
              </span>
              <span>{capabilityLabel(record.capability)}</span>
              <span>
                <strong>{formatLatency(record.latency_ms)}</strong>
                {record.entry_type === "chat.message.completed" ? <small>流式</small> : <small>非流</small>}
              </span>
              <span>{formatTokenCount(record.input_tokens)}</span>
              <span>{formatTokenCount(record.output_tokens)}</span>
              <span>
                <strong>{formatCost(record)}</strong>
                {record.cached_input_tokens > 0 ? <small>缓存 {formatTokenCount(record.cached_input_tokens)}</small> : null}
              </span>
              <span className="usage-log-detail">
                {record.detail_text || (record.task_id ? `任务 #${record.task_id}` : "—")}
              </span>
            </div>
          ))}
          {!loading && (data?.items.length ?? 0) === 0 ? (
            <div className="admin-table-empty">当前筛选条件下没有使用记录。</div>
          ) : null}
        </div>

        <div className="admin-pagination">
          <button type="button" disabled={safePage <= 1 || loading} onClick={() => setPage((current) => current - 1)}>
            上一页
          </button>
          <span>
            第 {safePage} / {Math.max(totalPages, 1)} 页
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            下一页
          </button>
        </div>
      </section>
    </div>
  );
}
