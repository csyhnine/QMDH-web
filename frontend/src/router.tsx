import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import {
  api,
  type AgentClientRecord,
  type AgentChatToolRecord,
  type AgentOfficialSkill,
  type AgentSkillReleaseRecord,
  type DashboardStats,
  type FeedbackRecord,
  type ManagedUser,
  type PromptTemplateRecord,
  type CanvasTemplateRecord,
  type SiteAnnouncementRecord,
  type AiToolRecord,
  type Project,
  type Provider,
  type ProviderPricingRuleRecord,
  type ProviderProfileRecord,
  type PlatformSettingsRecord,
  type Task,
  type UserGroupSummary,
} from "./api";
import { AppShell, AuthGuard, LoadingFallback } from "./components/shared";
import { buildBusinessDateWindow } from "./lib/businessDateWindow";
import { useWindowQuery } from "./pages/admin/useWindowQuery";
import { useAuth } from "./context/AuthContext";
import { canAccessAdminModule, defaultAdminHomePath, type AdminModuleKey } from "./features/access/roleAccess";
import { isStudioCanvasEnabled } from "./lib/featureFlags";

const ManagementProjectsPage = lazy(() => import("./pages/management/ManagementProjectsPage"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const CadUsagePage = lazy(() => import("./pages/admin/CadUsagePage"));
const DashboardPage = lazy(() => import("./pages/admin/DashboardPage"));
const GenerationAnalyticsPage = lazy(() => import("./pages/admin/GenerationAnalyticsPage"));
const ChatExperiencePage = lazy(() => import("./pages/admin/ChatExperiencePage"));
const UsageLogsPage = lazy(() => import("./pages/admin/UsageLogsPage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const ModelsPage = lazy(() => import("./pages/admin/ModelsPage"));
const PromptTemplatesPage = lazy(() => import("./pages/admin/PromptTemplatesPage"));
const CanvasTemplatesPage = lazy(() => import("./pages/admin/CanvasTemplatesPage"));
const AnnouncementsPage = lazy(() => import("./pages/admin/AnnouncementsPage"));
const AiToolsAdminPage = lazy(() => import("./pages/admin/AiToolsAdminPage"));
const AiToolsNavPage = lazy(() => import("./pages/studio/AiToolsNavPage"));
const CanvasWorkspace = lazy(() => import("./features/canvas/CanvasWorkspace"));
const AgentOpsPage = lazy(() => import("./pages/admin/AgentOpsPage"));
const FeedbackOpsPage = lazy(() => import("./pages/admin/FeedbackOpsPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const InspirationPage = lazy(() => import("./pages/inspiration/InspirationPage"));
const ChatPage = lazy(() => import("./pages/chat/ChatPage"));
const FeedbackPage = lazy(() => import("./pages/studio/FeedbackPage"));
const GeneratePage = lazy(() => import("./pages/studio/GeneratePage"));
const OtherToolsPage = lazy(() => import("./pages/studio/OtherToolsPage"));
const AssetLibraryPage = lazy(() => import("./pages/studio/AssetLibraryPage"));
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

function CompanyManagementRoute() {
  const { currentUser } = useAuth();
  if (!currentUser?.company_management) return <Navigate to="/studio/generate" replace />;
  return <AppShell kind="studio" active="management"><ManagementProjectsPage /></AppShell>;
}

function InspirationRoute() {
  const { currentUser, canManageUsers, canUseOpsViews } = useAuth();
  return (
    <AppShell kind="studio" active="inspiration">
      <InspirationPage
        canContribute={Boolean(currentUser)}
        canManageLibrary={canManageUsers || canUseOpsViews}
      />
    </AppShell>
  );
}

function AdminInspirationRoute() {
  return (
    <AppShell kind="admin" active="inspiration">
      <InspirationPage canContribute canManageLibrary mode="admin" />
    </AppShell>
  );
}

function StudioFeedbackRoute() {
  const [feedbackItems, setFeedbackItems] = useState<FeedbackRecord[]>([]);
  const [error, setError] = useState("");

  async function refresh(isErrorCurrent: () => boolean = () => true) {
    try {
      setFeedbackItems(await api.feedback());
      setError((current) => isErrorCurrent() ? "" : current);
    } catch (err) {
      setError((current) => isErrorCurrent() ? (err instanceof Error ? err.message : "Failed to load feedback") : current);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AppShell kind="studio" active="feedback">
      <FeedbackPage feedbackItems={feedbackItems} error={error} onRefresh={(isErrorCurrent) => void refresh(isErrorCurrent)} onSetError={setError} />
    </AppShell>
  );
}

function buildDashboardDateWindow(days: number): { startDate: string; endDate: string } {
  return buildBusinessDateWindow(days);
}

function DashboardRoute() {
  const query = useWindowQuery(() => {
    const range = buildDashboardDateWindow(7);
    return { dashboardStatsDays: 7, dashboardDateRange: range, groupSummaryRange: range, groupRangeFollowsDashboard: true };
  }, { dashboard: null as DashboardStats | null, groupSummaries: [] as UserGroupSummary[] }, async (params) => {
    const [dashboard, groupSummaries] = await Promise.all([
      api.dashboardStats(params.dashboardStatsDays),
      api.userGroupSummaries(params.groupSummaryRange.startDate, params.groupSummaryRange.endDate),
    ]);
    return { dashboard, groupSummaries };
  }, "加载运营看板失败");
  const { dashboardStatsDays, dashboardDateRange, groupSummaryRange, groupRangeFollowsDashboard } = query.params;
  const { dashboard, groupSummaries } = query.data;
  const lastSyncedAt = query.snapshot?.updatedAt ?? null;

  function handleChangeDays(days: number) {
    const range = buildDashboardDateWindow(days);
    query.setParams(current => ({ ...current, dashboardStatsDays: days, dashboardDateRange: range,
      groupSummaryRange: current.groupRangeFollowsDashboard ? range : current.groupSummaryRange }));
  }
  function handleApplyGroupSummaryRange(range: { startDate: string; endDate: string }) {
    query.setParams(current => ({ ...current, groupRangeFollowsDashboard: false, groupSummaryRange: range }));
  }
  function handleSyncGroupSummaryRange() {
    query.setParams(current => {
      const range = buildDashboardDateWindow(current.dashboardStatsDays);
      return { ...current, dashboardDateRange: range, groupRangeFollowsDashboard: true, groupSummaryRange: range };
    });
  }

  return (
    <AppShell kind="admin" active="dashboard">
      <DashboardPage
        dashboard={dashboard}
        groupSummaries={groupSummaries}
        userCanUseOpsViews={true}
        dashboardStatsDays={dashboardStatsDays}
        dashboardDateRange={dashboardDateRange}
        groupSummaryRange={groupSummaryRange}
        groupRangeFollowsDashboard={groupRangeFollowsDashboard}
        lastSyncedAt={lastSyncedAt}
        dataSource={query.snapshot?.params}
        loading={query.loading}
        queryError={query.error}
        onChangeDays={handleChangeDays}
        onApplyGroupSummaryRange={handleApplyGroupSummaryRange}
        onSyncGroupSummaryRange={handleSyncGroupSummaryRange}
        onRefresh={() => void query.refresh()}
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

  const refreshSequence = useRef(0);
  async function refresh(isErrorCurrent: () => boolean = () => true) {
    const sequence = ++refreshSequence.current;
    try {
      const [nextProviders, nextProfiles, nextPricingRules] = await Promise.all([
        api.providers(),
        api.providerProfiles(),
        api.providerPricingRules(),
      ]);
      if (sequence !== refreshSequence.current) return;
      setProviders(current => sequence === refreshSequence.current ? nextProviders : current);
      setProviderProfiles(current => sequence === refreshSequence.current ? nextProfiles : current);
      setPricingRules(current => sequence === refreshSequence.current ? nextPricingRules : current);
      setError(current => sequence === refreshSequence.current && isErrorCurrent() ? "" : current);
    } catch (err) {
      if (sequence === refreshSequence.current) setError(current => sequence === refreshSequence.current && isErrorCurrent() ? err instanceof Error ? err.message : "加载模型配置失败" : current);
    }
  }

  useEffect(() => {
    void refresh();
    return () => { refreshSequence.current += 1; };
  }, []);

  return (
    <AppShell kind="admin" active="models">
      <ModelsPage
        providerProfiles={providerProfiles}
        pricingRules={pricingRules}
        providers={providers}
        error={error}
        onRefresh={(guard) => refresh(guard)}
        onSetError={setError}
      />
    </AppShell>
  );
}

function PromptTemplatesRoute() {
  const query = useWindowQuery(() => 0, [] as PromptTemplateRecord[],
    () => api.adminPromptTemplates(), "加载模板提示词失败");
  return (
    <AppShell kind="admin" active="templates">
      <PromptTemplatesPage templates={query.data} error={query.error} onRefresh={query.refresh} onSetError={() => undefined} />
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

function AnnouncementsRoute() {
  const query = useWindowQuery(() => 0, [] as SiteAnnouncementRecord[],
    () => api.adminAnnouncements(), "加载公告失败");
  return (
    <AppShell kind="admin" active="announcements">
      <AnnouncementsPage
        announcements={query.data}
        error={query.error}
        onRefresh={query.refresh}
        onSetError={() => undefined}
      />
    </AppShell>
  );
}

function AiToolsNavRoute() {
  const [tools, setTools] = useState<AiToolRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .aiTools()
      .then((rows) => {
        if (cancelled) return;
        setTools(rows);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setTools([]);
        setError(err instanceof Error ? err.message : "加载工具导航失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell kind="studio" active="nav">
      <AiToolsNavPage tools={tools} loading={loading} error={error} />
    </AppShell>
  );
}

function AiToolsAdminRoute() {
  const query = useWindowQuery(() => 0, [] as AiToolRecord[],
    () => api.adminAiTools(), "加载工具导航失败");
  return (
    <AppShell kind="admin" active="ai-tools">
      <AiToolsAdminPage tools={query.data} error={query.error} onRefresh={query.refresh} onSetError={() => undefined} />
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
        key={templateId}
        editTemplateId={templateId}
        onExit={() => navigate("/admin/canvas-templates")}
      />
    </AppShell>
  );
}

function AgentsRoute() {
  const { currentUser, isGuest } = useAuth();
  const [clients, setClients] = useState<AgentClientRecord[]>([]);
  const [skills, setSkills] = useState<AgentOfficialSkill[]>([]);
  const [chatTools, setChatTools] = useState<AgentChatToolRecord[]>([]);
  const [releases, setReleases] = useState<AgentSkillReleaseRecord[]>([]);
  const [error, setError] = useState("");
  const owner = useMemo(() => ({ active: false, sequence: 0 }), [currentUser?.id, currentUser?.name, isGuest]);
  useLayoutEffect(() => {
    owner.active = true; setClients([]); setSkills([]); setChatTools([]); setReleases([]); setError("");
    return () => { owner.active = false; owner.sequence += 1; };
  }, [owner]);
  async function refresh(isErrorCurrent: () => boolean = () => true) {
    if (!owner.active) return;
    const sequence = ++owner.sequence, allowed = () => owner.active && sequence === owner.sequence;
    try {
      const [nextClients, nextSkills, nextChatTools, nextReleases] = await Promise.all([
        api.agentClients(), api.officialSkills(), api.agentChatTools(), api.agentSkillReleases(),
      ]);
      if (!allowed()) return;
      setClients(current => allowed() ? nextClients : current);
      setSkills(current => allowed() ? nextSkills : current);
      setChatTools(current => allowed() ? nextChatTools : current);
      setReleases(current => allowed() ? nextReleases : current);
      setError(current => allowed() && isErrorCurrent() ? "" : current);
    } catch (err) {
      if (!allowed()) return;
      setError(current => allowed() && isErrorCurrent() ? err instanceof Error ? err.message : "Failed to load agent operations data" : current);
      throw err;
    }
  }
  useEffect(() => { void refresh().catch(() => {}); }, [owner]);
  return (
    <AppShell kind="admin" active="agents">
      <AgentOpsPage
        clients={clients}
        skills={skills}
        chatTools={chatTools}
        releases={releases}
        error={error}
        onRefresh={refresh}
        onSetError={setError}
      />
    </AppShell>
  );
}

function AdminFeedbackRoute() {
  const query = useWindowQuery(() => 0, [] as FeedbackRecord[],
    () => api.adminFeedback(), "Failed to load feedback inbox");
  return (
    <AppShell kind="admin" active="feedback">
      <FeedbackOpsPage feedbackItems={query.data} error={query.error ? `人工反馈刷新失败：${query.error}` : ""}
        onRefresh={query.refresh} onSetError={() => undefined} />
    </AppShell>
  );
}

function SettingsRoute() {
  const { canManageUsers, currentUser, isGuest } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfileRecord[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettingsRecord | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const owner = useMemo(() => ({ active: false, sequence: 0 }), [currentUser?.id, currentUser?.name, isGuest, canManageUsers]);
  useLayoutEffect(() => {
    owner.active = true;
    setTasks([]); setProviderProfiles([]); setUsers([]); setPlatformSettings(null); setRefreshError("");
    return () => { owner.active = false; owner.sequence += 1; };
  }, [owner]);

  async function refresh() {
    if (!owner.active) return;
    const sequence = ++owner.sequence;
    const allowed = () => owner.active && sequence === owner.sequence;
    try {
      const [nextTasks, nextProfiles, nextUsers, nextPlatformSettings] = await Promise.all([
        api.tasks(), api.providerProfiles(), canManageUsers ? api.users() : Promise.resolve([]), api.platformSettings(),
      ]);
      if (!allowed()) return;
      setTasks(current => allowed() ? nextTasks : current);
      setProviderProfiles(current => allowed() ? nextProfiles : current);
      setUsers(current => allowed() ? nextUsers : current);
      setPlatformSettings(current => allowed() ? nextPlatformSettings : current);
      setRefreshError(current => allowed() ? "" : current);
    } catch (error) {
      if (!allowed()) return;
      setRefreshError(current => allowed() ? error instanceof Error ? error.message : "刷新设置失败" : current);
      throw error;
    }
  }
  useEffect(() => { void refresh().catch(() => {}); }, [owner]);

  return (
    <AppShell kind="admin" active="settings">
      <SettingsPage
        userCanManageUsers={canManageUsers}
        userCanUseOpsViews={true}
        tasks={tasks}
        providerProfiles={providerProfiles}
        users={users}
        platformSettings={platformSettings}
        onRefresh={refresh}
        refreshError={refreshError}
      />
    </AppShell>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/management/projects" element={<ProtectedRoute><CompanyManagementRoute /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/studio/generate" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/studio/generate" element={<ProtectedRoute><GeneratePage /></ProtectedRoute>} />
          <Route
            path="/studio/cad"
            element={
              <ProtectedRoute>
                <OtherToolsPage tool="cad" />
              </ProtectedRoute>
            }
          />
          <Route path="/studio/other" element={<ProtectedRoute><OtherToolsPage /></ProtectedRoute>} />
          <Route path="/studio/gif" element={<ProtectedRoute><OtherToolsPage tool="gif" /></ProtectedRoute>} />
          <Route
            path="/studio/library"
            element={
              <ProtectedRoute>
                <AppShell kind="studio" active="library">
                  <AssetLibraryPage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route path="/studio/inspiration" element={<ProtectedRoute><InspirationRoute /></ProtectedRoute>} />
          <Route path="/studio/feedback" element={<ProtectedRoute><StudioFeedbackRoute /></ProtectedRoute>} />
          <Route path="/studio/nav" element={<ProtectedRoute><AiToolsNavRoute /></ProtectedRoute>} />
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
            path="/admin/generation-analytics"
            element={
              <ProtectedRoute>
                <AdminOnlyRoute>
                  <AppShell kind="admin" active="generation-analytics">
                    <GenerationAnalyticsPage />
                  </AppShell>
                </AdminOnlyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/chat-experience"
            element={
              <ProtectedRoute>
                <AdminOnlyRoute>
                  <AppShell kind="admin" active="chat-experience">
                    <ChatExperiencePage />
                  </AppShell>
                </AdminOnlyRoute>
              </ProtectedRoute>
            }
          />
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
          <Route
            path="/admin/cad-usage"
            element={
              <ProtectedRoute>
                <AdminOnlyRoute>
                  <AppShell kind="admin" active="cad-usage">
                    <CadUsagePage />
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
          <Route path="/admin/announcements" element={<ProtectedRoute><AdminModuleRoute module="announcements"><AnnouncementsRoute /></AdminModuleRoute></ProtectedRoute>} />
          <Route path="/admin/ai-tools" element={<ProtectedRoute><AdminModuleRoute module="ai-tools"><AiToolsAdminRoute /></AdminModuleRoute></ProtectedRoute>} />
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
