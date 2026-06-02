import { type ReactNode } from "react";

import { type Provider } from "../../api";

export type FeedFilterState = {
  sort: "latest" | "oldest";
  status: "all" | "running" | "completed";
  provider: string;
};

type StudioHistoryPaneProps = {
  availableProviders: Provider[];
  error: string;
  notice?: { tone: "success" | "error" | "info"; message: string } | null;
  filters: FeedFilterState;
  hasFilteredHistory: boolean;
  hasProjectHistory: boolean;
  workspaceName: string;
  onChangeFilters: (next: FeedFilterState) => void;
  children: ReactNode;
};

export default function StudioHistoryPane({
  availableProviders,
  error,
  notice,
  filters,
  hasFilteredHistory,
  hasProjectHistory,
  workspaceName,
  onChangeFilters,
  children,
}: StudioHistoryPaneProps) {
  return (
    <>
      {hasProjectHistory ? (
        <header className="canvas-topbar canvas-topbar-history">
          <div className="toolbar-row">
            <label className="toolbar-field">
              <span>时间</span>
              <select
                value={filters.sort}
                onChange={(event) => onChangeFilters({ ...filters, sort: event.target.value as FeedFilterState["sort"] })}
              >
                <option value="latest">最近优先</option>
                <option value="oldest">最早优先</option>
              </select>
            </label>

            <label className="toolbar-field">
              <span>生成类型</span>
              <select
                value={filters.provider}
                onChange={(event) => onChangeFilters({ ...filters, provider: event.target.value })}
              >
                <option value="all">全部模型</option>
                {availableProviders.map((provider) => (
                  <option key={provider.provider_name} value={provider.provider_name}>
                    {provider.provider_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="toolbar-field">
              <span>操作状态</span>
              <select
                value={filters.status}
                onChange={(event) => onChangeFilters({ ...filters, status: event.target.value as FeedFilterState["status"] })}
              >
                <option value="all">全部状态</option>
                <option value="running">运行中</option>
                <option value="completed">已完成</option>
              </select>
            </label>
          </div>
        </header>
      ) : null}

      {error ? <div className="floating-error">{error}</div> : null}
      {notice ? <div className={`floating-notice floating-notice-${notice.tone}`}>{notice.message}</div> : null}

      {hasProjectHistory ? (
        <section className="feed-stream">
          {hasFilteredHistory ? (
            children
          ) : (
            <section className="empty-stage empty-stage-inline empty-stage-filtered">
              <div className="empty-stage-copy">
                <p className="canvas-kicker">当前筛选</p>
                <h1>没有匹配的生成记录</h1>
                <p>调整时间、模型或状态筛选后，可以继续查看这个个人项目里的历史任务。</p>
              </div>
            </section>
          )}
        </section>
      ) : (
        <section className="empty-stage empty-stage-inline">
          <div className="empty-stage-copy">
            <p className="canvas-kicker">当前个人项目</p>
            <h1>{workspaceName} 还没有生成记录</h1>
            <p>先从下方输入区发起第一轮生成，结果会在这里按时间沉淀下来。</p>
          </div>
        </section>
      )}
    </>
  );
}
