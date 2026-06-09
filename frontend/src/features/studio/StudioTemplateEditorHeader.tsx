import type { StudioTemplateEditorHeaderProps } from "./studioTemplateEditorTypes";

export default function StudioTemplateEditorHeader({ editingTemplateId }: StudioTemplateEditorHeaderProps) {
  return (
    <div className="template-section-head">
      <strong>{editingTemplateId ? "编辑自定义提示词" : "保存当前提示词"}</strong>
      <span>会保存当前的提示词、比例、分辨率、风格和补充说明。</span>
    </div>
  );
}
