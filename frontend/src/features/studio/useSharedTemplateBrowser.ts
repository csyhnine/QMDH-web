import { useEffect, useMemo, useState } from "react";

import type { PromptTemplateRecord } from "../../api";
import {
  buildSharedTemplateCategories,
  filterSharedTemplates,
  type TemplateQuickFilter,
} from "./studioTemplateBrowserUtils";
import {
  buildActiveTemplateHeading,
  expandMissingTemplateCategories,
  isTemplateCategoryAvailable,
  isTemplateSubcategoryAvailable,
} from "./sharedTemplateBrowserState";
import { useSharedTemplateBrowserActions } from "./useSharedTemplateBrowserActions";
import { useSharedTemplatePreview } from "./useSharedTemplatePreview";
import { useSharedTemplateImpressions } from "./useSharedTemplateTracking";

type UseSharedTemplateBrowserOptions = {
  sharedTemplates: PromptTemplateRecord[];
  onApplyTemplate: (template: PromptTemplateRecord) => void;
};

export function useSharedTemplateBrowser({
  sharedTemplates,
  onApplyTemplate,
}: UseSharedTemplateBrowserOptions) {
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateQuickFilter, setTemplateQuickFilter] = useState<TemplateQuickFilter>("all");
  const [activeTemplateCategory, setActiveTemplateCategory] = useState("all");
  const [activeTemplateSubcategory, setActiveTemplateSubcategory] = useState("all");
  const [expandedTemplateCategories, setExpandedTemplateCategories] = useState<Record<string, boolean>>({});

  const sharedTemplateCategories = useMemo(
    () => buildSharedTemplateCategories(sharedTemplates),
    [sharedTemplates]
  );

  useEffect(() => {
    if (sharedTemplateCategories.length === 0) return;
    setExpandedTemplateCategories((current) => expandMissingTemplateCategories(current, sharedTemplateCategories));
  }, [sharedTemplateCategories]);

  useEffect(() => {
    if (
      activeTemplateCategory !== "all" &&
      !isTemplateCategoryAvailable(activeTemplateCategory, sharedTemplateCategories)
    ) {
      setActiveTemplateCategory("all");
      setActiveTemplateSubcategory("all");
    }
  }, [activeTemplateCategory, sharedTemplateCategories]);

  useEffect(() => {
    if (activeTemplateCategory === "all" || activeTemplateSubcategory === "all") return;
    if (
      !isTemplateSubcategoryAvailable(
        activeTemplateCategory,
        activeTemplateSubcategory,
        sharedTemplateCategories
      )
    ) {
      setActiveTemplateSubcategory("all");
    }
  }, [activeTemplateCategory, activeTemplateSubcategory, sharedTemplateCategories]);

  const filteredSharedTemplates = useMemo(
    () =>
      filterSharedTemplates(sharedTemplates, {
        activeCategory: activeTemplateCategory,
        activeSubcategory: activeTemplateSubcategory,
        quickFilter: templateQuickFilter,
        search: templateSearch,
      }),
    [activeTemplateCategory, activeTemplateSubcategory, sharedTemplates, templateQuickFilter, templateSearch]
  );

  const templatePreview = useSharedTemplatePreview({ templates: filteredSharedTemplates });
  useSharedTemplateImpressions(filteredSharedTemplates);

  const activeTemplateHeading = buildActiveTemplateHeading({
    activeCategory: activeTemplateCategory,
    activeSubcategory: activeTemplateSubcategory,
    quickFilter: templateQuickFilter,
  });
  const templateActions = useSharedTemplateBrowserActions({
    onApplyTemplate,
    setActiveTemplateCategory,
    setActiveTemplateSubcategory,
    setExpandedTemplateCategories,
    setTemplateQuickFilter,
  });

  return {
    activeTemplateCategory,
    activeTemplateHeading,
    activeTemplateSubcategory,
    activateCategory: templateActions.activateCategory,
    activateQuickFilter: templateActions.activateQuickFilter,
    activateSubcategory: templateActions.activateSubcategory,
    applySharedTemplate: templateActions.applySharedTemplate,
    cancelHoverPreviewHide: templatePreview.cancelHoverPreviewHide,
    expandedTemplateCategories,
    filteredSharedTemplates,
    hoverSharedTemplate: templatePreview.hoverSharedTemplate,
    hoveredTemplate: templatePreview.hoveredTemplate,
    hoveredTemplateAspectRatios: templatePreview.hoveredTemplateAspectRatios,
    hoveredTemplateImages: templatePreview.hoveredTemplateImages,
    hoveredTemplateId: templatePreview.hoveredTemplateId,
    hoveredTemplatePreviewLayout: templatePreview.hoveredTemplatePreviewLayout,
    scheduleHoverPreviewHide: templatePreview.scheduleHoverPreviewHide,
    setTemplateSearch,
    sharedTemplateCategories,
    templateQuickFilter,
    templateSearch,
  };
}

export type SharedTemplateBrowserState = ReturnType<typeof useSharedTemplateBrowser>;
