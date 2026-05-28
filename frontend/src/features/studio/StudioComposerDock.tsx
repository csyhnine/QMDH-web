import { type ChangeEvent, type DragEvent, type FormEvent, type RefObject } from "react";

import { type PromptTemplateRecord, type Provider } from "../../api";

type ComposerMenuKey = "template" | "provider" | "display" | "count" | null;

type StudioFormValue = {
  creationMode: "generate" | "edit";
  prompt: string;
  requestedProvider: string;
  aspectRatio: string;
  resolution: string;
  imageCount: number;
  style: string;
};

type ReferenceUploadItem = {
  fileName: string;
  previewUrl: string;
  storagePath: string;
};

type TemplateOption = {
  id: string;
  label: string;
  title: string;
  prompt: string;
  style: string;
  aspectRatio: string;
  resolution: string;
  deliverable: string;
  notes: string;
};

type ResolutionOption = {
  id: string;
  label: string;
};

type ProviderGroup = {
  label: string;
  providers: Provider[];
};

type SubmissionStage =
  | "uploading_reference"
  | "submitting"
  | "pending"
  | "running"
  | "completed"
  | "failed";

type SubmissionProgress = {
  stage: SubmissionStage;
  taskTitle: string;
  providerName: string;
  imageCount: number;
  hasReferenceImage: boolean;
};

