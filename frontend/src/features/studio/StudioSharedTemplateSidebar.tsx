import type { SharedTemplateBrowserState } from "./useSharedTemplateBrowser";
import StudioSharedTemplateNav from "./StudioSharedTemplateNav";
import StudioSharedTemplateSearch from "./StudioSharedTemplateSearch";

type StudioSharedTemplateSidebarProps = {
  browser: SharedTemplateBrowserState;
};

export default function StudioSharedTemplateSidebar({ browser }: StudioSharedTemplateSidebarProps) {
  return (
    <aside className="template-browser-sidebar">
      <StudioSharedTemplateSearch
        setTemplateSearch={browser.setTemplateSearch}
        templateSearch={browser.templateSearch}
      />
      <StudioSharedTemplateNav browser={browser} />
    </aside>
  );
}
