import type { TemplateFeedback } from "./studioTypes";

export type StudioTemplateEditorProps = {
  editingTemplateId: number | null;
  templateDraftLabel: string;
  templateDraftTitle: string;
  templateFeedback: TemplateFeedback | null;
  onCancelTemplateEdit: () => void;
  onSaveCustomTemplate: () => void;
  onTemplateDraftLabelChange: (value: string) => void;
  onTemplateDraftTitleChange: (value: string) => void;
};

export type StudioTemplateEditorHeaderProps = Pick<StudioTemplateEditorProps, "editingTemplateId">;
export type StudioTemplateEditorFeedbackProps = Pick<StudioTemplateEditorProps, "templateFeedback">;
export type StudioTemplateEditorFieldsProps = Pick<
  StudioTemplateEditorProps,
  "templateDraftLabel" | "templateDraftTitle" | "onTemplateDraftLabelChange" | "onTemplateDraftTitleChange"
>;
export type StudioTemplateEditorActionsProps = Pick<
  StudioTemplateEditorProps,
  "editingTemplateId" | "onCancelTemplateEdit" | "onSaveCustomTemplate"
>;
