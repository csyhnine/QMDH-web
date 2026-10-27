import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import GuestLoginBanner from "../../features/studio/GuestLoginBanner";
import { canAccessAdminModule, defaultAdminHomePath, type AdminModuleKey } from "../../features/access/roleAccess";
import { useAdminFeedbackPendingCount } from "../../lib/useAdminFeedbackPendingCount";
import { BrandIcon } from "./Brand";
import { STUDIO_PRIMARY_NAV, studioRailGroup } from "../../features/studio/studioNavigation";
import StudioSectionTabs from "../../features/studio/StudioSectionTabs";
import AdminSectionTabs from "../../features/admin/AdminSectionTabs";
import { adminNavigation } from "../../features/admin/adminNavigation";
import "../../features/admin/adminNavigation.css";

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


const studioNavItems = STUDIO_PRIMARY_NAV;

export default function AppShell(props: AppShellProps) {
  const navigate = useNavigate();
  const { currentUser, canUseOpsViews, isGuest, logout } = useAuth();
  const backofficeHome = defaultAdminHomePath(currentUser?.role);
  const canSeeFeedbackNav =
    props.kind === "admin" && canAccessAdminModule(currentUser?.role, "feedback");
  const feedbackPendingCount = useAdminFeedbackPendingCount(canSeeFeedbackNav);
  const showFeedbackPendingDot =
    canSeeFeedbackNav && feedbackPendingCount > 0 && props.active !== "feedback";
  const adminGroups = props.kind === "admin" ? adminNavigation(currentUser?.role) : [];
  const activeGroup = adminGroups.find(group => group.items.some(item => item.key === props.active));

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
      <div className={className + (props.kind === "studio" ? " studio-consolidated-shell" : "") + (props.kind === "studio" && props.active === "management" ? " management-shell" : "")}>
      <aside className="global-rail">
        <div className="rail-logo">
          <BrandIcon className="rail-logo-image" />
        </div>
        <nav className="rail-nav">
          {props.kind === "admin"
            ? adminGroups.map((item) => {
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={[
                      activeGroup?.key === item.key ? "rail-item active" : "rail-item",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    title={item.label}
                    onClick={() => {
                      navigate(item.items[0].path);
                    }}
                  >
                    <span>{item.label}</span>
                    {item.key === "content" && showFeedbackPendingDot ? (
                      <em
                        className="rail-item-dot"
                        aria-label={`${feedbackPendingCount} 条待处理反馈`}
                        title={`${feedbackPendingCount} 条待处理反馈`}
                      />
                    ) : null}
                  </button>
                );
              })
            : studioNavItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={studioRailGroup(props.active) === item.key ? "rail-item active" : "rail-item"}
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

      <main className={mainClassName}>
        {props.kind === "admin" && activeGroup && <AdminSectionTabs active={props.active} tabs={activeGroup.items.map(item => ({ ...item, badge: item.key === "feedback" ? feedbackPendingCount : undefined }))} />}
        {props.kind === "studio" && ["inspiration", "feedback", "nav"].includes(props.active) && <StudioSectionTabs group="other" active={props.active} />}
        {props.kind === "studio" && props.active === "canvas" && <StudioSectionTabs group="generate" active="canvas" />}
        {props.children}
      </main>
      </div>
    </div>
  );
}
