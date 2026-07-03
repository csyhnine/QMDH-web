/** Feature toggles for gradual rollout. */

/** Default Chat 助手模式；可通过 `VITE_CHAT_AGENT_MODE_DEFAULT=false` 关闭。 */
export const chatAgentModeDefault =
  import.meta.env.VITE_CHAT_AGENT_MODE_DEFAULT !== "false";
