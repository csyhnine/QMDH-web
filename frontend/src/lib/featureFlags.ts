/** Feature toggles for gradual rollout. Defaults keep integrations off in production UI. */
export const isStudioAgentEnabled = import.meta.env.VITE_STUDIO_AGENT_ENABLED === "true";

/** Designer infinite canvas. Enable locally with VITE_STUDIO_CANVAS_ENABLED=true. */
export const isStudioCanvasEnabled = import.meta.env.VITE_STUDIO_CANVAS_ENABLED === "true";
