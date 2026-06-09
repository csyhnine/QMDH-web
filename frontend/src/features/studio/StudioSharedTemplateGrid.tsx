import StudioSharedTemplateGridCard from "./StudioSharedTemplateGridCard";
import type { StudioSharedTemplateGridProps } from "./studioSharedTemplateGridTypes";

export default function StudioSharedTemplateGrid({
  activeTemplateId,
  browser,
}: StudioSharedTemplateGridProps) {
  return (
    <div className="template-browser-main">
      <div className="template-browser-main-head">
        <strong>{browser.activeTemplateHeading}</strong>
        <span>{browser.filteredSharedTemplates.length} 个模板</span>
      </div>
      {browser.filteredSharedTemplates.length > 0 ? (
        <div className="template-grid">
          {browser.filteredSharedTemplates.map((template) => (
            <StudioSharedTemplateGridCard
              key={template.id}
              active={activeTemplateId === template.id}
              browser={browser}
              template={template}
            />
          ))}
        </div>
      ) : (
        <div className="template-empty">当前筛选条件下还没有匹配到模板。</div>
      )}
    </div>
  );
}
