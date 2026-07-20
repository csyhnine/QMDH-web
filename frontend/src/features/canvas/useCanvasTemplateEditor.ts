import { useCallback, useEffect, useRef, useState } from "react";

import { api, type CanvasGraphJson, type CanvasTemplateRecord } from "../../api";
import { parseCanvasGraph } from "./canvasGraphUtils";
import type { CanvasGraphState } from "./canvasTypes";
import { emptyCanvasGraph } from "./canvasTypes";

type UseCanvasTemplateEditorResult = {
  template: CanvasTemplateRecord | null;
  loading: boolean;
  saving: boolean;
  error: string;
  queueSaveGraph: (graph: CanvasGraphState) => void;
  renameTitle: (title: string) => Promise<void>;
  clearError: () => void;
};

export function useCanvasTemplateEditor(templateId: number | null): UseCanvasTemplateEditorResult {
  const [template, setTemplate] = useState<CanvasTemplateRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(templateId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const saveTimerRef = useRef<number | null>(null);
  const templateIdRef = useRef(templateId);

  useEffect(() => {
    templateIdRef.current = templateId;
  }, [templateId]);

  useEffect(() => {
    if (templateId == null) {
      setTemplate(null);
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const detail = await api.getCanvasTemplate(templateId);
        if (!cancelled) {
          setTemplate(detail);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载画布模板失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [templateId]);

  const queueSaveGraph = useCallback((graph: CanvasGraphState) => {
    const id = templateIdRef.current;
    if (id == null) return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      setSaving(true);
      api
        .updateAdminCanvasTemplate(id, { graph_json: graph as CanvasGraphJson })
        .then((updated) => {
          if (templateIdRef.current === id) {
            setTemplate(updated);
          }
          setError("");
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "保存模板工作流失败");
        })
        .finally(() => setSaving(false));
    }, 700);
  }, []);

  const renameTitle = useCallback(async (title: string) => {
    const id = templateIdRef.current;
    if (id == null || !title.trim()) return;
    const updated = await api.updateAdminCanvasTemplate(id, { title: title.trim() });
    setTemplate(updated);
  }, []);

  return {
    template,
    loading,
    saving,
    error,
    queueSaveGraph,
    renameTitle,
    clearError: () => setError(""),
  };
}

export function graphFromTemplate(template: CanvasTemplateRecord | null): CanvasGraphState {
  if (!template) return emptyCanvasGraph();
  return parseCanvasGraph(template.graph_json);
}
