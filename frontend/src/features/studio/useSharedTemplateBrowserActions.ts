import type { Dispatch, SetStateAction } from "react";

import type { PromptTemplateRecord } from "../../api";
import type { TemplateQuickFilter } from "./studioTemplateBrowserUtils";
import { toggleTemplateCategory } from "./sharedTemplateBrowserState";
import { trackSharedTemplateEvent } from "./useSharedTemplateTracking";

type UseSharedTemplateBrowserActionsOptions = {
  onApplyTemplate: (template: PromptTemplateRecord) => void;
  setActiveTemplateCategory: Dispatch<SetStateAction<string>>;
  setActiveTemplateSubcategory: Dispatch<SetStateAction<string>>;
  setExpandedTemplateCategories: Dispatch<SetStateAction<Record<string, boolean>>>;
  setTemplateQuickFilter: Dispatch<SetStateAction<TemplateQuickFilter>>;
};

export function useSharedTemplateBrowserActions({
  onApplyTemplate,
  setActiveTemplateCategory,
  setActiveTemplateSubcategory,
  setExpandedTemplateCategories,
  setTemplateQuickFilter,
}: UseSharedTemplateBrowserActionsOptions) {
  function applySharedTemplate(template: PromptTemplateRecord) {
    trackSharedTemplateEvent(template.id, "apply");
    onApplyTemplate(template);
  }

  function activateQuickFilter(nextFilter: TemplateQuickFilter) {
    setTemplateQuickFilter(nextFilter);
    setActiveTemplateCategory("all");
    setActiveTemplateSubcategory("all");
  }

  function activateCategory(category: string, expanded: boolean) {
    setTemplateQuickFilter("all");
    setActiveTemplateCategory(category);
    setActiveTemplateSubcategory("all");
    setExpandedTemplateCategories((current) => toggleTemplateCategory(current, category, expanded));
  }

  function activateSubcategory(category: string, subcategory: string) {
    setTemplateQuickFilter("all");
    setActiveTemplateCategory(category);
    setActiveTemplateSubcategory(subcategory);
  }

  return {
    activateCategory,
    activateQuickFilter,
    activateSubcategory,
    applySharedTemplate,
  };
}
