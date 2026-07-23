import { useState } from "react";
import { createPortal } from "react-dom";

import { api } from "../../api";
import AnnotateBoard from "../canvas/AnnotateBoard";
import { exportAnnotatedDataUrl } from "../canvas/annotateDraw";
import {
  DEFAULT_ANNOTATION_OPACITY,
  type AnnotationStroke,
  type AnnotationTool,
} from "../canvas/annotateTypes";
import type { ReferenceUploadItem } from "./studioTypes";

type StudioReferenceAnnotateLightboxProps = {
  item: ReferenceUploadItem;
  index: number;
  onClose: () => void;
  onReplace: (index: number, next: ReferenceUploadItem) => void;
};

export default function StudioReferenceAnnotateLightbox({
  item,
  index,
  onClose,
  onReplace,
}: StudioReferenceAnnotateLightboxProps) {
  const [strokes, setStrokes] = useState<AnnotationStroke[]>([]);
  const [tool, setTool] = useState<AnnotationTool>("region");
  const [color, setColor] = useState("#ef4444");
  const [width, setWidth] = useState(3);
  const [opacity, setOpacity] = useState(DEFAULT_ANNOTATION_OPACITY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (strokes.length === 0) {
      setError("请先在图上绘制选区或标注。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const exported = await exportAnnotatedDataUrl(item.previewUrl || item.storagePath, strokes);
      const uploaded = await api.uploadReferenceImage({
        file_name: exported.fileName,
        data_url: exported.dataUrl,
      });
      onReplace(index, {
        fileName: uploaded.file_name || exported.fileName,
        previewUrl: uploaded.storage_path,
        storagePath: uploaded.storage_path,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存标注失败");
    } finally {
      setSaving(false);
    }
  }

  const dialog = (
    <div
      className="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="参考图标注"
      onClick={onClose}
    >
      <div
        className="media-lightbox-surface studio-reference-annotate-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="media-lightbox-head">
          <span className="media-lightbox-title">标注参考图 · {item.fileName}</span>
          <button type="button" className="media-lightbox-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="media-lightbox-body is-annotate">
          <AnnotateBoard
            className="is-studio"
            baseUrl={item.previewUrl || item.storagePath}
            strokes={strokes}
            tool={tool}
            color={color}
            width={width}
            opacity={opacity}
            maxWidth={Math.min(1280, typeof window !== "undefined" ? window.innerWidth - 96 : 1280)}
            maxHeight={Math.min(760, typeof window !== "undefined" ? Math.round(window.innerHeight * 0.72) : 760)}
            disabled={saving}
            onChangeStrokes={setStrokes}
            onToolChange={setTool}
            onColorChange={setColor}
            onWidthChange={setWidth}
            onOpacityChange={setOpacity}
          />
          {error ? <p className="qmdh-canvas-node-error">{error}</p> : null}
        </div>
        <footer className="media-lightbox-foot">
          <button type="button" className="ghost-button" disabled={saving} onClick={onClose}>
            取消
          </button>
          <button type="button" className="submit-button" disabled={saving} onClick={() => void handleConfirm()}>
            {saving ? "保存中…" : "应用到参考图"}
          </button>
        </footer>
      </div>
    </div>
  );

  // Composer dock uses backdrop-filter, which traps position:fixed — portal to body.
  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}
