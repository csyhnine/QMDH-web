import StudioHistoryEmptyState from "./StudioHistoryEmptyState";
import StudioHistoryFilters from "./StudioHistoryFilters";
import type { StudioHistoryPaneProps } from "./studioHistoryPaneTypes";

export default function StudioHistoryPane({
  availableProviders,
  error,
  notice,
  filters,
  hasFilteredHistory,
  hasProjectHistory,
  workspaceName,
  onChangeFilters,
  onScrollHistoryToBottom,
  onScrollHistoryToTop,
  children,
}: StudioHistoryPaneProps) {
  return (
    <>
      {hasProjectHistory ? (
        <StudioHistoryFilters
          availableProviders={availableProviders}
          filters={filters}
          onChangeFilters={onChangeFilters}
          onScrollHistoryToBottom={onScrollHistoryToBottom}
          onScrollHistoryToTop={onScrollHistoryToTop}
        />
      ) : null}

      {error ? <div className="floating-error">{error}</div> : null}
      {notice ? <div className={`floating-notice floating-notice-${notice.tone}`}>{notice.message}</div> : null}

      {hasProjectHistory ? (
        <section className="feed-stream">
          {hasFilteredHistory ? children : <StudioHistoryEmptyState type="filtered" workspaceName={workspaceName} />}
        </section>
      ) : (
        <StudioHistoryEmptyState type="project" workspaceName={workspaceName} />
      )}
    </>
  );
}
