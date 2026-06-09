import { useEffect, useMemo, useRef, useState } from "react";

import type { PromptTemplateRecord } from "../../api";
import {
  inferTemplatePreviewLayout,
  templatePreviewImages,
} from "./studioTemplateUtils";
import { trackSharedTemplateEvent } from "./useSharedTemplateTracking";

type UseSharedTemplatePreviewOptions = {
  templates: PromptTemplateRecord[];
};

export function useSharedTemplatePreview({ templates }: UseSharedTemplatePreviewOptions) {
  const [hoveredTemplateId, setHoveredTemplateId] = useState<number | null>(null);
  const [hoveredTemplateAspectRatios, setHoveredTemplateAspectRatios] = useState<Record<string, number>>({});
  const hoverPreviewHideTimeoutRef = useRef<number | null>(null);

  const hoveredTemplate = useMemo(
    () => templates.find((template) => template.id === hoveredTemplateId) ?? null,
    [templates, hoveredTemplateId]
  );
  const hoveredTemplateImages = useMemo(
    () => (hoveredTemplate ? templatePreviewImages(hoveredTemplate) : []),
    [hoveredTemplate]
  );
  const hoveredTemplatePreviewLayout = useMemo(
    () =>
      inferTemplatePreviewLayout(
        hoveredTemplateImages.length,
        hoveredTemplateImages
          .map((image) => hoveredTemplateAspectRatios[image.key])
          .filter((ratio): ratio is number => Number.isFinite(ratio)),
        hoveredTemplate?.aspect_ratio
      ),
    [hoveredTemplate?.aspect_ratio, hoveredTemplateAspectRatios, hoveredTemplateImages]
  );

  useEffect(() => {
    return () => {
      if (hoverPreviewHideTimeoutRef.current !== null) {
        window.clearTimeout(hoverPreviewHideTimeoutRef.current);
        hoverPreviewHideTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (hoveredTemplateImages.length === 0) {
      setHoveredTemplateAspectRatios({});
      return undefined;
    }

    Promise.all(
      hoveredTemplateImages.map(
        (image) =>
          new Promise<{ key: string; aspectRatio: number | null }>((resolve) => {
            const probe = new Image();
            probe.onload = () => {
              if (!probe.naturalWidth || !probe.naturalHeight) {
                resolve({ key: image.key, aspectRatio: null });
                return;
              }
              resolve({ key: image.key, aspectRatio: probe.naturalWidth / probe.naturalHeight });
            };
            probe.onerror = () => resolve({ key: image.key, aspectRatio: null });
            probe.src = image.src;
          })
      )
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, number> = {};
      for (const item of results) {
        if (item.aspectRatio !== null && Number.isFinite(item.aspectRatio)) {
          next[item.key] = item.aspectRatio;
        }
      }
      setHoveredTemplateAspectRatios(next);
    });

    return () => {
      cancelled = true;
    };
  }, [hoveredTemplateImages]);

  function cancelHoverPreviewHide() {
    if (hoverPreviewHideTimeoutRef.current !== null) {
      window.clearTimeout(hoverPreviewHideTimeoutRef.current);
      hoverPreviewHideTimeoutRef.current = null;
    }
  }

  function scheduleHoverPreviewHide() {
    cancelHoverPreviewHide();
    hoverPreviewHideTimeoutRef.current = window.setTimeout(() => {
      setHoveredTemplateId(null);
      hoverPreviewHideTimeoutRef.current = null;
    }, 120);
  }

  function hoverSharedTemplate(templateId: number) {
    cancelHoverPreviewHide();
    setHoveredTemplateId(templateId);
    trackSharedTemplateEvent(templateId, "hover_preview");
  }

  return {
    cancelHoverPreviewHide,
    hoverSharedTemplate,
    hoveredTemplate,
    hoveredTemplateAspectRatios,
    hoveredTemplateId,
    hoveredTemplateImages,
    hoveredTemplatePreviewLayout,
    scheduleHoverPreviewHide,
  };
}
