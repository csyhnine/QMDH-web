import StudioSharedTemplateCategoryButton from "./StudioSharedTemplateCategoryButton";
import StudioSharedTemplateSubcategoryList from "./StudioSharedTemplateSubcategoryList";
import type { StudioSharedTemplateCategoryGroupProps } from "./studioSharedTemplateCategoryTypes";

export default function StudioSharedTemplateCategoryGroup({
  browser,
  group,
}: StudioSharedTemplateCategoryGroupProps) {
  const expanded = browser.expandedTemplateCategories[group.category] ?? true;
  const isCategoryActive = browser.activeTemplateCategory === group.category;

  return (
    <div className="template-nav-group">
      <StudioSharedTemplateCategoryButton
        expanded={expanded}
        label={group.category}
        selected={isCategoryActive && browser.activeTemplateSubcategory === "all"}
        onClick={() => browser.activateCategory(group.category, expanded)}
      />
      {expanded ? (
        <StudioSharedTemplateSubcategoryList
          activeSubcategory={isCategoryActive ? browser.activeTemplateSubcategory : ""}
          category={group.category}
          subcategories={group.subcategories}
          onActivateSubcategory={browser.activateSubcategory}
        />
      ) : null}
    </div>
  );
}
