import { useEffect, useRef } from "react";

import { api, type PromptTemplateRecord } from "../../api";

type SharedTemplateEventType = "impression" | "apply" | "hover_preview";

export function trackSharedTemplateEvent(templateId: number, eventType: SharedTemplateEventType) {
  void api.trackPromptTemplateEvent(templateId, {
    event_type: eventType,
    context: "studio",
  }).catch(() => undefined);
}

export function useSharedTemplateImpressions(templates: PromptTemplateRecord[]) {
  const impressedTemplateIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    for (const template of templates.slice(0, 12)) {
      if (impressedTemplateIdsRef.current.has(template.id)) continue;
      impressedTemplateIdsRef.current.add(template.id);
      trackSharedTemplateEvent(template.id, "impression");
    }
  }, [templates]);
}
