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
  tags: string[];
  created_at: string;
};

export type Provider = {
  provider_name: string;
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
  role: string;
  project_codes: string[];
  is_active: boolean;
  monthly_quota: number | null;
};

export type LoginResponse = {
  token: string;
  expires_at: string;
  user: AuthUser;
};

export type ManagedUser = AuthUser & {
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

export type UserCreatePayload = {
  name: string;
  password: string;
  display_name: string;
  role: string;
  project_codes: string[];
  is_active: boolean;
  monthly_quota: number | null;
};

export type UserUpdatePayload = Partial<
  Pick<UserCreatePayload, "display_name" | "role" | "project_codes" | "is_active" | "monthly_quota">
>;

export type DashboardDailyPoint = {
  date: string;
  total_tasks: number;
  successful_tasks: number;
  failed_tasks: number;
  total_cost: number;
};

export type DashboardModelCallSlice = {
  model_name: string;
  count: number;
};

export type DashboardDayModelCalls = {
  date: string;
  slices: DashboardModelCallSlice[];
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
  account_usage: Array<Record<string, unknown>>;
  daily_series: DashboardDailyPoint[];
  model_calls_by_day: DashboardDayModelCalls[];
};

export type ProviderProfileRecord = {
  id: number;
  provider_name: string;
  base_url: string;
  model_name: string;
  adapter_kind: string;
  capabilities: string[];
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
  editable_api_key?: string | null;
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
  api_key: string;
  base_url: string;
  model_name: string;
  adapter_kind: string;
  capabilities: string[];
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
  capabilities: string[];
  adapter_kind: string;
  reference_mode: string;
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
  current_phase: string | null;
  phase_status: string | null;
  last_updated: string | null;
  summary: string | null;
  next_action: string | null;
};

export type ProjectMember = {
  id: number;
  name: string;
  display_name: string;
  role: string;
  is_global: boolean;
};

export type InspirationPost = {
  id: number;
  title: string;
  description: string;
  image_path: string;
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
  label: string;
  title: string;
  prompt: string;
  style: string;
  aspect_ratio: string;
  resolution: string;
  deliverable: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type PromptTemplateCreatePayload = {
  label: string;
  title: string;
  prompt: string;
  style: string;
  aspect_ratio: string;
  resolution: string;
  deliverable: string;
  notes: string;
};

export type PromptTemplateUpdatePayload = Partial<PromptTemplateCreatePayload>;

export type ReferenceUploadPayload = {
  file_name: string;
  data_url: string;
};

export type ReferenceUploadResponse = {
  file_name: string;
  storage_path: string;
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

  if (response.status >= 500) {
    return new Error(`请求失败（${response.status}）：后端服务暂时不可用，请确认本地 API 已启动。`);
  }

  return new Error(`请求失败（${response.status}）：${response.statusText || "未知错误"}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
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

export const api = {
  login: async (username: string, password: string) => {
    const response = await fetch(`${API_BASE}/auth/login`, {
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
  usersBrief: () => request<{ id: number; name: string; display_name: string; role: string; is_active: boolean }[]>("/users/brief"),
  createUser: (payload: UserCreatePayload) => postJson<ManagedUser>("/users", payload),
  updateUser: (userId: number, payload: UserUpdatePayload) => patchJson<ManagedUser>(`/users/${userId}`, payload),
  resetUserPassword: (userId: number, password: string) =>
    postJson<ManagedUser>(`/users/${userId}/reset-password`, { password }),
  deleteUser: (userId: number) => deleteRequest(`/users/${userId}`),
  dashboardStats: (days = 30) => {
    const d = Math.min(365, Math.max(1, Math.floor(days)));
    return request<DashboardStats>(`/dashboard/stats?days=${d}`);
  },
  health: () => request<{ status: string; service: string }>("/health"),
  projects: () => request<Project[]>("/projects"),
  createProject: (name: string, code: string, classification?: string) =>
    postJson<Project>("/projects", { name, code, classification: classification || "B" }),
  renameProject: (projectCode: string, name: string) =>
    patchJson<Project>(`/projects/${projectCode}`, { name }),
  deleteProject: (projectCode: string) =>
    deleteRequest(`/projects/${projectCode}`),
  projectStatus: (projectCode: string) => request<ProjectStatus>(`/projects/${projectCode}/status`),
  projectMembers: (projectCode: string) => request<ProjectMember[]>(`/projects/${projectCode}/members`),
  updateProjectMembers: (projectCode: string, addUserIds: number[], removeUserIds: number[]) =>
    patchJson<ProjectMember[]>(`/projects/${projectCode}/members`, { add_user_ids: addUserIds, remove_user_ids: removeUserIds }),
  providers: () => request<Provider[]>("/providers"),
  providerProfiles: () => request<ProviderProfileRecord[]>("/providers/profiles"),
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
  workflows: () => request<Workflow[]>("/workflows"),
  tasks: () => request<Task[]>("/tasks"),
  assets: () => request<Asset[]>("/assets"),
  promptTemplates: () =>
    request<PromptTemplateRecord[]>("/prompt-templates"),
  createPromptTemplate: (payload: PromptTemplateCreatePayload) =>
    postJson<PromptTemplateRecord>("/prompt-templates", payload),
  updatePromptTemplate: (templateId: number, payload: PromptTemplateUpdatePayload) =>
    patchJson<PromptTemplateRecord>(`/prompt-templates/${templateId}`, payload),
  deletePromptTemplate: (templateId: number) =>
    deleteRequest(`/prompt-templates/${templateId}`),
  uploadReferenceImage: (payload: ReferenceUploadPayload) =>
    postJson<ReferenceUploadResponse>("/assets/reference-upload", payload),
  createTask: (payload: TaskCreatePayload) => postJson<Task>("/tasks", payload),
  deleteTask: (taskId: number) => deleteRequest(`/tasks/${taskId}`),
  likeAsset: (assetId: number) => postJson<Asset>(`/assets/${assetId}/like`),
  bookmarkAsset: (assetId: number) => postJson<Asset>(`/assets/${assetId}/bookmark`),
  shareAsset: (assetId: number) => postJson<Asset>(`/assets/${assetId}/share`),
  inspiration: (category?: string) => request<InspirationPost[]>(category && category !== "全部" ? `/inspiration?category=${encodeURIComponent(category)}` : "/inspiration"),
  createInspiration: (payload: { title: string; description?: string; image_path?: string; category?: string; tags?: string[]; source_type: string; source_name?: string; source_url?: string; source_asset_id?: number; prompt_text?: string; model_name?: string }) =>
    postJson<InspirationPost>("/inspiration", payload),
  likeInspiration: (postId: number) => postJson<InspirationPost>(`/inspiration/${postId}/like`),
  deleteInspiration: (postId: number) => deleteRequest(`/inspiration/${postId}`),
  updateInspiration: (postId: number, data: { title?: string; description?: string; image_path?: string; category?: string; tags?: string[]; source_url?: string; source_name?: string }) =>
    request<InspirationPost>(`/inspiration/${postId}`, { method: "PATCH", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  extractImages: (url: string) => postJson<{ images: string[]; title: string }>("/inspiration/extract-images", { url }),
  // Chat
  getChatModels: () => request<{ provider_id: number; provider_name: string; model_name: string; base_url: string }[]>("/chat/models"),
  getChatConversations: () => request<{ id: number; title: string; model_provider_id: number | null; created_at: string; updated_at: string }[]>("/chat/conversations"),
  createChatConversation: (model_provider_id: number, title?: string) => postJson<{ id: number; title: string; model_provider_id: number | null; created_at: string; updated_at: string }>("/chat/conversations", { model_provider_id, title: title || "" }),
  getChatMessages: (convId: number) => request<{ id: number; role: string; content: string; created_at: string }[]>(`/chat/conversations/${convId}/messages`),
  deleteChatConversation: (convId: number) => deleteRequest(`/chat/conversations/${convId}`),
};
