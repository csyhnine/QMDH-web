import { useNavigate } from "react-router-dom";

export type AdminSectionTab = {
  key: string;
  label: string;
  path: string;
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
    <div className="admin-section-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === active}
          className={tab.key === active ? "is-active" : undefined}
          onClick={() => navigate(tab.path)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export const INSIGHT_TABS: AdminSectionTab[] = [
  { key: "generation-analytics", label: "生成分析", path: "/admin/generation-analytics" },
  { key: "chat-experience", label: "Chat 体验", path: "/admin/chat-experience" },
  { key: "usage-logs", label: "日志", path: "/admin/usage-logs" },
  { key: "cad-usage", label: "图纸解析", path: "/admin/cad-usage" },
];

export const TEMPLATE_TABS: AdminSectionTab[] = [
  { key: "templates", label: "生成模板", path: "/admin/templates" },
  { key: "canvas-templates", label: "画布模板", path: "/admin/canvas-templates" },
];
