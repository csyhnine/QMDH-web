import StudioComposerCountMenuSlot from "./StudioComposerCountMenuSlot";
import StudioComposerDisplayMenuSlot from "./StudioComposerDisplayMenuSlot";
import StudioComposerGrokSkuMenuSlot from "./StudioComposerGrokSkuMenuSlot";
import StudioComposerProviderMenuSlot from "./StudioComposerProviderMenuSlot";
import StudioComposerTemplateMenuSlot from "./StudioComposerTemplateMenuSlot";
import type { StudioComposerToolbarMenusProps } from "./studioComposerToolbarTypes";

export default function StudioComposerToolbarMenus(props: StudioComposerToolbarMenusProps) {
  const isVideoMode = props.studioForm.creationMode === "video";

  return (
    <>
      {isVideoMode ? null : <StudioComposerTemplateMenuSlot {...props} />}
      <StudioComposerProviderMenuSlot {...props} />
      {isVideoMode ? <StudioComposerGrokSkuMenuSlot {...props} /> : null}
      <StudioComposerDisplayMenuSlot {...props} />
      {isVideoMode ? null : <StudioComposerCountMenuSlot {...props} />}
    </>
  );
}
