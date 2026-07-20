/** Feature toggles for gradual rollout. Defaults keep integrations off in production UI. */
export const isStudioAgentEnabled = import.meta.env.VITE_STUDIO_AGENT_ENABLED === "true";

/** Default Chat 助手模式；可通过 `VITE_CHAT_AGENT_MODE_DEFAULT=false` 关闭。 */
export const chatAgentModeDefault =
  import.meta.env.VITE_CHAT_AGENT_MODE_DEFAULT !== "false";

/** Designer infinite canvas. Enable locally with VITE_STUDIO_CANVAS_ENABLED=true. */
export const isStudioCanvasEnabled = import.meta.env.VITE_STUDIO_CANVAS_ENABLED === "true";
