import { type ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
}

/**
 * Main layout shell with optional sidebar (nav rail) and content area.
 * Will be populated with actual navigation in task 3.5.
 */
export default function Layout({ children, sidebar }: LayoutProps) {
  return (
    <div className="app-shell">
      {sidebar && <aside className="nav-rail">{sidebar}</aside>}
      <main className="main-content">{children}</main>
    </div>
  );
}
