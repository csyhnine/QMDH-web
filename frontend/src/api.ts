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
  tags: string[];
  created_at: string;
};

export type Provider = {
  provider_name: string;
  model_name: string;
  capabilities: string[];
  configurable: boolean;
  outbound: boolean;
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
  user_name: string;
  requested_provider: string;
  classification: string;
  payload: Record<string, unknown>;
};

const API_BASE = (import.meta.env.VITE_API_BASE ?? "/api/v1").replace(/\/$/, "");

async function buildError(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) {
      return new Error(`请求失败（${response.status}）：${payload.detail}`);
    }
  } catch {
    // Ignore JSON parse failures and fall back to the status code only.
  }

  return new Error(`请求失败（${response.status}）`);
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw await buildError(response);
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    throw await buildError(response);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => fetchJson<{ status: string; service: string }>("/health"),
  projects: () => fetchJson<Project[]>("/projects"),
  projectStatus: (projectCode: string) => fetchJson<ProjectStatus>(`/projects/${projectCode}/status`),
  providers: () => fetchJson<Provider[]>("/providers"),
  workflows: () => fetchJson<Workflow[]>("/workflows"),
  tasks: () => fetchJson<Task[]>("/tasks"),
  assets: () => fetchJson<Asset[]>("/assets"),
  createTask: (payload: TaskCreatePayload) => postJson<Task>("/tasks", payload),
  likeAsset: (assetId: number) => postJson<Asset>(`/assets/${assetId}/like`),
  shareAsset: (assetId: number) => postJson<Asset>(`/assets/${assetId}/share`)
};
