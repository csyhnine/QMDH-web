import { canAccessAdminModule, type AdminModuleKey } from "../access/roleAccess";

export type AdminNavItem = { key: AdminModuleKey; label: string; path: string };
export type AdminNavGroup = { key: string; label: string; items: AdminNavItem[] };
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  { key: "overview", label: "看板", items: [{ key: "dashboard", label: "运营看板", path: "/admin/dashboard" }] },
  { key: "data", label: "数据", items: [
    { key: "generation-analytics", label: "生成分析", path: "/admin/generation-analytics" },
    { key: "chat-experience", label: "Chat 体验", path: "/admin/chat-experience" },
    { key: "usage-logs", label: "日志", path: "/admin/usage-logs" },
    { key: "cad-usage", label: "图纸解析", path: "/admin/cad-usage" },
  ] },
  { key: "content", label: "内容", items: [
    { key: "inspiration", label: "灵感", path: "/admin/inspiration" },
    { key: "feedback", label: "反馈", path: "/admin/feedback" },
    { key: "announcements", label: "公告", path: "/admin/announcements" },
    { key: "ai-tools", label: "工具导航", path: "/admin/ai-tools" },
  ] },
  { key: "creation", label: "创作", items: [
    { key: "models", label: "模型", path: "/admin/models" },
    { key: "templates", label: "生成模板", path: "/admin/templates" },
    { key: "canvas-templates", label: "画布模板", path: "/admin/canvas-templates" },
    { key: "agents", label: "助手能力", path: "/admin/agents" },
  ] },
  { key: "system", label: "系统", items: [
    { key: "users", label: "账号", path: "/admin/users" },
    { key: "settings", label: "设置", path: "/admin/settings" },
  ] },
];

export function adminNavigation(role: string | undefined) {
  return ADMIN_NAV_GROUPS.map(group => ({ ...group, items: group.items.filter(item => canAccessAdminModule(role, item.key)) }))
    .filter(group => group.items.length > 0);
}
