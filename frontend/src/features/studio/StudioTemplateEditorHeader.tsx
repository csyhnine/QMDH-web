import type { StudioTemplateEditorHeaderProps } from "./studioTemplateEditorTypes";

export default function StudioTemplateEditorHeader({ editingTemplateId }: StudioTemplateEditorHeaderProps) {
  return (
    <div className="template-section-head">
      <strong>{editingTemplateId ? "编辑自定义提示词" : "保存当前提示词"}</strong>
      <span>保存当前提示词、风格和补充说明。视频模板套用时保留当前视频参数和参考图。</span>
    </div>
  );
}
