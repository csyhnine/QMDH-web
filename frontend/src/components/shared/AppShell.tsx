import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

type StudioTab = "generate" | "inspiration" | "chat";
type AdminTab = "dashboard" | "projects" | "models" | "users" | "settings";

type AppShellProps =
  | {
      kind: "studio";
      active: Exclude<StudioTab, "generate">;
      children: ReactNode;
    }
  | {
      kind: "admin";
      active: AdminTab;
      children: ReactNode;
    };

const adminNavItems: Array<{ key: AdminTab; label: string; icon: string; path: string }> = [
  { key: "dashboard", label: "运营看板", icon: "▣", path: "/admin/dashboard" },
  { key: "projects", label: "项目管理", icon: "◌", path: "/admin/projects" },
  { key: "models", label: "模型管理", icon: "⎔", path: "/admin/models" },
  { key: "users", label: "账号管理", icon: "◫", path: "/admin/users" },
  { key: "settings", label: "设置中心", icon: "⚙", path: "/admin/settings" },
];

const studioNavItems: Array<{ key: Exclude<StudioTab, "generate"> | "generate"; label: string; path: string }> = [
  { key: "inspiration", label: "灵感", path: "/studio/inspiration" },
  { key: "generate", label: "生成", path: "/studio/generate" },
  { key: "chat", label: "Chat", path: "/studio/chat" },
];

export default function AppShell(props: AppShellProps) {
  const navigate = useNavigate();
  const { currentUser, canManageUsers, canUseOpsViews, logout } = useAuth();

  const className =
    props.kind === "admin"
      ? "studio-shell admin-shell"
      : props.active === "chat"
        ? "studio-shell chat-shell"
        : "studio-shell inspiration-shell";

  const mainClassName =
    props.kind === "admin"
      ? "canvas-area"
      : props.active === "chat"
        ? "canvas-area canvas-chat-layout"
        : "canvas-area";

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className={className}>
      <aside className="global-rail">
        <div className="rail-logo">Q</div>
        <nav className="rail-nav">
          {props.kind === "admin"
            ? adminNavItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={props.active === item.key ? "rail-item active" : "rail-item"}
                  onClick={() => navigate(item.path)}
                >
                  <b>{item.icon}</b>
                  <span>{item.label}</span>
                </button>
              ))
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
          {props.kind === "admin" && currentUser ? (
            <div className="admin-user-card">
              <div className="admin-user-avatar">
                {(currentUser.display_name || currentUser.name).slice(0, 1).toUpperCase()}
              </div>
              <div>
                <strong>{currentUser.display_name || currentUser.name}</strong>
                <span>{currentUser.role}</span>
              </div>
            </div>
          ) : null}
          {props.kind === "studio" && canUseOpsViews ? (
            <button type="button" className="rail-logout" onClick={() => navigate("/admin/dashboard")}>
              看板
            </button>
          ) : null}
          {props.kind === "studio" && canManageUsers ? (
            <button type="button" className="rail-logout" onClick={() => navigate("/admin/users")}>
              账号
            </button>
          ) : null}
          <button type="button" className="rail-logout" onClick={() => void handleLogout()}>
            退出
          </button>
        </div>
      </aside>

      <main className={mainClassName}>{props.children}</main>
    </div>
  );
}
