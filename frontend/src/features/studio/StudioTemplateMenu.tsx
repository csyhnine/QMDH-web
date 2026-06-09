import StudioTemplateMenuPanel from "./StudioTemplateMenuPanel";
import StudioTemplateMenuTrigger from "./StudioTemplateMenuTrigger";
import { getStudioTemplateMenuProps } from "./studioTemplateMenuProps";
import type { StudioTemplateMenuProps } from "./studioTemplateMenuTypes";

export default function StudioTemplateMenu(props: StudioTemplateMenuProps) {
  const { panelProps, triggerProps } = getStudioTemplateMenuProps(props);

  return (
    <div className="composer-menu">
      <StudioTemplateMenuTrigger {...triggerProps} />
      {props.activeComposerMenu === "template" ? <StudioTemplateMenuPanel {...panelProps} /> : null}
    </div>
  );
}
