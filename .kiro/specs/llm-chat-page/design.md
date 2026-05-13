# Design Document: LLM Chat Page

## Overview

为 QMDH-web 平台新增 LLM Chat 对话功能。复用现有 ProviderProfile 模型管理体系，通过 OpenAI 兼容接口统一接入多种 LLM 服务，支持 SSE 流式响应。前端在单文件 App.tsx 中新增 Chat 视图，后端新增 chat router 和数据模型。

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (App.tsx)                                      │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Sidebar  │  │ Chat Panel   │  │ Conversation List│  │
│  │ "Chat"   │→ │ Messages     │  │ History          │  │
│  │ nav item │  │ Input Area   │  │ New/Delete       │  │
│  └──────────┘  └──────┬───────┘  └──────────────────┘  │
└─────────────────────────┼───────────────────────────────┘
                          │ SSE / REST
┌─────────────────────────┼───────────────────────────────┐
│  Backend (FastAPI)      │                               │
│  ┌──────────────────────▼──────────────────────────┐    │
│  │  /api/v1/chat router                            │    │
│  │  - POST /conversations                          │    │
│  │  - GET  /conversations                          │    │
│  │  - GET  /conversations/{id}/messages            │    │
│  │  - DELETE /conversations/{id}                   │    │
│  │  - POST /conversations/{id}/messages (SSE)      │    │
│  │  - GET  /models (chat-capable)                  │    │
│  └──────────────────────┬──────────────────────────┘    │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────┐    │
│  │  Chat Service                                   │    │
│  │  - Build OpenAI-compatible request              │    │
│  │  - Stream response via httpx                    │    │
│  │  - Persist messages                             │    │
│  └──────────────────────┬──────────────────────────┘    │
└─────────────────────────┼───────────────────────────────┘
                          │ HTTPS (OpenAI-compatible)
┌─────────────────────────▼───────────────────────────────┐
│  External LLM Services                                  │
│  (OpenAI / 通义千问 / DeepSeek / etc.)                   │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. User selects model → frontend stores selection in state + localStorage
2. User sends message → POST /api/v1/chat/conversations/{id}/messages
3. Backend loads conversation history (last 50 messages) from DB
4. Backend constructs OpenAI Chat Completions request with history + new message
5. Backend streams response via SSE to frontend
6. Frontend renders tokens incrementally
7. On stream completion, backend persists assistant message to DB

## Database Schema

### New Tables

#### conversations

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | Integer | PK, auto-increment | 会话 ID |
| user_id | Integer | FK → users.id, NOT NULL, INDEX | 所属用户 |
| title | String(200) | NOT NULL | 会话标题（自动生成） |
| model_provider_id | Integer | FK → provider_profiles.id, nullable | 使用的模型 |
| created_at | DateTime(tz) | server_default=now() | 创建时间 |
| updated_at | DateTime(tz) | server_default=now(), onupdate=now() | 最后更新时间 |

#### chat_messages

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | Integer | PK, auto-increment | 消息 ID |
| conversation_id | Integer | FK → conversations.id, NOT NULL, INDEX | 所属会话 |
| role | String(20) | NOT NULL | 角色: "user", "assistant", "system" |
| content | Text | NOT NULL | 消息内容 |
| token_count | Integer | default=0 | token 数量（用于计费） |
| created_at | DateTime(tz) | server_default=now() | 创建时间 |

### Existing Table Changes

**provider_profiles** — No schema changes needed. The `capabilities` JSON field already supports arbitrary string values. We add `"chat.completions"` as a convention.

## API Design

### New Endpoints (prefix: /api/v1/chat)

#### GET /models
Returns list of enabled chat-capable models.

**Response:** `200 OK`
```json
[
  {
    "provider_id": 5,
    "provider_name": "deepseek-chat",
    "model_name": "deepseek-chat",
    "base_url": "https://api.deepseek.com/v1"
  }
]
```

#### POST /conversations
Create a new conversation.

**Request:**
```json
{
  "model_provider_id": 5,
  "title": "optional title"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "title": "新对话",
  "model_provider_id": 5,
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:00:00Z"
}
```

#### GET /conversations
List user's conversations.

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "title": "关于建筑设计的讨论",
    "model_provider_id": 5,
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T12:00:00Z"
  }
]
```

#### GET /conversations/{conversation_id}/messages
Get all messages in a conversation.

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "role": "user",
    "content": "帮我分析一下这个建筑方案",
    "created_at": "2025-01-01T00:00:00Z"
  },
  {
    "id": 2,
    "role": "assistant",
    "content": "好的，我来帮你分析...",
    "created_at": "2025-01-01T00:00:01Z"
  }
]
```

#### DELETE /conversations/{conversation_id}
Delete a conversation and all its messages.

**Response:** `204 No Content`

#### POST /conversations/{conversation_id}/messages
Send a message and receive streaming response.

**Request:**
```json
{
  "content": "帮我分析一下这个建筑方案"
}
```

**Response:** `200 OK` with `Content-Type: text/event-stream`
```
data: {"delta": "好的"}

data: {"delta": "，我来"}

data: {"delta": "帮你分析"}

data: [DONE]
```

### Error Responses

| Status | Condition | Body |
|--------|-----------|------|
| 401 | No/invalid token | `{"detail": "未认证"}` |
| 403 | Accessing other user's conversation | `{"detail": "无权访问该对话"}` |
| 404 | Conversation not found | `{"detail": "对话不存在"}` |
| 502 | Upstream API error | `{"detail": "模型服务返回错误: {status}"}` |
| 504 | Upstream timeout | `{"detail": "模型服务响应超时"}` |

