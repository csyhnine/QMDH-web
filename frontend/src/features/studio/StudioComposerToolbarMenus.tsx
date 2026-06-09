import StudioComposerCountMenuSlot from "./StudioComposerCountMenuSlot";
import StudioComposerDisplayMenuSlot from "./StudioComposerDisplayMenuSlot";
import StudioComposerProviderMenuSlot from "./StudioComposerProviderMenuSlot";
import StudioComposerTemplateMenuSlot from "./StudioComposerTemplateMenuSlot";
import type { StudioComposerToolbarMenusProps } from "./studioComposerToolbarTypes";

export default function StudioComposerToolbarMenus(props: StudioComposerToolbarMenusProps) {
  return (
    <>
      <StudioComposerTemplateMenuSlot {...props} />
      <StudioComposerProviderMenuSlot {...props} />
      <StudioComposerDisplayMenuSlot {...props} />
      <StudioComposerCountMenuSlot {...props} />
    </>
  );
}
