import type { SharedTemplateBrowserState } from "./useSharedTemplateBrowser";
import StudioSharedTemplateNav from "./StudioSharedTemplateNav";
import StudioSharedTemplateSearch from "./StudioSharedTemplateSearch";

type StudioSharedTemplateSidebarProps = {
  browser: SharedTemplateBrowserState;
};

export default function StudioSharedTemplateSidebar({ browser }: StudioSharedTemplateSidebarProps) {
  return (
    <aside className="template-browser-sidebar">
      <StudioSharedTemplateSearch browser={browser} />
      <StudioSharedTemplateNav browser={browser} />
    </aside>
  );
}
