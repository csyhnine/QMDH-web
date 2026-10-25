import type { StudioTemplateEditorFeedbackProps } from "./studioTemplateEditorTypes";

export default function StudioTemplateEditorFeedback({ templateFeedback }: StudioTemplateEditorFeedbackProps) {
  if (!templateFeedback) {
    return null;
  }

  return (
    <p role="status" className={templateFeedback.type === "success" ? "template-feedback success" : templateFeedback.type === "error" ? "template-feedback error" : "template-feedback"}>
      {templateFeedback.message}
    </p>
  );
}
