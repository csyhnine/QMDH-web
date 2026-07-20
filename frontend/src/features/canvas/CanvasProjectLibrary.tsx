import { useState } from "react";

import type { CanvasProjectSummary, CanvasTemplateSummary } from "../../api";

type LibraryTab = "projects" | "templates";

type CanvasProjectLibraryProps = {
  projects: CanvasProjectSummary[];
  activeProjectId: number | null;
  loading?: boolean;
  saving?: boolean;
  disabled?: boolean;
  onSelect: (projectId: number) => void;
  onCreate: () => void;
  onRename: (projectId: number, title: string) => void;
  onDelete: (projectId: number) => void;
  templates?: CanvasTemplateSummary[];
  templatesLoading?: boolean;
  applyingTemplateId?: number | null;
  onRefreshTemplates?: () => void;
  onUseTemplate?: (templateId: number) => void;
};

export default function CanvasProjectLibrary({
  projects,
  activeProjectId,
  loading = false,
  saving = false,
  disabled = false,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  templates = [],
  templatesLoading = false,
  applyingTemplateId = null,
  onRefreshTemplates,
  onUseTemplate,
}: CanvasProjectLibraryProps) {
  const [tab, setTab] = useState<LibraryTab>("projects");

  function switchTab(next: LibraryTab) {
    setTab(next);
    if (next === "templates") {
      onRefreshTemplates?.();
    }
  }

  return (
    <aside className="qmdh-canvas-project-library">
      <header className="qmdh-canvas-project-library-head">
        <div>
          <strong>{tab === "projects" ? "项目库" : "模板库"}</strong>
          <span>{tab === "projects" ? "管理本账号下的画布工作流" : "选用模板复制为私有项目"}</span>
        </div>
        {tab === "projects" ? (
          <button type="button" disabled={disabled || loading} onClick={onCreate}>
            新建
          </button>
        ) : (
          <button type="button" disabled={templatesLoading} onClick={() => onRefreshTemplates?.()}>
            刷新
          </button>
        )}
      </header>

      <div className="qmdh-canvas-library-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "projects"}
          className={tab === "projects" ? "is-active" : undefined}
          onClick={() => switchTab("projects")}
        >
          项目
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "templates"}
          className={tab === "templates" ? "is-active" : undefined}
          onClick={() => switchTab("templates")}
        >
          模板
        </button>
      </div>

      {tab === "projects" ? (
        <>
          <p className="qmdh-canvas-project-library-status">
            {loading ? "加载中…" : saving ? "保存中…" : `${projects.length} 个工作流`}
          </p>

          <div className="qmdh-canvas-project-list">
            {projects.map((project) => {
              const active = project.id === activeProjectId;
              return (
                <article
                  key={project.id}
                  className={`qmdh-canvas-project-card${active ? " is-active" : ""}`}
                >
                  <button
                    type="button"
                    className="qmdh-canvas-project-card-main"
                    disabled={disabled}
                    onClick={() => onSelect(project.id)}
                  >
                    <strong>{project.title}</strong>
                    <span>更新于 {new Date(project.updated_at).toLocaleString()}</span>
                  </button>
                  <div className="qmdh-canvas-project-card-actions">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        const next = window.prompt("重命名工作流", project.title);
                        if (next && next.trim() && next.trim() !== project.title) {
                          onRename(project.id, next.trim());
                        }
                      }}
                    >
                      重命名
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={disabled}
                      onClick={() => {
                        if (window.confirm(`删除工作流「${project.title}」？`)) {
                          onDelete(project.id);
                        }
                      }}
                    >
                      删除
                    </button>
                  </div>
                </article>
              );
            })}
            {!loading && projects.length === 0 ? (
              <p className="qmdh-canvas-template-hint">还没有工作流，点击「新建」开始。</p>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="qmdh-canvas-project-library-status">
            {templatesLoading ? "加载中…" : `${templates.length} 个模板`}
          </p>

          <div className="qmdh-canvas-project-list">
            {templates.map((template) => (
              <article key={template.id} className="qmdh-canvas-project-card qmdh-canvas-template-card">
                {template.preview_image_path ? (
                  <img
                    className="qmdh-canvas-template-preview"
                    src={template.preview_image_path}
                    alt=""
                  />
                ) : null}
                <div className="qmdh-canvas-project-card-main">
                  <strong>
                    {template.is_featured ? "★ " : ""}
                    {template.title}
                  </strong>
                  <span>{template.category.trim() || "未分类"}</span>
                  {template.description.trim() ? <span>{template.description}</span> : null}
                </div>
                <div className="qmdh-canvas-project-card-actions">
                  <button
                    type="button"
                    disabled={disabled || applyingTemplateId === template.id}
                    onClick={() => onUseTemplate?.(template.id)}
                  >
                    {applyingTemplateId === template.id ? "创建中…" : "使用"}
                  </button>
                </div>
              </article>
            ))}
            {!templatesLoading && templates.length === 0 ? (
              <p className="qmdh-canvas-template-hint">暂无可用模板，请联系管理员在后台发布。</p>
            ) : null}
          </div>
        </>
      )}
    </aside>
  );
}
