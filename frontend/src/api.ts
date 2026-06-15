export type Workflow = {
  id: number;
  key: string;
  name: string;
  description: string;
  category: string;
  priority: string;
  version: string;
  provider_capability: string;
  config: Record<string, unknown>;
};

export type Task = {
  id: number;
  title: string;
  status: string;
  workflow_key: string;
  workflow_name: string;
  project_code: string;
  user_name: string;
  requested_provider: string;
  classification: string;
  cost: number;
  cost_currency: string;
  latency_ms: number;
  result: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Asset = {
  id: number;
  name: string;
  asset_type: string;
  source_task_id: number | null;
  storage_path: string;
  prompt_text: string | null;
  like_count: number;
  share_count: number;
  bookmark_count: number;
  is_bookmarked: boolean;
  inspiration_post_id: number | null;
  is_shared_to_inspiration: boolean;
  tags: string[];
  created_at: string;
};

export type AssetShareResult = {
  asset: Asset;
  inspiration_post_id: number;
  already_shared: boolean;
};

export type Provider = {
  provider_name: string;
  display_name: string;
  model_name: string;
  capabilities: string[];
  configurable: boolean;
  outbound: boolean;
  adapter_kind: string;
};

export type AuthUser = {
  id: number;
  name: string;
  display_name: string;
  group_name: string;
  role: string;
  project_codes: string[];
  is_active: boolean;
  monthly_quota: number | null;
  billing_plan: string;
  billing_status: string;
  quota_policy: string;
  quota_reset_cycle: string;
};

export type LoginResponse = {
  token: string;
  expires_at: string;
  user: AuthUser;
};

export type ManagedUser = {
  id: number;
  name: string;
  display_name: string;
  group_name: string;
  role: string;
  is_active: boolean;
  monthly_quota: number | null;
  billing_plan: string;
  billing_status: string;
  quota_policy: string;
  quota_reset_cycle: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

export type UserCreatePayload = {
  name: string;
  password: string;
  display_name: string;
  group_name: string;
  role: string;
  is_active: boolean;
  monthly_quota: number | null;
  billing_plan: string;
  billing_status: string;
  quota_policy: string;
  quota_reset_cycle: string;
};

export type UserUpdatePayload = Partial<
  Pick<
    UserCreatePayload,
    | "display_name"
    | "group_name"
    | "role"
    | "is_active"
    | "monthly_quota"
    | "billing_plan"
    | "billing_status"
    | "quota_policy"
    | "quota_reset_cycle"
  >
>;

export type UserGroupCurrencySpend = {
  currency: string;
  total_cost: number;
};

export type UserGroupMemberSpend = {
  user_id: number;
  user_name: string;
  display_name: string;
  is_active: boolean;
  total_cost: number;
  cost_by_currency: UserGroupCurrencySpend[];
};

export type UserGroupSummary = {
  group_name: string;
  user_count: number;
  enabled_user_count: number;
  total_cost: number;
  cost_by_currency: UserGroupCurrencySpend[];
  members: UserGroupMemberSpend[];
};

export type DashboardDailyPoint = {
  date: string;
  total_tasks: number;
  successful_tasks: number;
  failed_tasks: number;
  total_cost: number;
  image_generate_count: number;
  image_edit_count: number;
  video_generate_count: number;
  image_output_count: number;
  chat_turn_count: number;
  chat_input_tokens: number;
  chat_output_tokens: number;
  chat_cached_input_tokens: number;
  chat_total_tokens: number;
};

export type DashboardModelCallSlice = {
  model_name: string;
  count: number;
};

export type DashboardDayModelCalls = {
  date: string;
  slices: DashboardModelCallSlice[];
};

export type DashboardExecutionRanking = {
  user_name: string;
  image_generate_count: number;
  image_edit_count: number;
  video_generate_count: number;
  image_output_count: number;
  chat_turn_count: number;
  chat_input_tokens: number;
  chat_output_tokens: number;
  chat_cached_input_tokens: number;
  chat_prompt_tokens: number;
  chat_completion_tokens: number;
  chat_total_tokens: number;
  last_activity_at: string | null;
};

export type DashboardCurrencySpend = {
  currency: string;
  total_cost: number;
};

export type DashboardAccountUsage = {
  name: string;
  display_name: string;
  group_name: string;
  role: string;
  is_active: boolean;
  project_codes: string[];
  quota_limit: number | null;
  quota_used: number;
  quota_currency: string;
  quota_remaining: number | null;
  quota_status: string;
  billing_plan: string;
  billing_status: string;
  quota_policy: string;
  quota_reset_cycle: string;
  total_tasks: number;
  successful_tasks: number;
  failed_tasks: number;
  success_rate: number;
  average_latency_ms: number;
  provider_calls: Array<Record<string, unknown>>;
  model_calls: Array<Record<string, unknown>>;
  cost_by_currency: DashboardCurrencySpend[];
  last_task_at: string | null;
  last_activity_at: string | null;
  image_generate_count: number;
  image_edit_count: number;
  video_generate_count: number;
  image_output_count: number;
  chat_turn_count: number;
  chat_input_tokens: number;
  chat_output_tokens: number;
  chat_cached_input_tokens: number;
  chat_prompt_tokens: number;
  chat_completion_tokens: number;
  chat_total_tokens: number;
};

export type DashboardStats = {
  active_workflows: number;
  total_tasks: number;
  successful_tasks: number;
  failed_tasks: number;
  success_rate: number;
  average_cost: number;
  average_latency_ms: number;
  audit_coverage_rate: number;
  outbound_tasks: number;
  total_cost: number;
  cost_unit: string;
  cost_formula: string;
  cost_notes: string[];
  cost_by_currency: Array<Record<string, unknown>>;
  user_rankings: Array<Record<string, unknown>>;
  project_rankings: Array<Record<string, unknown>>;
  provider_rankings: Array<Record<string, unknown>>;
  model_rankings: Array<Record<string, unknown>>;
  failure_reasons: Array<Record<string, unknown>>;
  account_usage: DashboardAccountUsage[];
  daily_series: DashboardDailyPoint[];
  model_calls_by_day: DashboardDayModelCalls[];
  today_image_generate_count: number;
  week_image_generate_count: number;
  today_video_generate_count: number;
  week_video_generate_count: number;
  window_chat_turn_count: number;
  window_chat_input_tokens: number;
  window_chat_output_tokens: number;
  window_chat_cached_input_tokens: number;
  window_chat_prompt_tokens: number;
  window_chat_completion_tokens: number;
  window_chat_total_tokens: number;
  execution_rankings: DashboardExecutionRanking[];
};

export type UsageLogRecord = {
  id: number;
  recorded_at: string;
  user_name: string;
  user_display_name: string;
  group_name: string;
  entry_type: string;
  usage_kind: string;
  is_success: boolean;
  model_name: string;
  provider_name: string;
  requested_provider: string;
  capability: string;
  project_code: string;
  project_name: string;
  task_id: number | null;
  task_status: string | null;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  total_tokens: number;
  output_count: number;
  cost: number;
  cost_currency: string;
  billing_unit: string;
  billable_units: number;
  error_code: string;
  error_summary: string;
  source_table: string;
  source_id: number;
  detail_text: string;
};

export type UsageLogPage = {
  items: UsageLogRecord[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  window_cost_by_currency: DashboardCurrencySpend[];
};

export type UsageLogQuery = {
  page?: number;
  page_size?: number;
  start_at?: string;
  end_at?: string;
  user_name?: string;
  group_name?: string;
  model_name?: string;
  provider_name?: string;
  capability?: string;
  entry_type?: string;
  status?: string;
  include_task_summary?: boolean;
};

export type ProviderProfileRecord = {
  id: number;
  provider_name: string;
  display_name: string;
  base_url: string;
  model_name: string;
  adapter_kind: string;
  capabilities: string[];
  strategies: Record<string, string>;
  adapter_config: Record<string, unknown>;
  quality: string;
  output_format: string;
  timeout_seconds: number;
  pricing_currency: string;
  pricing_unit: string;
  unit_price: number;
  enabled: boolean;
  reference_mode: string;
  reference_caption_model: string | null;
  has_api_key: boolean;
  masked_api_key: string;
  created_at: string;
  updated_at: string;
};

export type ProviderProfileProbeResult = {
  ok: boolean;
  status: string;
  detail: string;
  checked_url: string | null;
  checked_at: string;
};

export type ProviderProfileCreatePayload = {
  provider_name: string;
  display_name: string;
  api_key: string;
  api_secret?: string;
  base_url: string;
  model_name: string;
  adapter_kind: string;
  capabilities: string[];
  strategies?: Record<string, string>;
  adapter_config?: Record<string, unknown>;
  quality: string;
  output_format: string;
  timeout_seconds: number;
  pricing_currency: string;
  pricing_unit: string;
  unit_price: number;
  enabled: boolean;
  reference_mode: string;
  reference_caption_model: string | null;
};

export type ProviderProfileUpdatePayload = Partial<Omit<ProviderProfileCreatePayload, "provider_name">>;

export type ProviderPricingRuleRecord = {
  id: number;
  provider_profile_id: number;
  capability: string;
  metric: string;
  unit_size: number;
  unit_price: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProviderPricingRuleCreatePayload = {
  provider_profile_id: number;
  capability: string;
  metric: string;
  unit_size: number;
  unit_price: number;
  currency: string;
  is_active: boolean;
};

export type ProviderPricingRuleUpdatePayload = Partial<ProviderPricingRuleCreatePayload>;

export type DiscoveredModel = {
  model_id: string;
  owned_by: string;
  already_exists: boolean;
};

export type ProviderDiscoverResult = {
  base_url: string;
  models: DiscoveredModel[];
};

export type ProviderBulkImportItem = {
  model_id: string;
  provider_name: string;
  display_name?: string;
  capabilities: string[];
  adapter_kind: string;
  reference_mode: string;
  strategies?: Record<string, string>;
};

export type ProviderBulkImportPayload = {
  base_url: string;
  api_key: string;
  models: ProviderBulkImportItem[];
};

export type ProviderBulkImportResult = {
  created: string[];
  skipped: string[];
};

export type Project = {
  id: number;
  name: string;
  code: string;
  classification: string;
  can_manage: boolean;
  current_phase: string | null;
  phase_status: string | null;
  last_updated: string | null;
  summary: string | null;
  next_action: string | null;
};

export type InspirationPost = {
  id: number;
  title: string;
  description: string;
  source_image_path: string;
  image_path: string;
  media_type: string;
  category: string;
  tags: string[];
  source_type: string;
  source_name: string;
  source_url: string;
  prompt_text: string | null;
  model_name: string;
  like_count: number;
  view_count: number;
  user_name: string | null;
  created_at: string;
};

export type ProjectMilestone = {
  id: string;
  name: string;
  title: string;
  status: string;
  owner: string;
  target_date: string;
  notes: string;
};

export type ProjectStatus = {
  code: string;
  name: string;
  current_phase: string | null;
  phase_status: string | null;
  last_updated: string | null;
  goals: string[];
  progress: string[];
  risks: string[];
  decisions: string[];
  next_actions: string[];
  status_file: string;
  milestones_file: string;
  milestones: ProjectMilestone[];
};

export type TaskCreatePayload = {
  title: string;
  workflow_key: string;
  project_code: string;
  requested_provider: string;
  classification: string;
  payload: Record<string, unknown>;
};

export type PromptTemplateRecord = {
  id: number;
  user_name: string;
  scope: "private" | "shared";
  can_manage: boolean;
  category: string;
  subcategory: string;
  is_featured: boolean;
  label: string;
  title: string;
  prompt: string;
  style: string;
  aspect_ratio: string;
  resolution: string;
  deliverable: string;
  notes: string;
  source_image_path: string;
  preview_image_path: string;
  popularity_score: number;
  recent_apply_count: number;
  recent_submit_success_count: number;
  created_at: string;
  updated_at: string;
};

export type PromptTemplateCreatePayload = {
  category: string;
  subcategory: string;
  is_featured: boolean;
  label: string;
  title: string;
  prompt: string;
  style: string;
  aspect_ratio: string;
  resolution: string;
  deliverable: string;
  notes: string;
  source_image_path: string;
  preview_image_path: string;
};

export type PromptTemplateUpdatePayload = Partial<PromptTemplateCreatePayload>;

export type PromptTemplateEventPayload = {
  event_type: string;
  context: string;
};

export type ReferenceUploadPayload = {
  file_name: string;
  data_url: string;
};

export type ReferenceUploadResponse = {
  file_name: string;
  storage_path: string;
};

export type AgentClientRecord = {
  id: number;
  key: string;
  display_name: string;
  device_id: string;
  environment: string;
  user_name: string | null;
  role: string;
  project_codes: string[];
  capabilities: string[];
  is_active: boolean;
  last_seen_at: string | null;
  last_request_id: string;
  created_at: string;
  updated_at: string;
};

export type AgentOfficialSkill = {
  key: string;
  name: string;
  version: string;
  description: string;
  author: string;
  path: string;
  inputs: string[];
  outputs: string[];
};

export type AgentSkillReleaseRecord = {
  id: number;
  key: string;
  display_name: string;
  environment: "test" | "prod";
  openclaw_version: string;
  skill_keys: string[];
  notes: string;
  is_active: boolean;
  created_by_user_name: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentSkillReleaseCreatePayload = {
  key: string;
  display_name: string;
  environment: "test" | "prod";
  openclaw_version: string;
  skill_keys: string[];
  notes: string;
  is_active: boolean;
};

export type AgentSkillReleaseUpdatePayload = Partial<AgentSkillReleaseCreatePayload>;

export type FeedbackRecord = {
  id: number;
  user_id: number;
  user_name: string;
  user_display_name: string;
  title: string;
  message: string;
  attachment_paths: string[];
  status: "open" | "replied" | "closed";
  admin_reply: string;
  replied_by_user_name: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FeedbackCreatePayload = {
  title: string;
  message: string;
  attachment_paths: string[];
};

export type FeedbackAdminUpdatePayload = {
  status: "open" | "replied" | "closed";
  admin_reply: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE ?? "/api/v1").replace(/\/$/, "");
const AUTH_STORAGE_KEY = "qmdh.session.token";
const LEGACY_AUTH_USER = import.meta.env.VITE_QMDH_LEGACY_USER ?? "";
const LEGACY_AUTH_TOKEN = import.meta.env.VITE_QMDH_LEGACY_AUTH_TOKEN ?? "";

export function getStoredAuthToken(): string {
  return window.localStorage.getItem(AUTH_STORAGE_KEY) ?? "";
}

export function setStoredAuthToken(token: string): void {
  window.localStorage.setItem(AUTH_STORAGE_KEY, token);
}

export function clearStoredAuthToken(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getStoredAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  if (LEGACY_AUTH_TOKEN) {
    return {
      "X-QMDH-User": LEGACY_AUTH_USER,
      "X-QMDH-Auth": LEGACY_AUTH_TOKEN
    };
  }
  return {};
}

export function buildApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function getAuthHeaders(): Record<string, string> {
  return authHeaders();
}

async function buildError(response: Response): Promise<Error> {
  let detail = "";
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as { detail?: string };
      detail = payload.detail ?? "";
    } catch {
      detail = "";
    }
  }

  if (detail) {
    return new Error(`请求失败（${response.status}）：${detail}`);
  }

  if (response.status === 413) {
    return new Error("上传图片过大，请将单张图片压缩到 10MB 以内后重试。");
  }

  if (response.status >= 500) {
    return new Error(`请求失败（${response.status}）：后端服务暂时不可用，请确认本地 API 已启动。`);
  }

  return new Error(`请求失败（${response.status}）：${response.statusText || "未知错误"}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(buildApiUrl(path), {
      ...init,
      headers: {
        ...authHeaders(),
        ...(init?.headers as Record<string, string> | undefined)
      }
    });
  } catch {
    throw new Error("无法连接到后端服务，请确认本地 API 已启动。");
  }

  if (!response.ok) {
    throw await buildError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function patchJson<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function deleteRequest(path: string): Promise<void> {
  await request<void>(path, { method: "DELETE" });
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const api = {
  login: async (username: string, password: string) => {
    const response = await fetch(buildApiUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) {
      throw await buildError(response);
    }
    return response.json() as Promise<LoginResponse>;
  },
  logout: () => postJson<void>("/auth/logout"),
  me: () => request<AuthUser>("/auth/me"),
  users: () => request<ManagedUser[]>("/users"),
  userGroupSummaries: (startDate?: string, endDate?: string) =>
    request<UserGroupSummary[]>(`/users/groups/summary${buildQuery({ start_date: startDate, end_date: endDate })}`),
  exportUserGroupSummariesCsv: async (startDate?: string, endDate?: string) => {
    const response = await fetch(
      buildApiUrl(`/users/groups/summary/export${buildQuery({ start_date: startDate, end_date: endDate })}`),
      {
        headers: authHeaders(),
      },
    );
    if (!response.ok) {
      throw await buildError(response);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    const suffix = [startDate, endDate].filter(Boolean).join("_") || today;
    anchor.href = url;
    anchor.download = `group-spend-${suffix}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  },
  feedback: () => request<FeedbackRecord[]>("/feedback"),
  createFeedback: (payload: FeedbackCreatePayload) => postJson<FeedbackRecord>("/feedback", payload),
  adminFeedback: () => request<FeedbackRecord[]>("/feedback/admin"),
  replyFeedback: (feedbackId: number, payload: FeedbackAdminUpdatePayload) =>
    patchJson<FeedbackRecord>(`/feedback/admin/${feedbackId}`, payload),
  agentClients: () => request<AgentClientRecord[]>("/agent/admin/clients"),
  officialSkills: () => request<AgentOfficialSkill[]>("/agent/admin/skills"),
  agentSkillReleases: () => request<AgentSkillReleaseRecord[]>("/agent/admin/releases"),
  createAgentSkillRelease: (payload: AgentSkillReleaseCreatePayload) =>
    postJson<AgentSkillReleaseRecord>("/agent/admin/releases", payload),
  updateAgentSkillRelease: (releaseId: number, payload: AgentSkillReleaseUpdatePayload) =>
    patchJson<AgentSkillReleaseRecord>(`/agent/admin/releases/${releaseId}`, payload),
  createUser: (payload: UserCreatePayload) => postJson<ManagedUser>("/users", payload),
  updateUser: (userId: number, payload: UserUpdatePayload) => patchJson<ManagedUser>(`/users/${userId}`, payload),
  resetUserPassword: (userId: number, password: string) =>
    postJson<ManagedUser>(`/users/${userId}/reset-password`, { password }),
  deleteUser: (userId: number) => deleteRequest(`/users/${userId}`),
  dashboardStats: (days = 30) => {
    const d = Math.min(365, Math.max(1, Math.floor(days)));
    return request<DashboardStats>(`/dashboard/stats?days=${d}`);
  },
  usageLogs: (query: UsageLogQuery = {}) => {
    const params = new URLSearchParams();
    if (query.page) params.set("page", String(query.page));
    if (query.page_size) params.set("page_size", String(query.page_size));
    if (query.start_at) params.set("start_at", query.start_at);
    if (query.end_at) params.set("end_at", query.end_at);
    if (query.user_name) params.set("user_name", query.user_name);
    if (query.group_name) params.set("group_name", query.group_name);
    if (query.model_name) params.set("model_name", query.model_name);
    if (query.provider_name) params.set("provider_name", query.provider_name);
    if (query.capability) params.set("capability", query.capability);
    if (query.entry_type) params.set("entry_type", query.entry_type);
    if (query.status) params.set("status", query.status);
    if (query.include_task_summary === false) params.set("include_task_summary", "false");
    const suffix = params.toString();
    return request<UsageLogPage>(`/dashboard/usage-logs${suffix ? `?${suffix}` : ""}`);
  },
  health: () => request<{ status: string; service: string }>("/health"),
  projects: () => request<Project[]>("/projects"),
  createProject: (name: string, classification?: string) =>
    postJson<Project>("/projects", { name, classification: classification || "B" }),
  renameProject: (projectCode: string, name: string) =>
    patchJson<Project>(`/projects/${projectCode}`, { name }),
  deleteProject: (projectCode: string) =>
    deleteRequest(`/projects/${projectCode}`),
  projectStatus: (projectCode: string) => request<ProjectStatus>(`/projects/${projectCode}/status`),
  providers: () => request<Provider[]>("/providers"),
  providerProfiles: () => request<ProviderProfileRecord[]>("/providers/profiles"),
  providerPricingRules: () => request<ProviderPricingRuleRecord[]>("/providers/pricing-rules"),
  probeProviderProfile: (profileId: number) =>
    postJson<ProviderProfileProbeResult>(`/providers/profiles/${profileId}/probe`, {}),
  discoverProviderModels: (baseUrl: string, apiKey: string) =>
    postJson<ProviderDiscoverResult>("/providers/discover", { base_url: baseUrl, api_key: apiKey }),
  bulkImportProviderProfiles: (payload: ProviderBulkImportPayload) =>
    postJson<ProviderBulkImportResult>("/providers/bulk-import", payload),
  createProviderProfile: (payload: ProviderProfileCreatePayload) =>
    postJson<ProviderProfileRecord>("/providers/profiles", payload),
  updateProviderProfile: (profileId: number, payload: ProviderProfileUpdatePayload) =>
    patchJson<ProviderProfileRecord>(`/providers/profiles/${profileId}`, payload),
  deleteProviderProfile: (profileId: number) =>
    deleteRequest(`/providers/profiles/${profileId}`),
  createProviderPricingRule: (payload: ProviderPricingRuleCreatePayload) =>
    postJson<ProviderPricingRuleRecord>("/providers/pricing-rules", payload),
  updateProviderPricingRule: (ruleId: number, payload: ProviderPricingRuleUpdatePayload) =>
    patchJson<ProviderPricingRuleRecord>(`/providers/pricing-rules/${ruleId}`, payload),
  deleteProviderPricingRule: (ruleId: number) =>
    deleteRequest(`/providers/pricing-rules/${ruleId}`),
  workflows: () => request<Workflow[]>("/workflows"),
  tasks: () => request<Task[]>("/tasks"),
  assets: () => request<Asset[]>("/assets"),
  promptTemplates: () =>
    request<PromptTemplateRecord[]>("/prompt-templates"),
  adminPromptTemplates: () =>
    request<PromptTemplateRecord[]>("/prompt-templates/admin/shared"),
  createPromptTemplate: (payload: PromptTemplateCreatePayload) =>
    postJson<PromptTemplateRecord>("/prompt-templates", payload),
  createAdminPromptTemplate: (payload: PromptTemplateCreatePayload) =>
    postJson<PromptTemplateRecord>("/prompt-templates/admin/shared", payload),
  updatePromptTemplate: (templateId: number, payload: PromptTemplateUpdatePayload) =>
    patchJson<PromptTemplateRecord>(`/prompt-templates/${templateId}`, payload),
  updateAdminPromptTemplate: (templateId: number, payload: PromptTemplateUpdatePayload) =>
    patchJson<PromptTemplateRecord>(`/prompt-templates/admin/shared/${templateId}`, payload),
  deletePromptTemplate: (templateId: number) =>
    deleteRequest(`/prompt-templates/${templateId}`),
  deleteAdminPromptTemplate: (templateId: number) =>
    deleteRequest(`/prompt-templates/admin/shared/${templateId}`),
  trackPromptTemplateEvent: (templateId: number, payload: PromptTemplateEventPayload) =>
    postJson<void>(`/prompt-templates/${templateId}/events`, payload),
  uploadReferenceImage: (payload: ReferenceUploadPayload) =>
    postJson<ReferenceUploadResponse>("/assets/reference-upload", payload),
  uploadChatAttachment: (payload: ReferenceUploadPayload) =>
    postJson<{ file_name: string; storage_path: string; mime_type: string; kind: "image" | "file" }>(
      "/chat/attachments/upload",
      payload,
    ),
  createTask: (payload: TaskCreatePayload) => postJson<Task>("/tasks", payload),
  deleteTask: (taskId: number) => deleteRequest(`/tasks/${taskId}`),
  likeAsset: (assetId: number) => postJson<Asset>(`/assets/${assetId}/like`),
  bookmarkAsset: (assetId: number) => postJson<Asset>(`/assets/${assetId}/bookmark`),
  shareAsset: (assetId: number, payload: { confirmed: boolean }) => postJson<AssetShareResult>(`/assets/${assetId}/share`, payload),
  inspiration: (category?: string) => request<InspirationPost[]>(category && category !== "全部" ? `/inspiration?category=${encodeURIComponent(category)}` : "/inspiration"),
  createInspiration: (payload: { title: string; description?: string; source_image_path?: string; image_path?: string; category?: string; tags?: string[]; source_type: string; source_name?: string; source_url?: string; source_asset_id?: number; prompt_text?: string; model_name?: string }) =>
    postJson<InspirationPost>("/inspiration", payload),
  likeInspiration: (postId: number) => postJson<InspirationPost>(`/inspiration/${postId}/like`),
  deleteInspiration: (postId: number) => deleteRequest(`/inspiration/${postId}`),
  updateInspiration: (postId: number, data: { title?: string; description?: string; source_image_path?: string; image_path?: string; category?: string; tags?: string[]; source_url?: string; source_name?: string }) =>
    request<InspirationPost>(`/inspiration/${postId}`, { method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  extractImages: (url: string) => postJson<{ images: string[]; title: string }>("/inspiration/extract-images", { url }),
  // Chat
  getChatModels: () =>
    request<{ provider_id: number; provider_name: string; display_name: string; model_name: string; base_url: string }[]>(
      "/chat/models"
    ),
  getChatConversations: () => request<{ id: number; title: string; model_provider_id: number | null; created_at: string; updated_at: string }[]>("/chat/conversations"),
  createChatConversation: (model_provider_id: number, title?: string) => postJson<{ id: number; title: string; model_provider_id: number | null; created_at: string; updated_at: string }>("/chat/conversations", { model_provider_id, title: title || "" }),
  getChatMessages: (convId: number) =>
    request<
      {
        id: number;
        role: string;
        content: string;
        attachments: { file_name: string; mime_type: string; url: string; storage_path: string; kind: "image" | "file" }[];
        created_at: string;
      }[]
    >(`/chat/conversations/${convId}/messages`),
  deleteChatConversation: (convId: number) => deleteRequest(`/chat/conversations/${convId}`),
  exportChatMessageWord: async (
    convId: number,
    payload: { message_id?: number; content?: string; file_name?: string },
  ) => {
    const response = await fetch(buildApiUrl(`/chat/conversations/${convId}/messages/export-word`), {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw await buildError(response);
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition");
    const utf8Match = disposition?.match(/filename\*=UTF-8''([^;]+)/i);
    const asciiMatch = disposition?.match(/filename="([^"]+)"/i);
    let fileName = "chat-reply.docx";
    if (utf8Match?.[1]) {
      try {
        fileName = decodeURIComponent(utf8Match[1]);
      } catch {
        fileName = asciiMatch?.[1] ?? fileName;
      }
    } else if (asciiMatch?.[1]) {
      fileName = asciiMatch[1];
    }
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  },
  search: (params: { q: string; domain: "inspiration" | "templates"; limit?: number }) => {
    const query = new URLSearchParams({
      q: params.q,
      domain: params.domain,
      limit: String(params.limit ?? 20),
    });
    return request<{
      domain: string;
      query: string;
      engine: string;
      hits: { id: number; domain: string; title: string; snippet: string; category: string; tags: string[]; score: number }[];
    }>(`/search?${query.toString()}`);
  },
  searchSync: () =>
    postJson<{
      inspiration_documents: number;
      template_documents: number;
      engine: string;
    }>("/search/sync"),
  searchStatus: () =>
    request<{
      meilisearch_enabled: boolean;
      meilisearch_reachable: boolean;
      meilisearch_status: string;
      engine: string;
      inspiration_index: string;
      templates_index: string;
    }>("/search/status"),
  studioAgentAssist: (payload: { message: string; provider_id: number }) =>
    postJson<{ reply: string; provider_name: string; model_name: string }>("/studio-agent/assist", payload),
};
