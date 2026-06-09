import type { PromptTemplateRecord } from "../../api";
import type { ComposerMenuKey, TemplateFeedback } from "./studioTypes";

export type StudioTemplateMenuProps = {
  activeComposerMenu: ComposerMenuKey;
  activeTemplateId: number | null;
  customTemplates: PromptTemplateRecord[];
  editingTemplateId: number | null;
  sharedTemplates: PromptTemplateRecord[];
  templateDraftLabel: string;
  templateDraftTitle: string;
  templateFeedback: TemplateFeedback | null;
  onApplyTemplate: (template: PromptTemplateRecord) => void;
  onCancelTemplateEdit: () => void;
  onDeleteCustomTemplate: (templateId: number) => void;
  onEditCustomTemplate: (template: PromptTemplateRecord) => void;
  onSaveCustomTemplate: () => void;
  onTemplateDraftLabelChange: (value: string) => void;
  onTemplateDraftTitleChange: (value: string) => void;
  onToggleComposerMenu: (menu: Exclude<ComposerMenuKey, null>) => void;
};

export type StudioTemplateMenuTriggerProps = Pick<
  StudioTemplateMenuProps,
  "activeComposerMenu" | "activeTemplateId" | "customTemplates" | "sharedTemplates" | "onToggleComposerMenu"
>;

export type StudioTemplateMenuPanelProps = Omit<
  StudioTemplateMenuProps,
  "activeComposerMenu" | "onToggleComposerMenu"
>;
