import type { ChatToolCall } from "../../lib/chat/qmdhSseParser";

export type ChatAgentToolMeta = {
  key: string;
  label: string;
  description: string;
};

export const CHAT_TOOL_LABELS: Record<string, string> = {
  search_inspiration_posts: "搜索灵感库",
  search_shared_templates: "搜索共享模板",
  list_enabled_image_providers: "列出可用模型",
  list_active_workflows: "列出工作流",
  summarize_generation_stack: "汇总生成栈",
  propose_image_generate_task: "提议生图",
  propose_image_edit_task: "提议改图",
};

export const CHAT_TOOL_ICONS: Record<string, string> = {
  search_inspiration_posts: "灵感",
  search_shared_templates: "模板",
  list_enabled_image_providers: "模型",
  list_active_workflows: "流程",
  summarize_generation_stack: "栈",
  propose_image_generate_task: "生图",
  propose_image_edit_task: "改图",
};

export const CHAT_AGENT_SUGGESTED_PROMPTS = [
  "找商业综合体相关的共享模板",
  "搜索玻璃幕墙高层灵感案例",
  "列出当前可用的生图模型",
  "汇总一下现在的生成栈配置",
] as const;

export type ChatAgentPolicyLayer = {
  layer: string;
  label: string;
  detail: string | null;
  disabled_tool_keys: string[];
  prompt_overlay: string;
};

export type ChatAgentPolicy = {
  policy_version: string;
  release_display_name: string | null;
  environment: string;
  enabled_tools: ChatAgentToolMeta[];
  disabled_tools: ChatAgentToolMeta[];
  policy_layers: ChatAgentPolicyLayer[];
  data_scope_note: string;
  capabilities_summary: string;
  baseline_prompt: string;
  personalization_summary: string | null;
  user_group_name: string | null;
  assigned_agents?: Array<{
    key: string;
    display_name: string;
    role: string;
    is_primary: boolean;
  }>;
};

export function labelForToolCall(call: ChatToolCall): string {
  return CHAT_TOOL_LABELS[call.name] || call.name;
}

export function iconForToolKey(key: string): string {
  return CHAT_TOOL_ICONS[key] || "工具";
}
