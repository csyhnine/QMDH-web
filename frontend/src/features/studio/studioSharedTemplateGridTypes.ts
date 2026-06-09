import type { PromptTemplateRecord } from "../../api";
import type { SharedTemplateBrowserState } from "./useSharedTemplateBrowser";

export type StudioSharedTemplateGridProps = {
  activeTemplateId: number | null;
  browser: SharedTemplateBrowserState;
};

export type StudioSharedTemplateGridCardProps = {
  active: boolean;
  browser: SharedTemplateBrowserState;
  template: PromptTemplateRecord;
};
