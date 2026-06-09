import type { TemplateCategoryGroup, TemplateQuickFilter } from "./studioTemplateBrowserUtils";

export function expandMissingTemplateCategories(
  current: Record<string, boolean>,
  categories: TemplateCategoryGroup[]
) {
  const next = { ...current };
  let changed = false;

  for (const item of categories) {
    if (!(item.category in next)) {
      next[item.category] = true;
      changed = true;
    }
  }

  return changed ? next : current;
}

export function isTemplateCategoryAvailable(
  category: string,
  categories: TemplateCategoryGroup[]
) {
  return categories.some((item) => item.category === category);
}

export function isTemplateSubcategoryAvailable(
  categoryName: string,
  subcategoryName: string,
  categories: TemplateCategoryGroup[]
) {
  const category = categories.find((item) => item.category === categoryName);
  return Boolean(category?.subcategories.includes(subcategoryName));
}

export function buildActiveTemplateHeading({
  activeCategory,
  activeSubcategory,
  quickFilter,
}: {
  activeCategory: string;
  activeSubcategory: string;
  quickFilter: TemplateQuickFilter;
}) {
  if (activeSubcategory !== "all") return activeSubcategory;
  if (activeCategory !== "all") return activeCategory;
  if (quickFilter === "featured") return "热度";
  if (quickFilter === "recent") return "最新";
  return "全部";
}

export function toggleTemplateCategory(
  current: Record<string, boolean>,
  category: string,
  expanded: boolean
) {
  return {
    ...current,
    [category]: !expanded,
  };
}
