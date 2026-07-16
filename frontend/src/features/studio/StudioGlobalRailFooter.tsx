import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import type { StudioGlobalRailFooterProps } from "./studioGlobalRailTypes";
import { adminHomePath } from "./studioAccessUtils";
import { formatDate, formatStatus } from "./studioUtils";

function navigateTo(href: string) {
  window.location.href = href;
}

export default function StudioGlobalRailFooter({
  canManageUsers,
  canUseOpsViews,
  currentUser,
  health,
  isAdminView,
  lastSyncedAt,
  onLogout,
}: StudioGlobalRailFooterProps) {
  const navigate = useNavigate();
  const { isGuest } = useAuth();

  if (isGuest) {
    return (
      <div className="rail-footer">
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
        <div className={`rail-health rail-health-${health}`}>{formatStatus(health)}</div>
        <span className="rail-sync">{lastSyncedAt ? formatDate(lastSyncedAt) : "等待同步"}</span>
      </div>
    );
  }

  const displayName = currentUser.display_name || currentUser.name;

  return (
    <div className="rail-footer">
      <div className="rail-user-card">
        <div className="rail-user-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
        <div>
          <small>{"\u5f53\u524d\u8d26\u53f7"}</small>
          <strong>{displayName}</strong>
          <span>@{currentUser.name}</span>
        </div>
      </div>
      {canUseOpsViews && !isAdminView ? (
        <button type="button" className="rail-logout" onClick={() => navigateTo(adminHomePath(currentUser))}>
          {"\u540e\u53f0"}
        </button>
      ) : null}
      {canManageUsers && !isAdminView ? (
        <button type="button" className="rail-logout" onClick={() => navigateTo("/admin/users")}>
          {"\u8d26\u53f7"}
        </button>
      ) : null}
      <button type="button" className="rail-logout" onClick={onLogout}>
        {"\u9000\u51fa"}
      </button>
      <div className={`rail-health rail-health-${health}`}>{formatStatus(health)}</div>
      <span className="rail-sync">{lastSyncedAt ? formatDate(lastSyncedAt) : "\u7b49\u5f85\u540c\u6b65"}</span>
    </div>
  );
}
