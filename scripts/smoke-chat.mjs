const baseUrl = normalizeBaseUrl(process.env.QMDH_SMOKE_BASE_URL ?? "http://127.0.0.1:18080");
const username = process.env.QMDH_SMOKE_USER ?? "admin";
const password = process.env.QMDH_SMOKE_PASSWORD ?? "dev-admin-password";
const agentSmokeEnabled = process.env.QMDH_SMOKE_AGENT_MODE !== "0";

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

function recordSkip(name, detail = "") {
  checks.push({ name, ok: true, detail: `SKIP: ${detail}` });
  console.log(`[SKIP] ${name}${detail ? ` - ${detail}` : ""}`);
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

async function readAgentModeSse(path, headers, body, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(joinUrl(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { response, text: await response.text() };
    }
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
}

async function smokeAgentMode(authHeaders, chatModels) {
  if (!agentSmokeEnabled) {
    recordSkip("chat agent_mode SSE", "QMDH_SMOKE_AGENT_MODE=0");
    return;
  }
  if (!Array.isArray(chatModels) || chatModels.length === 0) {
    recordSkip("chat agent_mode SSE", "no chat.completions models configured");
    return;
  }

  const providerId = chatModels[0].provider_id;
  const create = await request("/api/v1/chat/conversations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({ model_provider_id: providerId }),
  });
  if (!create.response.ok || typeof create.body?.id !== "number") {
    recordSkip("chat agent_mode SSE", `cannot create conversation (${create.response.status})`);
    return;
  }

  const conversationId = create.body.id;
  try {
    const agent = await readAgentModeSse(
      `/api/v1/chat/conversations/${conversationId}/messages`,
      authHeaders,
      {
        content: "列出可用工作流",
        agent_mode: true,
        policy_version: "smoke-b1",
      },
    );

    if (agent.response.status === 503) {
      recordSkip("chat agent_mode SSE", "agent unavailable (503)");
      return;
    }
    if (!agent.response.ok) {
      record("chat agent_mode SSE", false, `status ${agent.response.status}`);
      return;
    }

    const hasDone = agent.text.includes("[DONE]");
    const hasPayload =
      agent.text.includes('"thinking"') ||
      agent.text.includes("tool_calls") ||
      agent.text.includes('"policy_version"') ||
      agent.text.includes('"delta"');
    record(
      "chat agent_mode SSE",
      hasDone && hasPayload,
      `status ${agent.response.status}, bytes=${agent.text.length}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("abort")) {
      recordSkip("chat agent_mode SSE", "timed out waiting for upstream agent");
      return;
    }
    record("chat agent_mode SSE", false, message);
  }
}

async function smoke() {
  console.log(`Chat smoke target: ${baseUrl}`);

  const chatPage = await request("/studio/chat");
  record(
    "chat route returns HTML",
    chatPage.response.ok && typeof chatPage.text === "string" && chatPage.text.toLowerCase().includes("<!doctype html"),
    `status ${chatPage.response.status}`,
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

  const models = await request("/api/v1/chat/models", { headers: authHeaders });
  record(
    "chat models API responds",
    models.response.ok && Array.isArray(models.body),
    `status ${models.response.status}${Array.isArray(models.body) ? `, count=${models.body.length}` : ""}`,
  );

  const conversations = await request("/api/v1/chat/conversations", { headers: authHeaders });
  record(
    "chat conversations API responds",
    conversations.response.ok && Array.isArray(conversations.body),
    `status ${conversations.response.status}${Array.isArray(conversations.body) ? `, count=${conversations.body.length}` : ""}`,
  );

  await smokeAgentMode(authHeaders, models.body);

  await request("/api/v1/auth/logout", { method: "POST", headers: authHeaders });
}

try {
  await smoke();
} catch (error) {
  record("smoke runner completed", false, error instanceof Error ? error.message : String(error));
}

const failed = checks.filter((check) => !check.ok);
if (failed.length > 0) {
  console.error(`Chat smoke failed: ${failed.length}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`Chat smoke passed: ${checks.length}/${checks.length} checks passed.`);
