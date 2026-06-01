import { type ChangeEvent, type DragEvent, type FormEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { api, type PromptTemplateRecord, type Provider } from "../../api";

type ComposerMenuKey = "template" | "provider" | "display" | "count" | null;
type TemplateQuickFilter = "all" | "featured" | "recent";

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
  activeTemplateId: number | null;
  aspectRatioOptions: readonly string[];
  availableProviderCount: number;
  hasActiveProject: boolean;
  composerToolbarRef: RefObject<HTMLDivElement | null>;
  customTemplates: PromptTemplateRecord[];
  editingTemplateId: number | null;
  sharedTemplates: PromptTemplateRecord[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  onApplyTemplate: (template: PromptTemplateRecord) => void;
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

function previewStyleClass(style: string): string {
  switch (style) {
    case "editorial":
      return "template-preview-style-editorial";
    case "minimal":
      return "template-preview-style-minimal";
    case "cinematic":
      return "template-preview-style-cinematic";
    default:
      return "template-preview-style-modern";
  }
}

function templatePrimaryCategory(template: PromptTemplateRecord): string {
  return template.category.trim() || "未分类";
}

function templateSecondaryCategory(template: PromptTemplateRecord): string {
  return template.subcategory.trim() || "其他";
}

export default function StudioComposerDock({
  activeComposerMenu,
  activeTemplateId,
  aspectRatioOptions,
  availableProviderCount,
  hasActiveProject,
  composerToolbarRef,
  customTemplates,
  editingTemplateId,
  sharedTemplates,
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
  const [hoveredTemplateId, setHoveredTemplateId] = useState<number | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateQuickFilter, setTemplateQuickFilter] = useState<TemplateQuickFilter>("all");
  const [activeTemplateCategory, setActiveTemplateCategory] = useState("all");
  const [activeTemplateSubcategory, setActiveTemplateSubcategory] = useState("all");
  const [expandedTemplateCategories, setExpandedTemplateCategories] = useState<Record<string, boolean>>({});
  const impressedTemplateIdsRef = useRef<Set<number>>(new Set());

  const modeLabel = studioForm.creationMode === "edit" ? "图像编辑" : "文生图";
  const referenceHint =
    studioForm.creationMode === "edit"
      ? `图像编辑要求 1-4 张参考图，当前已上传 ${referenceUploads.length} 张。`
      : "文生图模式不会强制发送参考图；切换到图像编辑后会使用已上传的参考图。";

  const sharedTemplateCategories = useMemo(() => {
    const grouped = new Map<string, Set<string>>();
    for (const template of sharedTemplates) {
      const primary = templatePrimaryCategory(template);
      const secondary = templateSecondaryCategory(template);
      if (!grouped.has(primary)) {
        grouped.set(primary, new Set());
      }
      grouped.get(primary)?.add(secondary);
    }
    return Array.from(grouped.entries())
      .map(([category, subcategories]) => ({
        category,
        subcategories: Array.from(subcategories.values()).sort((left, right) => left.localeCompare(right, "zh-CN")),
      }))
      .sort((left, right) => left.category.localeCompare(right.category, "zh-CN"));
  }, [sharedTemplates]);

  useEffect(() => {
    if (sharedTemplateCategories.length === 0) return;
    setExpandedTemplateCategories((current) => {
      const next = { ...current };
      let changed = false;
      for (const item of sharedTemplateCategories) {
        if (!(item.category in next)) {
          next[item.category] = true;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [sharedTemplateCategories]);

  useEffect(() => {
    if (
      activeTemplateCategory !== "all" &&
      !sharedTemplateCategories.some((item) => item.category === activeTemplateCategory)
    ) {
      setActiveTemplateCategory("all");
      setActiveTemplateSubcategory("all");
    }
  }, [activeTemplateCategory, sharedTemplateCategories]);

  useEffect(() => {
    if (activeTemplateCategory === "all" || activeTemplateSubcategory === "all") return;
    const category = sharedTemplateCategories.find((item) => item.category === activeTemplateCategory);
    if (!category?.subcategories.includes(activeTemplateSubcategory)) {
      setActiveTemplateSubcategory("all");
    }
  }, [activeTemplateCategory, activeTemplateSubcategory, sharedTemplateCategories]);

  const filteredSharedTemplates = useMemo(() => {
    const keyword = templateSearch.trim().toLowerCase();
    const searched = sharedTemplates.filter((template) => {
      if (!keyword) return true;
      const haystack = [
        template.label,
        template.title,
        template.deliverable,
        template.notes,
        template.category,
        template.subcategory,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });

    const quickFiltered =
      templateQuickFilter === "featured"
        ? searched.filter((template) => template.is_featured)
        : searched;

    const categoryFiltered = quickFiltered.filter((template) => {
      if (activeTemplateCategory === "all") return true;
      if (templatePrimaryCategory(template) !== activeTemplateCategory) return false;
      if (activeTemplateSubcategory === "all") return true;
      return templateSecondaryCategory(template) === activeTemplateSubcategory;
    });

    return [...categoryFiltered].sort((left, right) => {
      if (templateQuickFilter === "recent") {
        return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
      }
      if (left.is_featured !== right.is_featured) {
        return left.is_featured ? -1 : 1;
      }
      const categoryCompare = templatePrimaryCategory(left).localeCompare(templatePrimaryCategory(right), "zh-CN");
      if (categoryCompare !== 0) return categoryCompare;
      const subcategoryCompare = templateSecondaryCategory(left).localeCompare(templateSecondaryCategory(right), "zh-CN");
      if (subcategoryCompare !== 0) return subcategoryCompare;
      return left.label.localeCompare(right.label, "zh-CN");
    });
  }, [activeTemplateCategory, activeTemplateSubcategory, sharedTemplates, templateQuickFilter, templateSearch]);

  const hoveredTemplate = useMemo(
    () => filteredSharedTemplates.find((template) => template.id === hoveredTemplateId) ?? null,
    [filteredSharedTemplates, hoveredTemplateId]
  );

  const activeTemplateHeading =
    activeTemplateSubcategory !== "all"
      ? activeTemplateSubcategory
      : activeTemplateCategory !== "all"
        ? activeTemplateCategory
        : templateQuickFilter === "featured"
          ? "热度"
          : templateQuickFilter === "recent"
            ? "最新"
            : "全部";

  useEffect(() => {
    for (const template of filteredSharedTemplates.slice(0, 12)) {
      if (impressedTemplateIdsRef.current.has(template.id)) continue;
      impressedTemplateIdsRef.current.add(template.id);
      void api.trackPromptTemplateEvent(template.id, {
        event_type: "impression",
        context: "studio",
      }).catch(() => undefined);
    }
  }, [filteredSharedTemplates]);

  function handleApplySharedTemplate(template: PromptTemplateRecord) {
    void api.trackPromptTemplateEvent(template.id, {
      event_type: "apply",
      context: "studio",
    }).catch(() => undefined);
    onApplyTemplate(template);
  }

  function handleHoverSharedTemplate(templateId: number) {
    setHoveredTemplateId(templateId);
    void api.trackPromptTemplateEvent(templateId, {
      event_type: "hover_preview",
      context: "studio",
    }).catch(() => undefined);
  }

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
          <span>
            {studioForm.aspectRatio} / {selectedResolutionLabel ?? studioForm.resolution}
          </span>
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
                  <span>
                    {index + 1}. {item.fileName}
                  </span>
                  <button type="button" onClick={() => onRemoveReferenceUpload(index)}>
                    移除
                  </button>
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
            {sharedTemplates.find((template) => template.id === activeTemplateId)?.label ??
              customTemplates.find((template) => template.id === activeTemplateId)?.label ??
              "选择模板"}
          </button>
          {activeComposerMenu === "template" ? (
            <div className="composer-menu-panel composer-menu-panel-template">
              <div className="template-section">
                <div className="template-section-head">
                  <strong>模板提示词</strong>
                  <span>后台统一维护，支持搜索、二级分类、热门筛选和原图/最终图对照预览。</span>
                </div>
                {sharedTemplates.length > 0 ? (
                  <div className="template-browser template-browser-categorized">
                    <aside className="template-browser-sidebar">
                      <label className="template-browser-search">
                        <span aria-hidden>⌕</span>
                        <input
                          value={templateSearch}
                          onChange={(event) => setTemplateSearch(event.target.value)}
                          placeholder="搜索"
                        />
                      </label>

                      <div className="template-browser-nav">
                        <button
                          type="button"
                          className={activeTemplateCategory === "all" && templateQuickFilter === "all" ? "template-nav-item is-active" : "template-nav-item"}
                          onClick={() => {
                            setTemplateQuickFilter("all");
                            setActiveTemplateCategory("all");
                            setActiveTemplateSubcategory("all");
                          }}
                        >
                          <span>全部</span>
                        </button>
                        <button
                          type="button"
                          className={templateQuickFilter === "featured" ? "template-nav-item is-active" : "template-nav-item"}
                          onClick={() => {
                            setTemplateQuickFilter("featured");
                            setActiveTemplateCategory("all");
                            setActiveTemplateSubcategory("all");
                          }}
                        >
                          <span>热度</span>
                        </button>
                        <button
                          type="button"
                          className={templateQuickFilter === "recent" ? "template-nav-item is-active" : "template-nav-item"}
                          onClick={() => {
                            setTemplateQuickFilter("recent");
                            setActiveTemplateCategory("all");
                            setActiveTemplateSubcategory("all");
                          }}
                        >
                          <span>最新</span>
                        </button>

                        {sharedTemplateCategories.map((group) => {
                          const expanded = expandedTemplateCategories[group.category] ?? true;
                          const isCategoryActive = activeTemplateCategory === group.category;
                          return (
                            <div key={group.category} className="template-nav-group">
                              <button
                                type="button"
                                className={isCategoryActive && activeTemplateSubcategory === "all" ? "template-nav-item is-active" : "template-nav-item"}
                                onClick={() => {
                                  setTemplateQuickFilter("all");
                                  setActiveTemplateCategory(group.category);
                                  setActiveTemplateSubcategory("all");
                                  setExpandedTemplateCategories((current) => ({
                                    ...current,
                                    [group.category]: !expanded,
                                  }));
                                }}
                              >
                                <span>{group.category}</span>
                                <b>{expanded ? "⌃" : "⌄"}</b>
                              </button>
                              {expanded ? (
                                <div className="template-nav-sublist">
                                  {group.subcategories.map((subcategory) => (
                                    <button
                                      key={`${group.category}-${subcategory}`}
                                      type="button"
                                      className={isCategoryActive && activeTemplateSubcategory === subcategory ? "template-nav-subitem is-active" : "template-nav-subitem"}
                                      onClick={() => {
                                        setTemplateQuickFilter("all");
                                        setActiveTemplateCategory(group.category);
                                        setActiveTemplateSubcategory(subcategory);
                                      }}
                                    >
                                      <span>{subcategory}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </aside>

                    <div className="template-browser-main">
                      <div className="template-browser-main-head">
                        <strong>{activeTemplateHeading}</strong>
                        <span>{filteredSharedTemplates.length} 个模板</span>
                      </div>
                      {filteredSharedTemplates.length > 0 ? (
                        <div className="template-grid">
                          {filteredSharedTemplates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              className={activeTemplateId === template.id ? "template-card is-active" : "template-card"}
                              onClick={() => handleApplySharedTemplate(template)}
                              onMouseEnter={() => handleHoverSharedTemplate(template.id)}
                              onMouseLeave={() => setHoveredTemplateId((current) => (current === template.id ? null : current))}
                              onFocus={() => handleHoverSharedTemplate(template.id)}
                              onBlur={() => setHoveredTemplateId((current) => (current === template.id ? null : current))}
                            >
                              <strong>{template.label}</strong>
                              <span>{template.deliverable || template.title}</span>
                              <small>{`${templatePrimaryCategory(template)} / ${templateSecondaryCategory(template)} · 热度 ${template.popularity_score.toFixed(1)}`}</small>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="template-empty">当前筛选条件下还没有匹配到模板。</div>
                      )}
                    </div>

                    {hoveredTemplate ? (
                      <aside className="template-hover-preview" aria-live="polite">
                        {hoveredTemplate.source_image_path || hoveredTemplate.preview_image_path ? (
                          <div className="template-hover-preview-compare">
                            {hoveredTemplate.source_image_path ? (
                              <figure className="template-hover-preview-figure">
                                <img
                                  className="template-hover-preview-image"
                                  src={hoveredTemplate.source_image_path}
                                  alt={`${hoveredTemplate.label} 原图`}
                                />
                                <figcaption>原图</figcaption>
                              </figure>
                            ) : null}
                            {hoveredTemplate.preview_image_path ? (
                              <figure className="template-hover-preview-figure">
                                <img
                                  className="template-hover-preview-image"
                                  src={hoveredTemplate.preview_image_path}
                                  alt={`${hoveredTemplate.label} 最终图`}
                                />
                                <figcaption>最终图</figcaption>
                              </figure>
                            ) : null}
                          </div>
                        ) : (
                          <div className={`template-hover-preview-fallback ${previewStyleClass(hoveredTemplate.style)}`}>
                            <span>Template Preview</span>
                            <strong>{hoveredTemplate.label}</strong>
                          </div>
                        )}
                        <div className="template-hover-preview-body">
                          <strong>{hoveredTemplate.label}</strong>
                          <span>{hoveredTemplate.title}</span>
                          <small>{`${templatePrimaryCategory(hoveredTemplate)} / ${templateSecondaryCategory(hoveredTemplate)}`}</small>
                          <small>{`近 30 天应用 ${hoveredTemplate.recent_apply_count} · 成功提交 ${hoveredTemplate.recent_submit_success_count}`}</small>
                          <small>{hoveredTemplate.deliverable || hoveredTemplate.notes || "已配置共享模板"}</small>
                        </div>
                      </aside>
                    ) : null}
                  </div>
                ) : (
                  <div className="template-empty">后台还没有配置共享模板，当前页面只显示“我的提示词”。</div>
                )}
              </div>

              <div className="template-section">
                <div className="template-section-head">
                  <strong>我的提示词</strong>
                  <span>保存、编辑你自己的常用提示词。</span>
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
                  <span>会保存当前的提示词、比例、分辨率、风格和补充说明。</span>
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
            {submissionProgress ? <span>{submissionProgress.stage}</span> : null}
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
