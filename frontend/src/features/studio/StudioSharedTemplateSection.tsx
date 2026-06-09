import type { PromptTemplateRecord } from "../../api";
import StudioSharedTemplateBrowser from "./StudioSharedTemplateBrowser";

type StudioSharedTemplateSectionProps = {
  activeTemplateId: number | null;
  sharedTemplates: PromptTemplateRecord[];
  onApplyTemplate: (template: PromptTemplateRecord) => void;
};

export default function StudioSharedTemplateSection({
  activeTemplateId,
  sharedTemplates,
  onApplyTemplate,
}: StudioSharedTemplateSectionProps) {
  return (
    <div className="template-section">
      <div className="template-section-head">
        <strong>模板提示词</strong>
        <span>后台统一维护，支持搜索、二级分类、热门筛选和原图/最终图对照预览。</span>
      </div>
      {sharedTemplates.length > 0 ? (
        <StudioSharedTemplateBrowser
          activeTemplateId={activeTemplateId}
          sharedTemplates={sharedTemplates}
          onApplyTemplate={onApplyTemplate}
        />
      ) : (
        <div className="template-empty">后台还没有配置共享模板，当前页面只显示“我的提示词”。</div>
      )}
    </div>
  );
}
