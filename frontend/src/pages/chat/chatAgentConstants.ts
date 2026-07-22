import type { ChatToolCall } from "../../lib/chat/qmdhSseParser";



export type ChatAgentToolMeta = {

  key: string;

  label: string;

  description: string;

};



export const CHAT_TOOL_LABELS: Record<string, string> = {

  search_shared_templates: "搜索共享模板",

  create_image_generate_task: "创建生图任务",

  create_image_edit_task: "创建改图任务",

  create_video_generate_task: "创建视频任务",

  memory_recall: "检索记忆",

  memory_store: "写入记忆",

  memory_forget: "删除记忆",

  search_inspiration_posts: "搜索灵感库",

  list_enabled_image_providers: "列出可用模型",

  list_active_workflows: "列出工作流",

  summarize_generation_stack: "汇总生成栈",

  read_skill_resource: "读取 Skill 文件",

  propose_image_generate_task: "创建生图任务",

  propose_image_edit_task: "创建改图任务",

  propose_video_generate_task: "创建视频任务",

};



export const CHAT_TOOL_ICONS: Record<string, string> = {

  search_shared_templates: "模板",

  create_image_generate_task: "生图",

  create_image_edit_task: "改图",

  create_video_generate_task: "视频",

  memory_recall: "记忆",

  memory_store: "记忆",

  memory_forget: "记忆",

  search_inspiration_posts: "灵感",

  list_enabled_image_providers: "模型",

  list_active_workflows: "流程",

  summarize_generation_stack: "栈",

  read_skill_resource: "Skill",

  propose_image_generate_task: "生图",

  propose_image_edit_task: "改图",

  propose_video_generate_task: "视频",

};



export const CHAT_AGENT_SUGGESTED_PROMPTS = [

  "找商业综合体相关的共享模板",

  "用当前可用模型生成一张现代办公大堂效果图",

  "帮我改一下这张图的材质和灯光",

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

