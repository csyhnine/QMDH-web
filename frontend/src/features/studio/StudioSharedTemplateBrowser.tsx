import type { PromptTemplateRecord } from "../../api";
import StudioSharedTemplateGrid from "./StudioSharedTemplateGrid";
import StudioSharedTemplatePreview from "./StudioSharedTemplatePreview";
import StudioSharedTemplateSidebar from "./StudioSharedTemplateSidebar";
import { useSharedTemplateBrowser } from "./useSharedTemplateBrowser";

type StudioSharedTemplateBrowserProps = {
  activeTemplateId: number | null;
  sharedTemplates: PromptTemplateRecord[];
  onApplyTemplate: (template: PromptTemplateRecord) => void;
};

export default function StudioSharedTemplateBrowser({
  activeTemplateId,
  sharedTemplates,
  onApplyTemplate,
}: StudioSharedTemplateBrowserProps) {
  const browser = useSharedTemplateBrowser({ sharedTemplates, onApplyTemplate });

  return (
    <div className="template-browser template-browser-categorized">
      <StudioSharedTemplateSidebar browser={browser} />
      <StudioSharedTemplateGrid activeTemplateId={activeTemplateId} browser={browser} />
      <StudioSharedTemplatePreview browser={browser} />
    </div>
  );
}
