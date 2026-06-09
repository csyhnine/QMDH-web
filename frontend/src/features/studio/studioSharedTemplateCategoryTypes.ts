import type { TemplateCategoryGroup } from "./studioTemplateBrowserUtils";
import type { SharedTemplateBrowserState } from "./useSharedTemplateBrowser";

export type StudioSharedTemplateCategoryGroupProps = {
  browser: SharedTemplateBrowserState;
  group: TemplateCategoryGroup;
};

export type StudioSharedTemplateCategoryButtonProps = {
  expanded: boolean;
  label: string;
  selected: boolean;
  onClick: () => void;
};

export type StudioSharedTemplateSubcategoryListProps = {
  activeSubcategory: string;
  category: string;
  subcategories: string[];
  onActivateSubcategory: (category: string, subcategory: string) => void;
};
