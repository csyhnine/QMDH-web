import StudioComposerDock from "./StudioComposerDock";
import type { StudioComposerCanvasProps } from "./studioComposerCanvasTypes";

export default function StudioComposerCanvas(props: StudioComposerCanvasProps) {
  if (!props.showComposer) {
    return null;
  }

  return <StudioComposerDock {...props} />;
}
