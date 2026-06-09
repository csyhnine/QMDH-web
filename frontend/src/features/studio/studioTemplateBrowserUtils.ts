import type { PromptTemplateRecord } from "../../api";
import { templatePrimaryCategory, templateSecondaryCategory } from "./studioTemplateUtils";

export type TemplateQuickFilter = "all" | "featured" | "recent";

export type TemplateCategoryGroup = {
  category: string;
  subcategories: string[];
};

type TemplateFilterOptions = {
  activeCategory: string;
  activeSubcategory: string;
  quickFilter: TemplateQuickFilter;
  search: string;
};

export function buildSharedTemplateCategories(templates: PromptTemplateRecord[]): TemplateCategoryGroup[] {
  const grouped = new Map<string, Set<string>>();
  for (const template of templates) {
    const primary = templatePrimaryCategory(template);
    const secondary = templateSecondaryCategory(template);
    if (!grouped.has(primary)) {
      grouped.set(primary, new Set());
    }
    grouped.get(primary)?.add(secondary);
  }

  return Array.from(grouped.entries())
    .map(([category, subcategories]) => ({
      category,
      subcategories: Array.from(subcategories.values()).sort((left, right) => left.localeCompare(right, "zh-CN")),
    }))
    .sort((left, right) => left.category.localeCompare(right.category, "zh-CN"));
}

export function filterSharedTemplates(
  templates: PromptTemplateRecord[],
  { activeCategory, activeSubcategory, quickFilter, search }: TemplateFilterOptions
): PromptTemplateRecord[] {
  const keyword = search.trim().toLowerCase();
  const searched = templates.filter((template) => {
    if (!keyword) return true;
    const haystack = [
      template.label,
      template.title,
      template.deliverable,
      template.notes,
      template.category,
      template.subcategory,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(keyword);
  });

  const categoryFiltered = searched.filter((template) => {
    if (activeCategory === "all") return true;
    if (templatePrimaryCategory(template) !== activeCategory) return false;
    if (activeSubcategory === "all") return true;
    return templateSecondaryCategory(template) === activeSubcategory;
  });

  return [...categoryFiltered].sort((left, right) => compareSharedTemplates(left, right, quickFilter));
}

function compareSharedTemplates(
  left: PromptTemplateRecord,
  right: PromptTemplateRecord,
  quickFilter: TemplateQuickFilter
): number {
  if (quickFilter === "featured") {
    const popularityDelta = right.popularity_score - left.popularity_score;
    if (Math.abs(popularityDelta) > 0.001) return popularityDelta;
    const applyDelta = right.recent_apply_count - left.recent_apply_count;
    if (applyDelta !== 0) return applyDelta;
    const successDelta = right.recent_submit_success_count - left.recent_submit_success_count;
    if (successDelta !== 0) return successDelta;
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  }

  if (quickFilter === "recent") {
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  }

  if (left.is_featured !== right.is_featured) {
    return left.is_featured ? -1 : 1;
  }

  const categoryCompare = templatePrimaryCategory(left).localeCompare(templatePrimaryCategory(right), "zh-CN");
  if (categoryCompare !== 0) return categoryCompare;
  const subcategoryCompare = templateSecondaryCategory(left).localeCompare(templateSecondaryCategory(right), "zh-CN");
  if (subcategoryCompare !== 0) return subcategoryCompare;
  return left.label.localeCompare(right.label, "zh-CN");
}
