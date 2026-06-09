import StudioHistoryFeed from "./StudioHistoryFeed";
import StudioHistoryPane from "./StudioHistoryPane";
import { getStudioHistoryCanvasProps } from "./studioHistoryCanvasProps";
import type { StudioHistoryCanvasProps } from "./studioHistoryCanvasTypes";

export default function StudioHistoryCanvas(props: StudioHistoryCanvasProps) {
  const { feedProps, paneProps, scrollProps } = getStudioHistoryCanvasProps(props);

  return (
    <div
      ref={scrollProps.studioScrollPaneRef}
      className={scrollProps.isStudioDockLayout ? "studio-scroll-pane" : "studio-scroll-fallback"}
    >
      <StudioHistoryPane {...paneProps}>
        <StudioHistoryFeed {...feedProps} />
      </StudioHistoryPane>
    </div>
  );
}
