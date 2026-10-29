import { isStudioAgentEnabled } from "../../lib/featureFlags";
import StudioAssistantPanel from "./StudioAssistantPanel";
import StudioDesignerView from "./StudioDesignerView";
import StudioGlobalRail from "./StudioGlobalRail";
import StudioMediaLightboxes from "./StudioMediaLightboxes";
import StudioSectionTabs from "./StudioSectionTabs";
import {
  buildStudioAuthenticatedShellProps,
  type StudioAuthenticatedShellProps,
} from "./studioAuthenticatedShellProps";

export default function StudioAuthenticatedShell({
  currentUser,
  studio,
}: StudioAuthenticatedShellProps) {
  const { designerProps, lightboxProps, railProps } = buildStudioAuthenticatedShellProps({
    currentUser,
    studio,
  });

  return (
    <div className={`studio-shell studio-consolidated-shell${designerProps.activeViewIsStudio ? " studio-generation-shell" : ""}`}>
      <StudioGlobalRail {...railProps} />
      {designerProps.activeViewIsStudio && <StudioSectionTabs group="generate" active="generate" />}
      <StudioDesignerView {...designerProps} />
      <StudioMediaLightboxes {...lightboxProps} />
      {isStudioAgentEnabled ? <StudioAssistantPanel /> : null}
    </div>
  );
}
