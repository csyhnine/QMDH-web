/** Feature toggles for gradual rollout. Defaults keep integrations off in production UI. */
export const isStudioAgentEnabled = import.meta.env.VITE_STUDIO_AGENT_ENABLED === "true";

/** Dev-only override: force Chat agent UI on without Admin toggle. */
export const isChatAgentUiEnabledByEnv = import.meta.env.VITE_CHAT_AGENT_UI_ENABLED === "true";

/** Resolve whether Chat「设计助手」UI should render (Admin toggle or dev env). */
export function resolveChatAgentUiEnabled(platformEnabled: boolean): boolean {
  return isChatAgentUiEnabledByEnv || platformEnabled;
}

/** Default agent mode when UI is visible. */
export function chatAgentModeDefaultFor(uiEnabled: boolean): boolean {
  return uiEnabled && import.meta.env.VITE_CHAT_AGENT_MODE_DEFAULT !== "false";
}

/**
 * Designer infinite canvas（无限画布）。
 * 默认开启；若需临时下线可设 `VITE_STUDIO_CANVAS_ENABLED=false`。
 */
export const isStudioCanvasEnabled = import.meta.env.VITE_STUDIO_CANVAS_ENABLED !== "false";
