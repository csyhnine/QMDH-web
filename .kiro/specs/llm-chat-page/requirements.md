# Requirements Document

## Introduction

本功能为 QMDH-web 建筑设计 AI 平台新增 LLM Chat 对话页面。将现有侧栏"画布"入口替换为"Chat"入口，提供模型选择和实时对话界面。后端通过 OpenAI 兼容接口（Chat Completions API）统一接入多种 LLM 服务（OpenAI、通义千问、DeepSeek 等），支持流式响应（SSE）。对话历史持久化存储，用户可查看和管理历史会话。后台模型管理复用现有 ProviderProfile 表，通过 capabilities 字段区分 chat 和生图渠道。

## Glossary

- **Chat_Page**: 前端 Chat 对话页面组件，嵌入 App.tsx 中，提供模型选择和消息收发界面
- **Chat_API**: 后端 FastAPI 路由模块，处理对话会话创建、消息发送、历史查询等请求
- **Chat_Service**: 后端服务层，负责调用 OpenAI 兼容接口并处理流式响应
- **Conversation**: 一次完整的对话会话，包含标题、所属用户、创建时间等元数据
- **Message**: 对话中的单条消息，包含角色（user/assistant/system）、内容和时间戳
- **ProviderProfile**: 已有的模型配置表，通过 capabilities 字段区分 chat 和 image 渠道
- **SSE**: Server-Sent Events，服务端推送事件流，用于实现逐字输出效果
- **OpenAI_Compatible_API**: 兼容 OpenAI Chat Completions API 格式的第三方服务接口

## Requirements

### Requirement 1: 侧栏导航入口变更

**User Story:** As a 设计师用户, I want 在侧栏看到"Chat"入口替代原来的"画布"入口, so that 我可以快速进入 AI 对话界面。

#### Acceptance Criteria

1. WHEN the Chat_Page loads, THE Chat_Page SHALL display a "Chat" label in the sidebar navigation replacing the previous "画布" label
2. WHEN a user clicks the "Chat" sidebar item, THE Chat_Page SHALL become the active view and display the chat interface
3. THE Chat_Page SHALL retain the same position in the sidebar navigation as the previous "画布" entry

### Requirement 2: Chat 模型选择

**User Story:** As a 设计师用户, I want 在 Chat 页面选择可用的 LLM 模型, so that 我可以使用不同的 AI 模型进行对话。

#### Acceptance Criteria

1. WHEN the Chat_Page loads, THE Chat_Page SHALL display a model selector showing all enabled ProviderProfile entries with "chat.completions" in their capabilities field
2. WHEN no chat-capable models are configured, THE Chat_Page SHALL display a message indicating no models are available
3. WHEN a user selects a model from the selector, THE Chat_Page SHALL use that model for subsequent messages in the current conversation
4. THE Chat_Page SHALL persist the user's last selected model across page reloads using local storage

### Requirement 3: 对话消息发送与接收

**User Story:** As a 设计师用户, I want 在 Chat 页面输入消息并收到 AI 回复, so that 我可以与 LLM 进行实时对话。

#### Acceptance Criteria

1. WHEN a user submits a message, THE Chat_API SHALL forward the message along with conversation history to the selected model's OpenAI_Compatible_API endpoint
2. WHEN the Chat_API receives a streaming response, THE Chat_Service SHALL relay each token to the frontend via SSE
3. WHILE the Chat_Service is streaming a response, THE Chat_Page SHALL display tokens incrementally as they arrive (逐字输出)
4. WHEN the complete response has been received, THE Chat_Service SHALL persist the assistant message to the database
5. IF the upstream API returns an error, THEN THE Chat_API SHALL return a structured error response with the HTTP status code and error description
6. IF the upstream API connection times out, THEN THE Chat_API SHALL return a 504 status with a timeout error message

### Requirement 4: 对话会话管理

**User Story:** As a 设计师用户, I want 创建、查看和管理多个对话会话, so that 我可以组织不同主题的对话。

#### Acceptance Criteria

