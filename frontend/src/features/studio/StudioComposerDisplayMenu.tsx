import StudioComposerDisplayMenuPanel from "./StudioComposerDisplayMenuPanel";
import StudioComposerDisplayMenuTrigger from "./StudioComposerDisplayMenuTrigger";
import type { StudioComposerDisplayMenuProps } from "./studioComposerDisplayMenuTypes";

export default function StudioComposerDisplayMenu(props: StudioComposerDisplayMenuProps) {
  return (
    <div className="composer-menu">
      <StudioComposerDisplayMenuTrigger
        activeComposerMenu={props.activeComposerMenu}
        selectedResolutionLabel={props.selectedResolutionLabel}
        studioForm={props.studioForm}
        onToggleComposerMenu={props.onToggleComposerMenu}
      />
      {props.activeComposerMenu === "display" ? <StudioComposerDisplayMenuPanel {...props} /> : null}
    </div>
  );
}
