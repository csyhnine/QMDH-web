import StudioHistoryFeed from "./StudioHistoryFeed";
import StudioHistoryPane from "./StudioHistoryPane";
import StudioHistoryScrollFab from "./StudioHistoryScrollFab";
import { getStudioHistoryCanvasProps } from "./studioHistoryCanvasProps";
import type { StudioHistoryCanvasProps } from "./studioHistoryCanvasTypes";

export default function StudioHistoryCanvas(props: StudioHistoryCanvasProps) {
  const { feedProps, paneProps, scrollProps } = getStudioHistoryCanvasProps(props);
  const pagination = (
    <div style={{ padding: "16px", textAlign: "center" }}>
      {props.historyError ? <p role="alert">{props.historyError}</p> : null}
      {props.hasMoreHistory ? (
        <>
          <p>筛选结果仅包含已加载的历史记录。</p>
          <button type="button" className="ghost-button" disabled={props.loadingHistory}
            onClick={props.onLoadMoreHistory}>
            {props.loadingHistory ? "正在加载…" : "加载更多历史记录"}
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <div
      ref={scrollProps.studioScrollPaneRef}
      className={
        scrollProps.isStudioDockLayout
          ? "studio-scroll-pane studio-scroll-pane-track"
          : "studio-scroll-fallback"
      }
    >
      {scrollProps.isStudioDockLayout ? (
        <>
          <div className="studio-scroll-content">
            <StudioHistoryPane {...paneProps}>
              <StudioHistoryFeed {...feedProps} />
            </StudioHistoryPane>
            {pagination}
          </div>
          {scrollProps.showScrollFab ? (
            <StudioHistoryScrollFab
              onScrollHistoryToTop={scrollProps.onScrollHistoryToTop}
              onScrollHistoryToBottom={scrollProps.onScrollHistoryToBottom}
            />
          ) : null}
        </>
      ) : (
        <>
          <StudioHistoryPane {...paneProps}>
            <StudioHistoryFeed {...feedProps} />
          </StudioHistoryPane>
          {pagination}
        </>
      )}
    </div>
  );
}
