/** Feature toggles for gradual rollout. Defaults keep integrations off in production UI. */
export const isStudioAgentEnabled = import.meta.env.VITE_STUDIO_AGENT_ENABLED === "true";

/**
 * Show Chat「设计助手」开关 / 能力抽屉。
 * 默认开启；临时下线可设 `VITE_CHAT_AGENT_UI_ENABLED=false`。
 */
export const isChatAgentUiEnabled = import.meta.env.VITE_CHAT_AGENT_UI_ENABLED !== "false";

/** Default Chat 助手模式（仅 UI 开启时生效）。默认开启。 */
export const chatAgentModeDefault =
  isChatAgentUiEnabled && import.meta.env.VITE_CHAT_AGENT_MODE_DEFAULT !== "false";

/**
 * Designer infinite canvas（无限画布）。
 * 默认开启；若需临时下线可设 `VITE_STUDIO_CANVAS_ENABLED=false`。
 */
export const isStudioCanvasEnabled = import.meta.env.VITE_STUDIO_CANVAS_ENABLED !== "false";
