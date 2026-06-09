import type { StudioSharedTemplateSubcategoryListProps } from "./studioSharedTemplateCategoryTypes";

export default function StudioSharedTemplateSubcategoryList({
  activeSubcategory,
  category,
  subcategories,
  onActivateSubcategory,
}: StudioSharedTemplateSubcategoryListProps) {
  return (
    <div className="template-nav-sublist">
      {subcategories.map((subcategory) => (
        <button
          key={`${category}-${subcategory}`}
          type="button"
          className={
            activeSubcategory === subcategory
              ? "template-nav-subitem is-active"
              : "template-nav-subitem"
          }
          onClick={() => onActivateSubcategory(category, subcategory)}
        >
          <span>{subcategory}</span>
        </button>
      ))}
    </div>
  );
}
