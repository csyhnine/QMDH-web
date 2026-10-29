import { useNavigate } from "react-router-dom";

export type AdminSectionTab = {
  key: string;
  label: string;
  path: string;
  badge?: number;
};

export default function AdminSectionTabs({
  tabs,
  active,
}: {
  tabs: AdminSectionTab[];
  active: string;
}) {
  const navigate = useNavigate();
  return (
    <nav className="admin-section-tabs admin-workspace-nav" aria-label="后台当前分组">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          aria-current={tab.key === active ? "page" : undefined}
          className={tab.key === active ? "is-active" : undefined}
          onClick={() => navigate(tab.path)}
        >
          {tab.label}
          {Boolean(tab.badge) && <em className="admin-tab-badge" aria-label={`${tab.badge} 条待处理反馈`}>{tab.badge}</em>}
        </button>
      ))}
    </nav>
  );
}
