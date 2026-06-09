import type { StudioComposerCanvasProps } from "./studioComposerCanvasTypes";
import type { StudioHistoryCanvasProps } from "./studioHistoryCanvasTypes";
import type { StudioDesignerViewProps } from "./studioDesignerViewTypes";
import { buildStudioComposerCanvasProps } from "./studioComposerCanvasPropsBuilder";
import { buildStudioHistoryCanvasProps } from "./studioHistoryCanvasPropsBuilder";

export function buildStudioCanvasProps(props: StudioDesignerViewProps): {
  composer: StudioComposerCanvasProps;
  history: StudioHistoryCanvasProps;
} {
  return {
    composer: buildStudioComposerCanvasProps(props),
    history: buildStudioHistoryCanvasProps(props),
  };
}
