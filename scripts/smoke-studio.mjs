const baseUrl = normalizeBaseUrl(process.env.QMDH_SMOKE_BASE_URL ?? "http://127.0.0.1:18080");
const username = process.env.QMDH_SMOKE_USER ?? "admin";
const password = process.env.QMDH_SMOKE_PASSWORD ?? "dev-admin-password";

const checks = [];

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function joinUrl(path) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function record(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  const status = ok ? "PASS" : "FAIL";
  console.log(`[${status}] ${name}${detail ? ` - ${detail}` : ""}`);
}

async function request(path, options = {}) {
  const response = await fetch(joinUrl(path), {
    redirect: "manual",
    ...options,
    headers: {
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body, text };
}

async function smoke() {
  console.log(`Studio smoke target: ${baseUrl}`);

  const studioPage = await request("/studio/generate");
  record(
    "studio route returns HTML",
    studioPage.response.ok && typeof studioPage.body === "string" && studioPage.text.includes("<!doctype html"),
    `status ${studioPage.response.status}`
  );

  const health = await request("/api/v1/health");
  record(
    "health endpoint responds",
    health.response.ok && typeof health.body === "object" && health.body !== null && "status" in health.body,
    `status ${health.response.status}${health.body?.status ? `, health=${health.body.status}` : ""}`
  );

  const login = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const token = typeof login.body === "object" && login.body !== null ? login.body.token : null;
  record("admin login succeeds", login.response.ok && typeof token === "string" && token.length > 0, `status ${login.response.status}`);

  if (!token) {
    throw new Error("Login did not return a bearer token; cannot continue authenticated smoke checks.");
  }

  const authHeaders = { Authorization: `Bearer ${token}` };
  const me = await request("/api/v1/auth/me", { headers: authHeaders });
  record(
    "session resolves current user",
    me.response.ok && typeof me.body === "object" && me.body !== null && me.body.name === username,
    `status ${me.response.status}`
  );

  const projects = await request("/api/v1/projects", { headers: authHeaders });
  record(
    "projects API lists containers",
    projects.response.ok && Array.isArray(projects.body),
    `status ${projects.response.status}${Array.isArray(projects.body) ? `, count=${projects.body.length}` : ""}`
  );

  const providers = await request("/api/v1/providers", { headers: authHeaders });
  record(
    "providers API lists runtime providers",
    providers.response.ok && Array.isArray(providers.body),
    `status ${providers.response.status}${Array.isArray(providers.body) ? `, count=${providers.body.length}` : ""}`
  );

  const tasks = await request("/api/v1/tasks", { headers: authHeaders });
  record(
    "tasks API lists own history",
    tasks.response.ok && Array.isArray(tasks.body),
    `status ${tasks.response.status}${Array.isArray(tasks.body) ? `, count=${tasks.body.length}` : ""}`
  );

  const templates = await request("/api/v1/prompt-templates", { headers: authHeaders });
  record(
    "prompt templates API responds",
    templates.response.ok && Array.isArray(templates.body),
    `status ${templates.response.status}${Array.isArray(templates.body) ? `, count=${templates.body.length}` : ""}`
  );

  await request("/api/v1/auth/logout", { method: "POST", headers: authHeaders });
}

try {
  await smoke();
} catch (error) {
  record("smoke runner completed", false, error instanceof Error ? error.message : String(error));
}

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  console.error(`Studio smoke failed: ${failed.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`Studio smoke passed: ${checks.length}/${checks.length} checks passed.`);
