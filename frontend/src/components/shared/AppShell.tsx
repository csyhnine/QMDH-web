import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import GuestLoginBanner from "../../features/studio/GuestLoginBanner";
import { canAccessAdminModule, defaultAdminHomePath, type AdminModuleKey } from "../../features/access/roleAccess";
import { useAdminFeedbackPendingCount } from "../../lib/useAdminFeedbackPendingCount";
import { BrandIcon } from "./Brand";
import { OTHER_TOOLS_NAV } from "../../features/studio/studioNavigation";

type StudioTab = "management" | "generate" | "inspiration" | "feedback" | "chat" | "canvas" | "nav" | "other" | "library";
type AdminTab = AdminModuleKey;

type AppShellProps =
  | {
      kind: "studio";
      active: Exclude<StudioTab, "generate">;
      children: ReactNode;
    }
  | {
      kind: "admin";
      active: AdminTab;
      layout?: "default" | "canvas";
      children: ReactNode;
    };

import { isStudioCanvasEnabled } from "../../lib/featureFlags";

const adminNavItems: Array<{ key: AdminTab; label: string; path: string; activeKeys?: AdminTab[] }> = [
  { key: "dashboard", label: "看板", path: "/admin/dashboard" },
  {
    key: "generation-analytics",
    label: "数据",
    path: "/admin/generation-analytics",
    activeKeys: ["generation-analytics", "chat-experience", "usage-logs", "cad-usage"],
  },
  { key: "inspiration", label: "灵感", path: "/admin/inspiration" },
  { key: "feedback", label: "反馈", path: "/admin/feedback" },
  { key: "models", label: "模型", path: "/admin/models" },
  {
    key: "templates",
    label: "模板",
    path: "/admin/templates",
    activeKeys: ["templates", "canvas-templates"],
  },
  { key: "announcements", label: "公告", path: "/admin/announcements" },
  { key: "ai-tools", label: "工具导航", path: "/admin/ai-tools" },
  { key: "agents", label: "助手能力", path: "/admin/agents" },
  { key: "users", label: "账号", path: "/admin/users" },
  { key: "settings", label: "设置", path: "/admin/settings" },
];

const studioNavItems: Array<{ key: Exclude<StudioTab, "generate"> | "generate"; label: string; path: string }> = [
  { key: "inspiration", label: "灵感", path: "/studio/inspiration" },
  { key: "feedback", label: "反馈", path: "/studio/feedback" },
  { key: "generate", label: "生成", path: "/studio/generate" },
  OTHER_TOOLS_NAV,
  { key: "library", label: "资产库", path: "/studio/library" },
  ...(isStudioCanvasEnabled
    ? ([{ key: "canvas" as const, label: "无限画布", path: "/studio/canvas" }] as const)
    : []),
  { key: "nav", label: "导航", path: "/studio/nav" },
  { key: "chat", label: "对话", path: "/studio/chat" },
];

export default function AppShell(props: AppShellProps) {
  const navigate = useNavigate();
  const { currentUser, canUseOpsViews, isGuest, logout } = useAuth();
  const backofficeHome = defaultAdminHomePath(currentUser?.role);
  const canSeeFeedbackNav =
    props.kind === "admin" && canAccessAdminModule(currentUser?.role, "feedback");
  const feedbackPendingCount = useAdminFeedbackPendingCount(canSeeFeedbackNav);
  const showFeedbackPendingDot =
    canSeeFeedbackNav && feedbackPendingCount > 0 && props.active !== "feedback";

  const className =
    props.kind === "admin"
      ? props.layout === "canvas"
        ? "studio-shell admin-shell canvas-shell"
        : "studio-shell admin-shell"
      : props.active === "chat"
        ? "studio-shell chat-shell"
        : props.active === "canvas"
          ? "studio-shell canvas-shell"
          : props.active === "nav"
            ? "studio-shell inspiration-shell nav-shell"
            : "studio-shell inspiration-shell";

  const mainClassName =
    props.kind === "admin"
      ? props.layout === "canvas"
        ? "canvas-area canvas-infinite-layout"
        : "canvas-area"
      : props.active === "chat"
        ? "canvas-area canvas-chat-layout"
        : props.active === "canvas"
          ? "canvas-area canvas-infinite-layout"
          : props.active === "nav"
            ? "canvas-area canvas-nav-layout"
            : "canvas-area";

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className={isGuest && props.kind === "studio" ? "studio-guest-layout" : undefined}>
      {isGuest && props.kind === "studio" ? <GuestLoginBanner /> : null}
      <div className={className}>
      <aside className="global-rail">
        <div className="rail-logo">
          <BrandIcon className="rail-logo-image" />
        </div>
        <nav className="rail-nav">
          {props.kind === "admin"
            ? adminNavItems.map((item) => {
                const allowed = canAccessAdminModule(currentUser?.role, item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={[
                      item.activeKeys?.includes(props.active) || props.active === item.key ? "rail-item active" : "rail-item",
                      allowed ? "" : "rail-item-locked",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={!allowed}
                    aria-disabled={!allowed}
                    title={allowed ? item.label : `${item.label}（无权限）`}
                    onClick={() => {
                      if (allowed) navigate(item.path);
                    }}
                  >
                    <span>{item.label}</span>
                    {item.key === "feedback" && showFeedbackPendingDot ? (
                      <em
                        className="rail-item-dot"
                        aria-label={`${feedbackPendingCount} 条待处理反馈`}
                        title={`${feedbackPendingCount} 条待处理反馈`}
                      />
                    ) : null}
                    {!allowed ? (
                      <em className="rail-item-lock" aria-hidden="true">
                        🔒
                      </em>
                    ) : null}
                  </button>
                );
              })
            : studioNavItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={props.active === item.key ? "rail-item active" : "rail-item"}
                  onClick={() => navigate(item.path)}
                >
                  <span>{item.label}</span>
                </button>
              ))}
          {currentUser?.company_management ? <button type="button" className={props.kind === "studio" && props.active === "management" ? "rail-item active" : "rail-item"} onClick={() => navigate("/management/projects")}>项目管理</button> : null}
        </nav>
        <div className="rail-footer">
          {isGuest && props.kind === "studio" ? (
            <>
              <div className="rail-user-card rail-guest-card">
                <div className="rail-user-avatar">访</div>
                <div>
                  <small>当前模式</small>
                  <strong>访客</strong>
                  <span>登录后使用完整功能</span>
                </div>
              </div>
              <button type="button" className="rail-logout" onClick={() => navigate("/login")}>
                登录
              </button>
            </>
          ) : (
            <>
              {currentUser ? (
                <div className="rail-user-card">
                  <div className="rail-user-avatar">
                    {(currentUser.display_name || currentUser.name).slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <small>当前账号</small>
                    <strong>{currentUser.display_name || currentUser.name}</strong>
                    <span>@{currentUser.name}</span>
                  </div>
                </div>
              ) : null}
              {props.kind === "admin" && canUseOpsViews ? (
                <button type="button" className="rail-logout" onClick={() => navigate("/studio/generate")}>
                  创作台
                </button>
              ) : null}
              {props.kind === "studio" && canUseOpsViews ? (
                <button type="button" className="rail-logout" onClick={() => navigate(backofficeHome)}>
                  后台
                </button>
              ) : null}
              <button type="button" className="rail-logout" onClick={() => void handleLogout()}>
                退出
              </button>
            </>
          )}
        </div>
      </aside>

      <main className={mainClassName}>{props.children}</main>
      </div>
    </div>
  );
}
