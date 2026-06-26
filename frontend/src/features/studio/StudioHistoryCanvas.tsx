import StudioHistoryFeed from "./StudioHistoryFeed";
import StudioHistoryPane from "./StudioHistoryPane";
import { getStudioHistoryCanvasProps } from "./studioHistoryCanvasProps";
import type { StudioHistoryCanvasProps } from "./studioHistoryCanvasTypes";

export default function StudioHistoryCanvas(props: StudioHistoryCanvasProps) {
  const { feedProps, paneProps, scrollProps } = getStudioHistoryCanvasProps(props);

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
        <div className="studio-scroll-content">
          <StudioHistoryPane {...paneProps}>
            <StudioHistoryFeed {...feedProps} />
          </StudioHistoryPane>
        </div>
      ) : (
        <StudioHistoryPane {...paneProps}>
          <StudioHistoryFeed {...feedProps} />
        </StudioHistoryPane>
      )}
    </div>
  );
}
