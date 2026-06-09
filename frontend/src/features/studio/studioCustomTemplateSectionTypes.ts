import type { PromptTemplateRecord } from "../../api";

export type StudioCustomTemplateSectionProps = {
  customTemplates: PromptTemplateRecord[];
  onApplyTemplate: (template: PromptTemplateRecord) => void;
  onDeleteCustomTemplate: (templateId: number) => void;
  onEditCustomTemplate: (template: PromptTemplateRecord) => void;
};

export type StudioCustomTemplateListItemProps = Omit<StudioCustomTemplateSectionProps, "customTemplates"> & {
  template: PromptTemplateRecord;
};