type StudioComposerDockProps = {
  activeComposerMenu: ComposerMenuKey;
  activeTemplateId: string | number | null;
  aspectRatioOptions: readonly string[];
  availableProviderCount: number;
  hasActiveProject: boolean;
  composerToolbarRef: RefObject<HTMLDivElement | null>;
  customTemplates: PromptTemplateRecord[];
  editingTemplateId: number | null;
  featuredAtmosphereTemplates: TemplateOption[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  onApplyTemplate: (template: TemplateOption | PromptTemplateRecord) => void;
  onAspectRatioSelect: (ratio: string) => void;
  onCancelTemplateEdit: () => void;
  onDeleteCustomTemplate: (templateId: number) => void;
  onEditCustomTemplate: (template: PromptTemplateRecord) => void;
  onImageCountSelect: (count: number) => void;
  onModeChange: (mode: "generate" | "edit") => void;
  onOpenReferencePicker: () => void;
  onPromptChange: (value: string) => void;
  onProviderSelect: (providerName: string) => void;
  onRemoveReferenceUpload: (index: number) => void;
  onReferenceDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onReferenceInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onResolutionSelect: (resolutionId: string) => void;
  onSaveCustomTemplate: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTemplateDraftLabelChange: (value: string) => void;
  onTemplateDraftTitleChange: (value: string) => void;
  onToggleComposerMenu: (menu: Exclude<ComposerMenuKey, null>) => void;
  providerGroups: ProviderGroup[];
  referenceUploads: ReferenceUploadItem[];
  resolutionOptions: ResolutionOption[];
  selectedProviderModelName: string | null;
  selectedResolutionLabel: string | null;
  selectedStyleLabel: string;
  serviceHealthy: boolean;
  studioForm: StudioFormValue;
  submitting: boolean;
  submissionProgress: SubmissionProgress | null;
  templateFeedback: { type: "success" | "error"; message: string } | null;
  templateDraftLabel: string;
  templateDraftTitle: string;
  uploadingReference: boolean;
  workflowName: string;
  workspaceName: string;
};

export default function StudioComposerDock({
  activeComposerMenu,
  activeTemplateId,
  aspectRatioOptions,
  availableProviderCount,
  hasActiveProject,
  composerToolbarRef,
  customTemplates,
  editingTemplateId,
  featuredAtmosphereTemplates,
  fileInputRef,
  onApplyTemplate,
  onAspectRatioSelect,
  onCancelTemplateEdit,
  onDeleteCustomTemplate,
  onEditCustomTemplate,
  onImageCountSelect,
  onModeChange,
  onOpenReferencePicker,
  onPromptChange,
  onProviderSelect,
  onRemoveReferenceUpload,
  onReferenceDrop,
  onReferenceInputChange,
  onResolutionSelect,
  onSaveCustomTemplate,
  onSubmit,
  onTemplateDraftLabelChange,
  onTemplateDraftTitleChange,
  onToggleComposerMenu,
  providerGroups,
  referenceUploads,
  resolutionOptions,
  selectedProviderModelName,
  selectedResolutionLabel,
  selectedStyleLabel,
  serviceHealthy,
  studioForm,
  submitting,
  submissionProgress,
  templateFeedback,
  templateDraftLabel,
  templateDraftTitle,
  uploadingReference,
  workflowName,
  workspaceName,
}: StudioComposerDockProps) {
  const modeLabel = studioForm.creationMode === "edit" ? "图像编辑" : "文生图";
  const referenceHint =
    studioForm.creationMode === "edit"
      ? `图像编辑要求 1-4 张参考图，当前已上传 ${referenceUploads.length} 张。`
      : "文生图模式不会强制发送参考图；切换到图像编辑后会使用已上传的参考图。";
  return (
    <form className="composer-dock" onSubmit={onSubmit}>
      <div className="composer-leading">
        <div>
          <span className="composer-label">当前创作</span>
          <strong>{workspaceName}</strong>
        </div>
        <div className="composer-statusline">
          <span>{modeLabel}</span>
          <span>{workflowName}</span>
          <span>{selectedProviderModelName ?? studioForm.requestedProvider}</span>
          <span>{studioForm.aspectRatio} / {selectedResolutionLabel ?? studioForm.resolution}</span>
          <span>{studioForm.imageCount} 张</span>
        </div>
      </div>
      <div className="composer-body">
        <div className="reference-column">
          <div className="composer-mode-switch" role="tablist" aria-label="创作模式">
            <button
              type="button"
              className={studioForm.creationMode === "generate" ? "composer-mode-button is-active" : "composer-mode-button"}
              onClick={() => onModeChange("generate")}
            >
              文生图
            </button>
            <button
              type="button"
              className={studioForm.creationMode === "edit" ? "composer-mode-button is-active" : "composer-mode-button"}
              onClick={() => onModeChange("edit")}
            >
              图像编辑
            </button>
          </div>
          <button
            type="button"
            className={referenceUploads.length > 0 ? "reference-dropzone has-preview" : "reference-dropzone"}
            onClick={onOpenReferencePicker}
            onDrop={onReferenceDrop}
            onDragOver={(event) => event.preventDefault()}
          >
            {referenceUploads.length > 0 ? (
              <div className="reference-preview-grid">
                {referenceUploads.slice(0, 4).map((item) => (
                  <img key={item.storagePath} src={item.previewUrl} alt={item.fileName} className="reference-preview" />
                ))}
              </div>
            ) : (
              <span className="reference-dropzone-plus">+</span>
            )}
          </button>
          {referenceUploads.length > 0 ? (
            <div className="reference-upload-list">
              {referenceUploads.map((item, index) => (
                <div key={item.storagePath} className="reference-upload-chip">
                  <span>{index + 1}. {item.fileName}</span>
                  <button type="button" onClick={() => onRemoveReferenceUpload(index)}>移除</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <label className="composer-textarea">
          <textarea
            rows={4}
            value={studioForm.prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="请输入要生成或编辑的画面描述。"
          />
          <span className="composer-textarea-hint">{referenceHint}</span>
        </label>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={onReferenceInputChange} />

      <div className="composer-toolbar" ref={composerToolbarRef}>
        <div className="composer-menu">
          <button
            type="button"
            className={activeComposerMenu === "template" ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
            onClick={() => onToggleComposerMenu("template")}
          >
            {featuredAtmosphereTemplates.find((template) => template.id === activeTemplateId)?.label ??
              customTemplates.find((template) => template.id === activeTemplateId)?.label ??
              "选择模板"}
          </button>
          {activeComposerMenu === "template" ? (
            <div className="composer-menu-panel composer-menu-panel-template">
              <div className="template-section">
                <div className="template-section-head">
                  <strong>热门提示词</strong>
                  <span>快速套用常用创作方向</span>
                </div>
                <div className="template-grid">
                  {featuredAtmosphereTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={activeTemplateId === template.id ? "template-card is-active" : "template-card"}
                      onClick={() => onApplyTemplate(template)}
                    >
                      <strong>{template.label}</strong>
                      <span>{template.deliverable}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="template-section">
                <div className="template-section-head">
                  <strong>我的提示词</strong>
                  <span>保存、编辑你自己的常用提示词</span>
                </div>
                {customTemplates.length > 0 ? (
                  <div className="template-list">
                    {customTemplates.map((template) => (
                      <div key={template.id} className="template-list-item">
                        <button type="button" className="template-card template-card-main" onClick={() => onApplyTemplate(template)}>
                          <strong>{template.label}</strong>
                          <span>{template.title}</span>
                        </button>
                        <div className="template-card-actions">
                          <button type="button" className="template-action-button" onClick={() => onEditCustomTemplate(template)}>
                            编辑
                          </button>
                          <button type="button" className="template-action-button" onClick={() => onDeleteCustomTemplate(template.id)}>
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="template-empty">还没有自定义提示词，可以把当前创作内容保存下来。</div>
                )}
              </div>

              <div className="template-editor">
                <div className="template-section-head">
                  <strong>{editingTemplateId ? "编辑自定义提示词" : "保存当前提示词"}</strong>
                  <span>会保存当前的提示词、比例、分辨率、风格和补充说明</span>
                </div>
                {templateFeedback ? (
                  <p className={templateFeedback.type === "success" ? "template-feedback success" : "template-feedback error"}>
                    {templateFeedback.message}
                  </p>
                ) : null}
                <div className="template-editor-row">
                  <label className="composer-menu-field">
                    <span>名称</span>
                    <input
                      value={templateDraftLabel}
                      onChange={(event) => onTemplateDraftLabelChange(event.target.value)}
                      placeholder="例如：建筑氛围增强方案"
                    />
                  </label>
                  <label className="composer-menu-field">
                    <span>标题</span>
                    <input
                      value={templateDraftTitle}
                      onChange={(event) => onTemplateDraftTitleChange(event.target.value)}
                      placeholder="例如：建筑效果图氛围增强模板"
                    />
                  </label>
                </div>
                <div className="template-editor-actions">
                  <button type="button" className="ghost-button" onClick={onSaveCustomTemplate}>
                    {editingTemplateId ? "更新提示词" : "保存当前提示词"}
                  </button>
                  {editingTemplateId ? (
                    <button type="button" className="ghost-button" onClick={onCancelTemplateEdit}>
                      取消编辑
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="composer-menu">
          <button
            type="button"
            className={activeComposerMenu === "provider" ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
            onClick={() => onToggleComposerMenu("provider")}
          >
            {selectedProviderModelName ?? "选择模型"}
          </button>
          {activeComposerMenu === "provider" ? (
            <div className="composer-menu-panel composer-menu-panel-list composer-menu-panel-provider">
              {providerGroups.map((group) => (
                <div key={group.label} className="provider-choice-group">
                  <span className="provider-choice-group-title">{group.label}</span>
                  {group.providers.map((provider) => (
                    <button
                      key={provider.provider_name}
                      type="button"
                      className={studioForm.requestedProvider === provider.provider_name ? "composer-choice-item is-active" : "composer-choice-item"}
                      onClick={() => onProviderSelect(provider.provider_name)}
                    >
                      <strong>{provider.model_name}</strong>
                      <span>{provider.provider_name}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="composer-menu">
          <button
            type="button"
            className={activeComposerMenu === "display" ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
            onClick={() => onToggleComposerMenu("display")}
          >
            {studioForm.aspectRatio} / {selectedResolutionLabel ?? studioForm.resolution}
          </button>
          {activeComposerMenu === "display" ? (
            <div className="composer-menu-panel composer-menu-panel-display">
              <div className="composer-menu-group">
                <span className="composer-menu-title">比例</span>
                <div className="composer-chip-grid">
                  {aspectRatioOptions.map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      className={studioForm.aspectRatio === ratio ? "composer-chip-button is-active" : "composer-chip-button"}
                      onClick={() => onAspectRatioSelect(ratio)}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div className="composer-menu-group">
                <span className="composer-menu-title">分辨率</span>
                <div className="composer-chip-grid composer-chip-grid-two">
                  {resolutionOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={studioForm.resolution === option.id ? "composer-chip-button is-active" : "composer-chip-button"}
                      onClick={() => onResolutionSelect(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="composer-menu">
          <button
            type="button"
            className={activeComposerMenu === "count" ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
            onClick={() => onToggleComposerMenu("count")}
          >
            {studioForm.imageCount} 张
          </button>
          {activeComposerMenu === "count" ? (
            <div className="composer-menu-panel composer-menu-panel-list">
              {[1, 2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={studioForm.imageCount === count ? "composer-choice-item is-active" : "composer-choice-item"}
                  onClick={() => onImageCountSelect(count)}
                >
                  <strong>{count} 张</strong>
                  <span>{count === 1 ? "默认张数" : `一次生成 ${count} 张`}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="composer-toolbar-actions">
          <div className="composer-quickmeta">
            <span>{selectedStyleLabel}</span>
            <span>{serviceHealthy ? "服务在线" : "服务异常"}</span>
          </div>

          <button
            type="submit"
            className="submit-button"
            disabled={submitting || uploadingReference || availableProviderCount === 0 || !hasActiveProject}
          >
            {submitting ? "正在创建..." : !hasActiveProject ? "请先新建项目" : "开始生成"}
          </button>
        </div>
      </div>
    </form>
  );
}
