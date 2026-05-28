import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import {
  api,
  type AgentClientRecord,
  type AgentOfficialSkill,
  type AgentSkillReleaseRecord,
  type DashboardStats,
  type FeedbackRecord,
  type InspirationPost,
  type ManagedUser,
  type Project,
  type Provider,
  type ProviderProfileRecord,
  type Task,
} from "./api";
import { AppShell, AuthGuard, LoadingFallback } from "./components/shared";
import { useAuth } from "./context/AuthContext";

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const DashboardPage = lazy(() => import("./pages/admin/DashboardPage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const ModelsPage = lazy(() => import("./pages/admin/ModelsPage"));
const AgentOpsPage = lazy(() => import("./pages/admin/AgentOpsPage"));
const FeedbackOpsPage = lazy(() => import("./pages/admin/FeedbackOpsPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const InspirationPage = lazy(() => import("./pages/inspiration/InspirationPage"));
const ChatPage = lazy(() => import("./pages/chat/ChatPage"));
const FeedbackPage = lazy(() => import("./pages/studio/FeedbackPage"));
const GeneratePage = lazy(() => import("./pages/studio/GeneratePage"));

function ProtectedRoute({ children }: { children: JSX.Element }) {
  return <AuthGuard>{children}</AuthGuard>;
}

function OpsRoute({ children }: { children: JSX.Element }) {
  const { canUseOpsViews } = useAuth();
  return canUseOpsViews ? children : <Navigate to="/studio/generate" replace />;
}

function AdminRoute({ children }: { children: JSX.Element }) {
  const { canManageUsers } = useAuth();
  return canManageUsers ? children : <Navigate to="/studio/generate" replace />;
}

function InspirationRoute() {
  const { currentUser, canManageUsers, canUseOpsViews } = useAuth();
  const [posts, setPosts] = useState<InspirationPost[]>([]);

  useEffect(() => {
    api.inspiration().then(setPosts).catch(() => setPosts([]));
  }, []);

  return (
    <AppShell kind="studio" active="inspiration">
      <InspirationPage
        posts={posts}
        onPostsChange={setPosts}
        canContribute={Boolean(currentUser)}
        canManageLibrary={canManageUsers || canUseOpsViews}
      />
    </AppShell>
  );
}

function AdminInspirationRoute() {
  const [posts, setPosts] = useState<InspirationPost[]>([]);

  useEffect(() => {
    api.inspiration().then(setPosts).catch(() => setPosts([]));
  }, []);

  return (
    <AppShell kind="admin" active="inspiration">
      <InspirationPage posts={posts} onPostsChange={setPosts} canContribute canManageLibrary mode="admin" />
    </AppShell>
  );
}

function StudioFeedbackRoute() {
  const [feedbackItems, setFeedbackItems] = useState<FeedbackRecord[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setFeedbackItems(await api.feedback());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AppShell kind="studio" active="feedback">
      <FeedbackPage feedbackItems={feedbackItems} error={error} onRefresh={() => void refresh()} onSetError={setError} />
    </AppShell>
  );
}

function DashboardRoute() {
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [dashboardStatsDays, setDashboardStatsDays] = useState(30);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  async function refresh(days = dashboardStatsDays) {
    const nextDashboard = await api.dashboardStats(days);
    setDashboard(nextDashboard);
    setLastSyncedAt(new Date().toISOString());
  }

  useEffect(() => {
    void refresh(dashboardStatsDays);
  }, [dashboardStatsDays]);

  return (
    <AppShell kind="admin" active="dashboard">
      <DashboardPage
        dashboard={dashboard}
        userCanUseOpsViews={true}
        dashboardStatsDays={dashboardStatsDays}
        lastSyncedAt={lastSyncedAt}
        onChangeDays={setDashboardStatsDays}
        onRefresh={() => void refresh()}
      />
    </AppShell>
  );
}

function UsersRoute() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setUsers(await api.users());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载用户失败");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AppShell kind="admin" active="users">
      <UsersPage users={users} userCanManageUsers={true} error={error} onRefresh={() => void refresh()} onSetError={setError} />
    </AppShell>
  );
}

function ModelsRoute() {
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfileRecord[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [nextProviders, nextProfiles] = await Promise.all([api.providers(), api.providerProfiles()]);
      setProviders(nextProviders);
      setProviderProfiles(nextProfiles);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载模型配置失败");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AppShell kind="admin" active="models">
      <ModelsPage
        providerProfiles={providerProfiles}
        providers={providers}
        error={error}
        onRefresh={() => void refresh()}
        onSetError={setError}
      />
    </AppShell>
  );
}

function AgentsRoute() {
  const [clients, setClients] = useState<AgentClientRecord[]>([]);
  const [skills, setSkills] = useState<AgentOfficialSkill[]>([]);
  const [releases, setReleases] = useState<AgentSkillReleaseRecord[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [nextClients, nextSkills, nextReleases] = await Promise.all([
        api.agentClients(),
        api.officialSkills(),
        api.agentSkillReleases(),
      ]);
      setClients(nextClients);
      setSkills(nextSkills);
      setReleases(nextReleases);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent operations data");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AppShell kind="admin" active="agents">
      <AgentOpsPage
        clients={clients}
        skills={skills}
        releases={releases}
        error={error}
        onRefresh={() => void refresh()}
        onSetError={setError}
      />
    </AppShell>
  );
}

function AdminFeedbackRoute() {
  const [feedbackItems, setFeedbackItems] = useState<FeedbackRecord[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setFeedbackItems(await api.adminFeedback());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback inbox");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AppShell kind="admin" active="feedback">
      <FeedbackOpsPage feedbackItems={feedbackItems} error={error} onRefresh={() => void refresh()} onSetError={setError} />
    </AppShell>
  );
}

function SettingsRoute() {
  const { canManageUsers } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfileRecord[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);

  async function refresh() {
    const [nextTasks, nextProfiles, nextUsers] = await Promise.all([
      api.tasks(),
      api.providerProfiles(),
      canManageUsers ? api.users() : Promise.resolve([]),
    ]);
    setTasks(nextTasks);
    setProviderProfiles(nextProfiles);
    setUsers(nextUsers);
  }

  useEffect(() => {
    void refresh();
  }, [canManageUsers]);

  return (
    <AppShell kind="admin" active="settings">
      <SettingsPage
        userCanManageUsers={canManageUsers}
        userCanUseOpsViews={true}
        tasks={tasks}
        providerProfiles={providerProfiles}
        users={users}
        onRefresh={() => void refresh()}
      />
    </AppShell>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/studio/generate" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/studio/generate" element={<ProtectedRoute><GeneratePage /></ProtectedRoute>} />
          <Route path="/studio/inspiration" element={<ProtectedRoute><InspirationRoute /></ProtectedRoute>} />
          <Route path="/studio/feedback" element={<ProtectedRoute><StudioFeedbackRoute /></ProtectedRoute>} />
          <Route
            path="/studio/chat"
            element={
              <ProtectedRoute>
                <AppShell kind="studio" active="chat">
                  <ChatPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route path="/admin/dashboard" element={<ProtectedRoute><OpsRoute><DashboardRoute /></OpsRoute></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute><AdminRoute><UsersRoute /></AdminRoute></ProtectedRoute>} />
          <Route path="/admin/models" element={<ProtectedRoute><OpsRoute><ModelsRoute /></OpsRoute></ProtectedRoute>} />
          <Route path="/admin/feedback" element={<ProtectedRoute><AdminRoute><AdminFeedbackRoute /></AdminRoute></ProtectedRoute>} />
          <Route path="/admin/agents" element={<ProtectedRoute><OpsRoute><AgentsRoute /></OpsRoute></ProtectedRoute>} />
          <Route path="/admin/inspiration" element={<ProtectedRoute><OpsRoute><AdminInspirationRoute /></OpsRoute></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute><AdminRoute><SettingsRoute /></AdminRoute></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/studio/generate" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
