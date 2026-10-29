/** Shared by the generation rail and the routed Studio shell. */
export const OTHER_TOOLS_NAV = { key: "other", label: "其他", path: "/studio/other" } as const;

export const STUDIO_PRIMARY_NAV = [
  { key: "generate", label: "生成", path: "/studio/generate" },
  OTHER_TOOLS_NAV,
  { key: "library", label: "资产库", path: "/studio/library" },
  { key: "chat", label: "对话", path: "/studio/chat" },
] as const;

export function studioRailGroup(active: string) {
  if (["inspiration", "feedback", "nav", "other"].includes(active)) return "other";
  return active === "canvas" || active === "studio" ? "generate" : active;
}

export const OTHER_SECTION_LINKS = [
  { key: "inspiration", label: "灵感", path: "/studio/inspiration", description: "浏览与分享设计灵感" },
  { key: "feedback", label: "反馈", path: "/studio/feedback", description: "提交问题、查看回复和改进进展" },
  { key: "nav", label: "导航", path: "/studio/nav", description: "查找常用设计与 AI 工具" },
  { key: "cad", label: "图纸解析", path: "/studio/cad", description: "解析图纸与空间信息" },
  { key: "gif", label: "GIF 压缩", path: "/studio/gif", description: "调整 GIF 体积与画面参数" },
] as const;
