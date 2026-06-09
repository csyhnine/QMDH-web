import StudioComposerCanvas from "./StudioComposerCanvas";
import StudioHistoryCanvas from "./StudioHistoryCanvas";
import type { StudioComposerCanvasProps } from "./studioComposerCanvasTypes";
import type { StudioHistoryCanvasProps } from "./studioHistoryCanvasTypes";

type StudioCanvasViewProps = {
  composer: StudioComposerCanvasProps;
  history: StudioHistoryCanvasProps;
};

export default function StudioCanvasView({ composer, history }: StudioCanvasViewProps) {
  return (
    <>
      <StudioHistoryCanvas {...history} />
      <StudioComposerCanvas {...composer} />
    </>
  );
}
