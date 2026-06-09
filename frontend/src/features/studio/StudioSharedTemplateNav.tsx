import StudioSharedTemplateCategoryGroup from "./StudioSharedTemplateCategoryGroup";
import StudioSharedTemplateQuickFilters from "./StudioSharedTemplateQuickFilters";
import type { SharedTemplateBrowserState } from "./useSharedTemplateBrowser";

type StudioSharedTemplateNavProps = {
  browser: SharedTemplateBrowserState;
};

export default function StudioSharedTemplateNav({ browser }: StudioSharedTemplateNavProps) {
  return (
    <div className="template-browser-nav">
      <StudioSharedTemplateQuickFilters browser={browser} />
      {browser.sharedTemplateCategories.map((group) => (
        <StudioSharedTemplateCategoryGroup key={group.category} browser={browser} group={group} />
      ))}
    </div>
  );
}
