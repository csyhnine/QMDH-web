import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

type StudioTab = "generate" | "inspiration" | "feedback" | "chat";
type AdminTab = "dashboard" | "inspiration" | "feedback" | "models" | "agents" | "users" | "settings";

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

const adminNavItems: Array<{ key: AdminTab; label: string; path: string }> = [
  { key: "dashboard", label: "Dashboard", path: "/admin/dashboard" },
  { key: "inspiration", label: "Inspiration", path: "/admin/inspiration" },
  { key: "feedback", label: "Feedback", path: "/admin/feedback" },
  { key: "models", label: "Models", path: "/admin/models" },
  { key: "agents", label: "Agents", path: "/admin/agents" },
  { key: "users", label: "Users", path: "/admin/users" },
  { key: "settings", label: "Settings", path: "/admin/settings" },
];

const studioNavItems: Array<{ key: Exclude<StudioTab, "generate"> | "generate"; label: string; path: string }> = [
  { key: "inspiration", label: "Inspiration", path: "/studio/inspiration" },
  { key: "feedback", label: "Feedback", path: "/studio/feedback" },
  { key: "generate", label: "Generate", path: "/studio/generate" },
  { key: "chat", label: "Chat", path: "/studio/chat" },
];

export default function AppShell(props: AppShellProps) {
  const navigate = useNavigate();
  const { currentUser, canUseOpsViews, logout } = useAuth();

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
          {currentUser ? (
            <div className="rail-user-card">
              <div className="rail-user-avatar">
                {(currentUser.display_name || currentUser.name).slice(0, 1).toUpperCase()}
              </div>
              <div>
                <small>Current account</small>
                <strong>{currentUser.display_name || currentUser.name}</strong>
                <span>@{currentUser.name}</span>
              </div>
            </div>
          ) : null}
          {props.kind === "admin" && canUseOpsViews ? (
            <button type="button" className="rail-logout" onClick={() => navigate("/studio/generate")}>
              Studio
            </button>
          ) : null}
          {props.kind === "studio" && canUseOpsViews ? (
            <button type="button" className="rail-logout" onClick={() => navigate("/admin/dashboard")}>
              Admin
            </button>
          ) : null}
          <button type="button" className="rail-logout" onClick={() => void handleLogout()}>
            Sign out
          </button>
        </div>
      </aside>

      <main className={mainClassName}>{props.children}</main>
    </div>
  );
}
