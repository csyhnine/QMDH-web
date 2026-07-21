import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import {
  api,
  type AgentClientRecord,
  type AgentChatToolRecord,
  type AgentOfficialSkill,
  type AgentSkillReleaseRecord,
  type DashboardStats,
  type FeedbackRecord,
  type InspirationPost,
  type ManagedUser,
  type PromptTemplateRecord,
  type CanvasTemplateRecord,
  type Project,
  type Provider,
  type ProviderPricingRuleRecord,
  type ProviderProfileRecord,
  type Task,
  type UserGroupSummary,
} from "./api";
import { AppShell, AuthGuard, LoadingFallback } from "./components/shared";
import { useAuth } from "./context/AuthContext";
import { canAccessAdminModule, defaultAdminHomePath, type AdminModuleKey } from "./features/access/roleAccess";
import { isStudioCanvasEnabled } from "./lib/featureFlags";

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const DashboardPage = lazy(() => import("./pages/admin/DashboardPage"));
const UsageLogsPage = lazy(() => import("./pages/admin/UsageLogsPage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const ModelsPage = lazy(() => import("./pages/admin/ModelsPage"));
const PromptTemplatesPage = lazy(() => import("./pages/admin/PromptTemplatesPage"));
const CanvasTemplatesPage = lazy(() => import("./pages/admin/CanvasTemplatesPage"));
const CanvasWorkspace = lazy(() => import("./features/canvas/CanvasWorkspace"));
const AgentOpsPage = lazy(() => import("./pages/admin/AgentOpsPage"));
const FeedbackOpsPage = lazy(() => import("./pages/admin/FeedbackOpsPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const InspirationPage = lazy(() => import("./pages/inspiration/InspirationPage"));
const ChatPage = lazy(() => import("./pages/chat/ChatPage"));
const FeedbackPage = lazy(() => import("./pages/studio/FeedbackPage"));
const GeneratePage = lazy(() => import("./pages/studio/GeneratePage"));
const CanvasPage = lazy(() => import("./pages/studio/CanvasPage"));
function ProtectedRoute({ children }: { children: JSX.Element }) {
  return <AuthGuard>{children}</AuthGuard>;
}

function AdminModuleRoute({ module, children }: { module: AdminModuleKey; children: JSX.Element }) {
  const { currentUser, canUseOpsViews } = useAuth();
  if (!canUseOpsViews) {
    return <Navigate to="/studio/generate" replace />;
  }
  if (!canAccessAdminModule(currentUser?.role, module)) {
    return <Navigate to={defaultAdminHomePath(currentUser?.role)} replace />;
  }
  return children;
}

function AdminOnlyRoute({ children }: { children: JSX.Element }) {
  const { canManageUsers, currentUser, canUseOpsViews } = useAuth();
  if (!canUseOpsViews) {
    return <Navigate to="/studio/generate" replace />;
  }
  if (!canManageUsers) {
    return <Navigate to={defaultAdminHomePath(currentUser?.role)} replace />;
  }
  return children;
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

function buildDashboardDateWindow(days: number): { startDate: string; endDate: string } {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - (days - 1));
  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  };
}

function DashboardRoute() {
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [groupSummaries, setGroupSummaries] = useState<UserGroupSummary[]>([]);
  const [dashboardStatsDays, setDashboardStatsDays] = useState(7);
  const [groupSummaryRange, setGroupSummaryRange] = useState(() => buildDashboardDateWindow(7));
  const [groupRangeFollowsDashboard, setGroupRangeFollowsDashboard] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  async function refresh(
    days = dashboardStatsDays,
    groupRange: { startDate: string; endDate: string } = groupSummaryRange,
  ) {
    const [nextDashboard, nextGroupSummaries] = await Promise.all([
      api.dashboardStats(days),
      api.userGroupSummaries(groupRange.startDate, groupRange.endDate),
    ]);
    setDashboard(nextDashboard);
    setGroupSummaries(nextGroupSummaries);
    setLastSyncedAt(new Date().toISOString());
  }

  function handleChangeDays(days: number) {
    setDashboardStatsDays(days);
    if (groupRangeFollowsDashboard) {
      setGroupSummaryRange(buildDashboardDateWindow(days));
    }
  }

  function handleApplyGroupSummaryRange(range: { startDate: string; endDate: string }) {
    setGroupRangeFollowsDashboard(false);
    setGroupSummaryRange(range);
  }

  function handleSyncGroupSummaryRange() {
    const range = buildDashboardDateWindow(dashboardStatsDays);
    setGroupRangeFollowsDashboard(true);
    setGroupSummaryRange(range);
  }

  useEffect(() => {
    void refresh(dashboardStatsDays, groupSummaryRange);
  }, [dashboardStatsDays, groupSummaryRange]);

  return (
    <AppShell kind="admin" active="dashboard">
      <DashboardPage
        dashboard={dashboard}
        groupSummaries={groupSummaries}
        userCanUseOpsViews={true}
        dashboardStatsDays={dashboardStatsDays}
        groupSummaryRange={groupSummaryRange}
        groupRangeFollowsDashboard={groupRangeFollowsDashboard}
        lastSyncedAt={lastSyncedAt}
        onChangeDays={handleChangeDays}
        onApplyGroupSummaryRange={handleApplyGroupSummaryRange}
        onSyncGroupSummaryRange={handleSyncGroupSummaryRange}
        onRefresh={() => void refresh()}
      />
    </AppShell>
  );
}

function UsersRoute() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [groupSummaries, setGroupSummaries] = useState<UserGroupSummary[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [nextUsers, nextGroupSummaries] = await Promise.all([api.users(), api.userGroupSummaries()]);
      setUsers(nextUsers);
      setGroupSummaries(nextGroupSummaries);
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
      <UsersPage
        users={users}
        groupSummaries={groupSummaries}
        userCanManageUsers={true}
        error={error}
        onRefresh={() => void refresh()}
        onSetError={setError}
      />
    </AppShell>
  );
}

function ModelsRoute() {
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfileRecord[]>([]);
  const [pricingRules, setPricingRules] = useState<ProviderPricingRuleRecord[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [nextProviders, nextProfiles, nextPricingRules] = await Promise.all([
        api.providers(),
        api.providerProfiles(),
        api.providerPricingRules(),
      ]);
      setProviders(nextProviders);
      setProviderProfiles(nextProfiles);
      setPricingRules(nextPricingRules);
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
        pricingRules={pricingRules}
        providers={providers}
        error={error}
        onRefresh={() => void refresh()}
        onSetError={setError}
      />
    </AppShell>
  );
}

function PromptTemplatesRoute() {
  const [templates, setTemplates] = useState<PromptTemplateRecord[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setTemplates(await api.adminPromptTemplates());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载模板提示词失败");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AppShell kind="admin" active="templates">
      <PromptTemplatesPage templates={templates} error={error} onRefresh={() => void refresh()} onSetError={setError} />
    </AppShell>
  );
}

function CanvasTemplatesRoute() {
  const [templates, setTemplates] = useState<CanvasTemplateRecord[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      setTemplates(await api.adminCanvasTemplates());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载画布模板失败");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AppShell kind="admin" active="canvas-templates">
      <CanvasTemplatesPage templates={templates} error={error} onRefresh={() => void refresh()} onSetError={setError} />
    </AppShell>
  );
}

function CanvasTemplateEditRoute() {
  const navigate = useNavigate();
  const params = useParams();
  const templateId = Number(params.templateId);
  if (!Number.isFinite(templateId) || templateId <= 0) {
    return <Navigate to="/admin/canvas-templates" replace />;
  }

  return (
    <AppShell kind="admin" active="canvas-templates" layout="canvas">
      <CanvasWorkspace
        editTemplateId={templateId}
        onExit={() => navigate("/admin/canvas-templates")}
      />
    </AppShell>
  );
}

function AgentsRoute() {
  const [clients, setClients] = useState<AgentClientRecord[]>([]);
  const [skills, setSkills] = useState<AgentOfficialSkill[]>([]);
  const [chatTools, setChatTools] = useState<AgentChatToolRecord[]>([]);
  const [releases, setReleases] = useState<AgentSkillReleaseRecord[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [nextClients, nextSkills, nextChatTools, nextReleases] = await Promise.all([
        api.agentClients(),
        api.officialSkills(),
        api.agentChatTools(),
        api.agentSkillReleases(),
      ]);
      setClients(nextClients);
      setSkills(nextSkills);
      setChatTools(nextChatTools);
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
        chatTools={chatTools}
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
        onRefresh={refresh}
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
          {isStudioCanvasEnabled ? (
            <Route
              path="/studio/canvas"
              element={
                <ProtectedRoute>
                  <AppShell kind="studio" active="canvas">
                    <CanvasPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
          ) : null}
          <Route path="/admin/dashboard" element={<ProtectedRoute><AdminOnlyRoute><DashboardRoute /></AdminOnlyRoute></ProtectedRoute>} />
          <Route
            path="/admin/usage-logs"
            element={
              <ProtectedRoute>
                <AdminOnlyRoute>
                  <AppShell kind="admin" active="usage-logs">
                    <UsageLogsPage />
                  </AppShell>
                </AdminOnlyRoute>
              </ProtectedRoute>
            }
          />
          <Route path="/admin/users" element={<ProtectedRoute><AdminOnlyRoute><UsersRoute /></AdminOnlyRoute></ProtectedRoute>} />
          <Route path="/admin/models" element={<ProtectedRoute><AdminOnlyRoute><ModelsRoute /></AdminOnlyRoute></ProtectedRoute>} />
          <Route path="/admin/templates" element={<ProtectedRoute><AdminModuleRoute module="templates"><PromptTemplatesRoute /></AdminModuleRoute></ProtectedRoute>} />
          <Route path="/admin/canvas-templates" element={<ProtectedRoute><AdminModuleRoute module="canvas-templates"><CanvasTemplatesRoute /></AdminModuleRoute></ProtectedRoute>} />
          <Route path="/admin/canvas-templates/:templateId/edit" element={<ProtectedRoute><AdminModuleRoute module="canvas-templates"><CanvasTemplateEditRoute /></AdminModuleRoute></ProtectedRoute>} />
          <Route path="/admin/feedback" element={<ProtectedRoute><AdminModuleRoute module="feedback"><AdminFeedbackRoute /></AdminModuleRoute></ProtectedRoute>} />
          <Route path="/admin/agents" element={<ProtectedRoute><AdminOnlyRoute><AgentsRoute /></AdminOnlyRoute></ProtectedRoute>} />
          <Route path="/admin/inspiration" element={<ProtectedRoute><AdminModuleRoute module="inspiration"><AdminInspirationRoute /></AdminModuleRoute></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute><AdminOnlyRoute><SettingsRoute /></AdminOnlyRoute></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/studio/generate" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
