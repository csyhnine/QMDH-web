/**
 * Central router configuration with lazy loading.
 * Task 3.4 - Maps all URL paths to their respective page components.
 */
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Lazy-loaded page components
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const DashboardPage = lazy(() => import("./pages/admin/DashboardPage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const ModelsPage = lazy(() => import("./pages/admin/ModelsPage"));
const ProjectsPage = lazy(() => import("./pages/admin/ProjectsPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const InspirationPage = lazy(() => import("./pages/inspiration/InspirationPage"));
const ChatPage = lazy(() => import("./pages/chat/ChatPage"));
const GeneratePage = lazy(() => import("./pages/studio/GeneratePage"));

function LoadingFallback() {
  return <div className="auth-shell">加载中...</div>;
}

/**
 * AppRouter - wraps all routes in BrowserRouter with Suspense fallback.
 *
 * Note: This router is defined but NOT yet wired into App.tsx.
 * Task 3.5 will replace the current inline view switching in App.tsx
 * with this router component. Until then, App.tsx continues to handle
 * routing via window.location.pathname and conditional rendering.
 */
export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Auth */}
          <Route path="/login" element={<LoginPage />} />

          {/* Studio tabs */}
          <Route path="/" element={<GeneratePage />} />
          <Route path="/inspiration" element={<InspirationPage posts={[]} onPostsChange={() => {}} canManage={false} />} />
          <Route path="/chat" element={<ChatPage />} />

          {/* Admin */}
          <Route path="/admin/dashboard" element={<DashboardPage dashboard={null} userCanUseOpsViews={false} dashboardStatsDays={30} lastSyncedAt={null} onChangeDays={() => {}} onRefresh={() => {}} />} />
          <Route path="/admin/users" element={<UsersPage users={[]} userCanManageUsers={false} error="" onRefresh={() => {}} onSetError={() => {}} />} />
          <Route path="/admin/models" element={<ModelsPage providerProfiles={[]} providers={[]} error="" onRefresh={() => {}} onSetError={() => {}} />} />
          <Route path="/admin/projects" element={<ProjectsPage projects={[]} tasks={[]} userCanUseOpsViews={false} onRefresh={() => {}} />} />
          <Route path="/admin/settings" element={<SettingsPage userCanManageUsers={false} userCanUseOpsViews={false} tasks={[]} providerProfiles={[]} users={[]} projects={[]} onRefresh={() => {}} />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
