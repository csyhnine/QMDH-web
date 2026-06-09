import type { RailView, StudioGlobalRailNavProps } from "./studioGlobalRailTypes";

type RailNavItem = {
  label: string;
  href: string;
  icon?: string;
  view?: RailView;
};

const ADMIN_NAV_ITEMS: RailNavItem[] = [
  { label: "\u8fd0\u8425\u770b\u677f", href: "/admin/dashboard", icon: "\u25a0", view: "dashboard" },
  { label: "\u6a21\u578b\u7ba1\u7406", href: "/admin/models", icon: "\u2301", view: "models" },
  { label: "\u8d26\u53f7\u7ba1\u7406", href: "/admin/users", icon: "\u25a0", view: "users" },
  { label: "\u8bbe\u7f6e\u4e2d\u5fc3", href: "/admin/settings", icon: "\u26ef", view: "settings" },
];

const STUDIO_NAV_ITEMS: RailNavItem[] = [
  { label: "\u7075\u611f", href: "/studio/inspiration" },
  { label: "\u53cd\u9988", href: "/studio/feedback" },
  { label: "\u751f\u6210", href: "/studio/generate", view: "studio" },
  { label: "\u5bf9\u8bdd", href: "/studio/chat" },
];

function navigateTo(href: string) {
  window.location.href = href;
}

function railItemClass(activeView: RailView, item: RailNavItem) {
  return item.view === activeView ? "rail-item active" : "rail-item";
}

export default function StudioGlobalRailNav({
  activeView,
  isAdminView,
}: StudioGlobalRailNavProps) {
  const items = isAdminView ? ADMIN_NAV_ITEMS : STUDIO_NAV_ITEMS;

  return (
    <nav className="rail-nav">
      {items.map((item) => (
        <button
          key={item.href}
          type="button"
          className={railItemClass(activeView, item)}
          onClick={() => navigateTo(item.href)}
        >
          {item.icon ? <b>{item.icon}</b> : null}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