## Frontend Design

### State Management

New state variables in App.tsx:

```typescript
// Chat state
type ChatConversation = {
  id: number;
  title: string;
  model_provider_id: number;
  created_at: string;
  updated_at: string;
};

type ChatMessage = {
  id?: number;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
};

type ChatModel = {
  provider_id: number;
  provider_name: string;
  model_name: string;
};

// State
const [chatConversations, setChatConversations] = useState<ChatConversation[]>([]);
const [activeChatId, setActiveChatId] = useState<number | null>(null);
const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
const [chatInput, setChatInput] = useState("");
const [chatModels, setChatModels] = useState<ChatModel[]>([]);
const [selectedChatModel, setSelectedChatModel] = useState<number | null>(null);
const [chatStreaming, setChatStreaming] = useState(false);
```

### Navigation Change

Replace the "画布" button in the sidebar with "Chat":
```tsx
<button type="button" 
  className={studioTab === "chat" ? "rail-item active" : "rail-item"} 
  onClick={() => setStudioTab("chat")}>
  <span>Chat</span>
</button>
```

### Chat View Layout

```
┌─────────────────────────────────────────────────┐
│ Model Selector: [DeepSeek Chat ▼]               │
├────────────┬────────────────────────────────────┤
│ Conv List  │  Message Area (scrollable)         │
│            │  ┌─────────────────────────────┐   │
│ [+ 新对话] │  │ User: 帮我分析...           │   │
│            │  │ Assistant: 好的，我来...     │   │
│ • 对话1    │  │                             │   │
│ • 对话2    │  └─────────────────────────────┘   │
│ • 对话3    │                                    │
│            ├────────────────────────────────────┤
│            │ [Input textarea] [Send]            │
└────────────┴────────────────────────────────────┘
```

### SSE Handling (Frontend)

Use `fetch` with `ReadableStream` to consume SSE:

```typescript
const response = await fetch(`/api/v1/chat/conversations/${convId}/messages`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ content: message }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // Parse SSE events from buffer
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = line.slice(6);
      if (data === "[DONE]") break;
      const parsed = JSON.parse(data);
      // Append delta to current assistant message
    }
  }
}
```

## Backend Implementation

### New Files

- `backend/app/routers/chat.py` — Chat API router
- `backend/app/services/chat_service.py` — Chat service (OpenAI-compatible client)

### Chat Service Design

```python
async def stream_chat_completion(
    provider: ProviderProfile,
    messages: list[dict],
    db: Session,
    conversation_id: int,
) -> AsyncGenerator[str, None]:
    """
    Call OpenAI-compatible API with streaming and yield SSE events.
    
    1. Decrypt API key from provider
    2. Build request payload (model, messages, stream=True)
    3. Stream response via httpx
    4. Yield each token as SSE event
    5. On completion, persist full assistant message
    """
```

### Request Construction

```python
payload = {
    "model": provider.model_name,
    "messages": messages,  # [{role, content}, ...]
    "stream": True,
}
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}
# POST to {provider.base_url}/chat/completions
```

### Context Window Management

When building the messages array for the API call:
1. Load all messages for the conversation from DB
2. Take the most recent 50 messages
3. Prepend system message if configured
4. Append the new user message

## Security Considerations

- API keys stored encrypted in DB (existing encryption module)
- User isolation: all queries filtered by user_id from auth token
- No cross-user data access
- SSE connection authenticated via Bearer token in request header
- Input content not logged in plain text to audit logs (privacy)

## Correctness Properties

### Property 1: Chat Model Filtering (Req 2.1, 6.1)
For any set of ProviderProfile records, the chat models endpoint returns exactly those profiles where `enabled=True` AND `"chat.completions"` is in the `capabilities` list.

### Property 2: Conversation Title Truncation (Req 4.2)
For any user message string of length N, the auto-generated conversation title has length `min(N, 50)` and equals the first 50 characters of the message.

### Property 3: Conversation List Ordering (Req 4.3)
For any user with K conversations, the returned list is sorted by `updated_at` in descending order (each item's `updated_at` >= the next item's `updated_at`).

### Property 4: Message History Ordering (Req 5.3)
For any conversation with N messages, the returned messages are sorted by `created_at` in ascending order.

### Property 5: Context Window Limit (Req 5.4)
For any conversation with N messages, the context sent to the OpenAI-compatible API contains exactly `min(N, 50)` historical messages, and they are the most recent N messages from the conversation.

### Property 6: User Isolation (Req 8.3)
For any user U querying conversations, every returned conversation has `user_id == U.id`. No conversation belonging to a different user is ever included.

### Property 7: OpenAI Request Format (Req 3.1)
For any valid user message and conversation history, the constructed API request payload contains: a "model" field matching the provider's model_name, a "messages" array where each element has "role" and "content" fields, and "stream" set to True.

## Migration Strategy

1. Add new tables (`conversations`, `chat_messages`) via Alembic migration
2. No changes to existing `provider_profiles` table schema
3. Admin adds chat models via existing /admin/models UI with capabilities = ["chat.completions"]
4. Frontend change is additive (new tab, no breaking changes to existing views)

## Dependencies

- **httpx** (already installed) — async HTTP client for streaming
- **sse-starlette** or manual StreamingResponse — for SSE output (FastAPI's `StreamingResponse` is sufficient)
- No new frontend dependencies needed (native fetch + ReadableStream)