1. WHEN a user sends the first message without an active conversation, THE Chat_API SHALL create a new Conversation record associated with the current user
2. THE Chat_API SHALL auto-generate a conversation title based on the first user message content (truncated to 50 characters)
3. WHEN a user requests the conversation list, THE Chat_API SHALL return all conversations belonging to that user ordered by last updated time descending
4. WHEN a user selects a conversation from the list, THE Chat_Page SHALL load and display all messages in that conversation
5. WHEN a user deletes a conversation, THE Chat_API SHALL remove the Conversation and all associated Message records from the database

### Requirement 5: 对话历史持久化

**User Story:** As a 设计师用户, I want 我的对话历史被保存, so that 我可以随时回顾之前的对话内容。

#### Acceptance Criteria

1. WHEN a user message is submitted, THE Chat_API SHALL persist the Message record with role "user", content, conversation_id, and timestamp
2. WHEN an assistant response is fully received, THE Chat_API SHALL persist the Message record with role "assistant", content, conversation_id, and timestamp
3. WHEN a user opens an existing conversation, THE Chat_API SHALL return all messages ordered by creation time ascending
4. THE Chat_API SHALL include the conversation's message history (up to the most recent 50 messages) as context when calling the OpenAI_Compatible_API

### Requirement 6: 后台 Chat 模型配置

**User Story:** As a 管理员, I want 在模型管理后台配置 Chat 模型, so that 设计师可以使用这些模型进行对话。

#### Acceptance Criteria

1. WHEN an admin creates a ProviderProfile with capabilities containing "chat.completions", THE Chat_API SHALL include that model in the chat model selector
2. THE ProviderProfile SHALL support the same API Key and base_url being used for both "image.generate" and "chat.completions" capabilities via separate ProviderProfile entries
3. WHEN an admin disables a ProviderProfile with "chat.completions" capability, THE Chat_Page SHALL exclude that model from the model selector
4. THE ProviderProfile capabilities field SHALL accept "chat.completions" as a valid capability value alongside existing "image.generate"

### Requirement 7: 流式响应（SSE）传输

**User Story:** As a 设计师用户, I want 看到 AI 回复逐字出现, so that 我可以更快地开始阅读回复内容而不必等待完整响应。

#### Acceptance Criteria

1. WHEN the Chat_API receives a chat request, THE Chat_API SHALL respond with Content-Type "text/event-stream" and stream tokens as SSE data events
2. WHILE streaming, THE Chat_Service SHALL forward each content delta from the upstream API as a separate SSE event in the format "data: {json}\n\n"
3. WHEN the stream completes, THE Chat_Service SHALL send a final SSE event with "[DONE]" marker
4. IF the upstream stream is interrupted, THEN THE Chat_Service SHALL close the SSE connection and return the partial content received so far
5. THE Chat_API SHALL set appropriate headers (Cache-Control: no-cache, Connection: keep-alive) to prevent proxy buffering of the SSE stream

### Requirement 8: 认证与权限控制

**User Story:** As a 系统管理员, I want Chat 功能受到认证保护, so that 只有登录用户可以使用对话功能。

#### Acceptance Criteria

1. WHEN an unauthenticated request is made to any Chat_API endpoint, THE Chat_API SHALL return a 401 Unauthorized response
2. THE Chat_API SHALL use the existing Bearer token authentication mechanism to identify the current user
3. WHEN a user requests conversations or messages, THE Chat_API SHALL only return records belonging to that user
4. THE Chat_API SHALL prevent a user from accessing or modifying conversations belonging to other users by returning a 403 Forbidden response

### Requirement 9: 前端对话界面交互

**User Story:** As a 设计师用户, I want 一个清晰易用的对话界面, so that 我可以高效地与 AI 交流。

#### Acceptance Criteria

1. THE Chat_Page SHALL display messages in a scrollable container with user messages aligned to the right and assistant messages aligned to the left
2. THE Chat_Page SHALL provide a text input area at the bottom with a send button
3. WHILE waiting for a response, THE Chat_Page SHALL disable the send button and display a loading indicator
4. WHEN a new message is added to the conversation, THE Chat_Page SHALL auto-scroll to the bottom of the message list
5. THE Chat_Page SHALL display a conversation list panel on the left side with a "新对话" (new conversation) button
6. WHEN the user presses Enter (without Shift), THE Chat_Page SHALL submit the message; WHEN the user presses Shift+Enter, THE Chat_Page SHALL insert a newline

