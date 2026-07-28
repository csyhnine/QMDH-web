import { useEffect, useMemo, useRef, useState } from "react";

import {
  api,
  type CanvasGraphJson,
  type CanvasTemplateSummary,
} from "../../api";

type PublishMode = "create" | "update";

export type PublishCanvasTemplateDialogProps = {
  open: boolean;
  defaultTitle: string;
  graphJson: CanvasGraphJson;
  onClose: () => void;
  onCreated: (template: { id: number; title: string }) => void;
  onUpdated: (template: { id: number; title: string }) => void;
  onError: (message: string) => void;
};

export default function PublishCanvasTemplateDialog({
  open,
  defaultTitle,
  graphJson,
  onClose,
  onCreated,
  onUpdated,
  onError,
}: PublishCanvasTemplateDialogProps) {
  const [mode, setMode] = useState<PublishMode>("create");
  const [title, setTitle] = useState(defaultTitle);
  const [category, setCategory] = useState("");
  const [templates, setTemplates] = useState<CanvasTemplateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const selected = useMemo(
    () => templates.find((item) => item.id === selectedId) ?? null,
    [selectedId, templates]
  );

  useEffect(() => {
    if (!open) return;
    setMode("create");
    setTitle(defaultTitle);
    setCategory("");
    setSelectedId(null);
    setSubmitting(false);
  }, [open, defaultTitle]);

  useEffect(() => {
    if (!open || mode !== "update") return;
    let cancelled = false;
    setLoadingList(true);
    api
      .adminCanvasTemplates()
      .then((rows) => {
        if (cancelled) return;
        setTemplates(rows);
        setSelectedId((current) => {
          if (current && rows.some((row) => row.id === current)) return current;
          return rows[0]?.id ?? null;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        onErrorRef.current(err instanceof Error ? err.message : "加载模板列表失败");
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, open]);

  useEffect(() => {
    if (!selected || mode !== "update") return;
    setTitle(selected.title);
    setCategory(selected.category || "");
  }, [mode, selected]);

  if (!open) return null;

  function switchMode(next: PublishMode) {
    setMode(next);
    if (next === "create") {
      setTitle(defaultTitle);
      setCategory("");
      setSelectedId(null);
    }
  }

  async function handleSubmit() {
    const nextTitle = title.trim() || defaultTitle;
    if (!nextTitle) {
      onError("请填写模板标题");
      return;
    }
    if (mode === "update" && !selectedId) {
      onError("请先选择要覆盖的模板");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        const created = await api.createAdminCanvasTemplate({
          title: nextTitle,
          category: category.trim(),
          description: "",
          is_featured: false,
          graph_json: graphJson,
          preview_image_path: "",
        });
        onCreated({ id: created.id, title: created.title || nextTitle });
      } else {
        const updated = await api.updateAdminCanvasTemplate(selectedId!, {
          graph_json: graphJson,
          title: nextTitle,
          category: category.trim(),
        });
        onUpdated({ id: updated.id, title: updated.title || nextTitle });
      }
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : mode === "create" ? "发布模板失败" : "覆盖模板失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="media-lightbox qmdh-publish-template-lightbox"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="media-lightbox-surface qmdh-publish-template-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qmdh-publish-template-title"
      >
        <header className="media-lightbox-head qmdh-publish-template-head">
          <h2 id="qmdh-publish-template-title" className="media-lightbox-title">
            发布为模板
          </h2>
          <button
            type="button"
            className="media-lightbox-close"
            disabled={submitting}
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="media-lightbox-body qmdh-publish-template-body">
          <div className="qmdh-canvas-library-tabs qmdh-publish-template-tabs">
            <button
              type="button"
              className={mode === "create" ? "is-active" : ""}
              disabled={submitting}
              onClick={() => switchMode("create")}
            >
              新建
            </button>
            <button
              type="button"
              className={mode === "update" ? "is-active" : ""}
              disabled={submitting}
              onClick={() => switchMode("update")}
            >
              更新已有
            </button>
          </div>

          {mode === "update" ? (
            <div className="qmdh-publish-template-picker">
              {loadingList ? (
                <p className="qmdh-publish-template-hint">加载模板列表…</p>
              ) : templates.length === 0 ? (
                <p className="qmdh-publish-template-hint">暂无已有模板，请改用「新建」。</p>
              ) : (
                <div className="qmdh-publish-template-list">
                  {templates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={
                        selectedId === item.id
                          ? "qmdh-publish-template-item is-active"
                          : "qmdh-publish-template-item"
                      }
                      disabled={submitting}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <strong>{item.title}</strong>
                      <span>{item.category?.trim() || "未分类"}</span>
                    </button>
                  ))}
                </div>
              )}
              {selected ? (
                <p className="qmdh-publish-template-warn">
                  将用当前画布完全覆盖「{selected.title}」的工作流。
                </p>
              ) : null}
            </div>
          ) : null}

          <label className="qmdh-publish-template-field">
            <span>标题</span>
            <input
              value={title}
              disabled={submitting}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="模板标题"
            />
          </label>
          <label className="qmdh-publish-template-field">
            <span>分类</span>
            <input
              value={category}
              disabled={submitting}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="可留空"
            />
          </label>
        </div>

        <footer className="media-lightbox-foot qmdh-publish-template-foot">
          <button type="button" className="ghost-button" disabled={submitting} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="admin-primary-button"
            disabled={
              submitting ||
              (mode === "update" && (loadingList || !selectedId || templates.length === 0))
            }
            onClick={() => void handleSubmit()}
          >
            {submitting
              ? mode === "create"
                ? "发布中…"
                : "覆盖中…"
              : mode === "create"
                ? "发布"
                : "覆盖更新"}
          </button>
        </footer>
      </div>
    </div>
  );
}
