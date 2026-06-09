import StudioDesignerView from "./StudioDesignerView";
import StudioGlobalRail from "./StudioGlobalRail";
import StudioMediaLightboxes from "./StudioMediaLightboxes";
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
    <div className="studio-shell">
      <StudioGlobalRail {...railProps} />
      <StudioDesignerView {...designerProps} />
      <StudioMediaLightboxes {...lightboxProps} />
    </div>
  );
}
