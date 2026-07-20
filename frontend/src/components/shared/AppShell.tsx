import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import GuestLoginBanner from "../../features/studio/GuestLoginBanner";
import { BrandIcon } from "./Brand";
import { canAccessAdminModule, defaultAdminHomePath, type AdminModuleKey } from "../../features/access/roleAccess";

type StudioTab = "generate" | "inspiration" | "feedback" | "chat" | "canvas";
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

const adminNavItems: Array<{ key: AdminTab; label: string; path: string }> = [
  { key: "dashboard", label: "看板", path: "/admin/dashboard" },
  { key: "usage-logs", label: "日志", path: "/admin/usage-logs" },
  { key: "inspiration", label: "灵感", path: "/admin/inspiration" },
  { key: "feedback", label: "反馈", path: "/admin/feedback" },
  { key: "models", label: "模型", path: "/admin/models" },
  { key: "templates", label: "模板", path: "/admin/templates" },
  { key: "canvas-templates", label: "画布模板", path: "/admin/canvas-templates" },
  { key: "agents", label: "代理", path: "/admin/agents" },
  { key: "users", label: "账号", path: "/admin/users" },
  { key: "settings", label: "设置", path: "/admin/settings" },
];

const studioNavItems: Array<{ key: Exclude<StudioTab, "generate"> | "generate"; label: string; path: string }> = [
  { key: "inspiration", label: "灵感", path: "/studio/inspiration" },
  { key: "feedback", label: "反馈", path: "/studio/feedback" },
  { key: "generate", label: "生成", path: "/studio/generate" },
  ...(isStudioCanvasEnabled
    ? ([{ key: "canvas" as const, label: "无限画布", path: "/studio/canvas" }] as const)
    : []),
  { key: "chat", label: "对话", path: "/studio/chat" },
];

export default function AppShell(props: AppShellProps) {
  const navigate = useNavigate();
  const { currentUser, canUseOpsViews, isGuest, logout } = useAuth();
  const backofficeHome = defaultAdminHomePath(currentUser?.role);

  const className =
    props.kind === "admin"
      ? props.layout === "canvas"
        ? "studio-shell admin-shell canvas-shell"
        : "studio-shell admin-shell"
      : props.active === "chat"
        ? "studio-shell chat-shell"
        : props.active === "canvas"
          ? "studio-shell canvas-shell"
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
                      props.active === item.key ? "rail-item active" : "rail-item",
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
