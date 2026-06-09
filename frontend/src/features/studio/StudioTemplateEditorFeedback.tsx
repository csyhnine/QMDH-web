import type { StudioTemplateEditorFeedbackProps } from "./studioTemplateEditorTypes";

export default function StudioTemplateEditorFeedback({ templateFeedback }: StudioTemplateEditorFeedbackProps) {
  if (!templateFeedback) {
    return null;
  }

  return (
    <p className={templateFeedback.type === "success" ? "template-feedback success" : "template-feedback error"}>
      {templateFeedback.message}
    </p>
  );
}
