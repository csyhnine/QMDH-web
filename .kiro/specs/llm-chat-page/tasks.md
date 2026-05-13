# Implementation Tasks: LLM Chat Page

## Task 1: Database Models & Migration

- [ ] 1.1 Add `Conversation` model to `backend/app/models.py` with fields: id, user_id (FK→users.id), title (String 200), model_provider_id (FK→provider_profiles.id, nullable), created_at, updated_at
- [ ] 1.2 Add `ChatMessage` model to `backend/app/models.py` with fields: id, conversation_id (FK→conversations.id), role (String 20), content (Text), token_count (Integer, default=0), created_at
- [ ] 1.3 Add relationship `conversations` to User model and `messages` relationship to Conversation model with cascade delete
- [ ] 1.4 Create Alembic migration for the new `conversations` and `chat_messages` tables
- [ ] 1.5 Run migration and verify tables are created correctly

## Task 2: Chat Pydantic Schemas

- [ ] 2.1 Add `ChatModelOut` schema (provider_id, provider_name, model_name, base_url)
- [ ] 2.2 Add `ConversationCreate` schema (model_provider_id: int, title: str | None)
- [ ] 2.3 Add `ConversationOut` schema (id, title, model_provider_id, created_at, updated_at)
- [ ] 2.4 Add `ChatMessageCreate` schema (content: str with min_length=1)
- [ ] 2.5 Add `ChatMessageOut` schema (id, role, content, created_at)

## Task 3: Chat Service (OpenAI-Compatible Client)

- [ ] 3.1 Create `backend/app/services/chat_service.py` with function `get_chat_models(db) -> list[ProviderProfile]` that returns enabled profiles with "chat.completions" capability
- [ ] 3.2 Implement `build_chat_messages(db, conversation_id, new_content) -> list[dict]` that loads last 50 messages from DB and appends the new user message in OpenAI format
- [ ] 3.3 Implement `stream_chat_completion(provider, messages) -> AsyncGenerator[str, None]` that calls the provider's base_url/chat/completions with stream=True via httpx and yields SSE-formatted strings
- [ ] 3.4 Add error handling: timeout → raise specific exception, upstream error → raise with status code, connection error → raise with description
- [ ] 3.5 Implement `generate_conversation_title(content: str) -> str` that truncates the first user message to 50 characters

## Task 4: Chat API Router

- [ ] 4.1 Create `backend/app/routers/chat.py` with router prefix "/chat" and register it in `main.py`
- [ ] 4.2 Implement `GET /models` endpoint returning enabled chat-capable ProviderProfiles
- [ ] 4.3 Implement `POST /conversations` endpoint creating a new conversation for the authenticated user
- [ ] 4.4 Implement `GET /conversations` endpoint returning user's conversations ordered by updated_at desc
- [ ] 4.5 Implement `GET /conversations/{conversation_id}/messages` endpoint with user ownership check, returning messages ordered by created_at asc
- [ ] 4.6 Implement `DELETE /conversations/{conversation_id}` endpoint with user ownership check and cascade delete of messages
- [ ] 4.7 Implement `POST /conversations/{conversation_id}/messages` endpoint that: persists user message, calls chat service stream, returns StreamingResponse with SSE content type and appropriate headers, persists assistant message on completion
- [ ] 4.8 Add ownership verification helper `_verify_conversation_owner(db, conversation_id, user_id)` that raises 403 if user doesn't own the conversation

## Task 5: Frontend — Navigation & State

- [ ] 5.1 Add "chat" to the `studioTab` type/state and replace the "画布" sidebar button with "Chat" button that sets `studioTab` to "chat"
- [ ] 5.2 Add Chat-related TypeScript types: `ChatConversation`, `ChatMessage`, `ChatModel`
- [ ] 5.3 Add Chat state variables: `chatConversations`, `activeChatId`, `chatMessages`, `chatInput`, `chatModels`, `selectedChatModel`, `chatStreaming`
- [ ] 5.4 Add API functions in `api.ts`: `getChatModels()`, `getChatConversations()`, `createChatConversation()`, `getChatMessages(convId)`, `deleteChatConversation(convId)`
- [ ] 5.5 Load chat models on mount when studioTab is "chat"; persist selected model to localStorage

## Task 6: Frontend — Chat UI

- [ ] 6.1 Implement Chat view container with model selector dropdown at top
- [ ] 6.2 Implement conversation list panel (left side) with "新对话" button and conversation items showing title and delete button
- [ ] 6.3 Implement message display area (scrollable) with user messages right-aligned and assistant messages left-aligned
- [ ] 6.4 Implement message input textarea with send button; Enter to submit, Shift+Enter for newline
- [ ] 6.5 Implement SSE streaming handler using fetch + ReadableStream that appends tokens to the current assistant message incrementally
- [ ] 6.6 Implement auto-scroll to bottom when new messages arrive
- [ ] 6.7 Implement loading state: disable send button and show indicator while streaming
- [ ] 6.8 Implement empty state: show "no models available" when chatModels is empty; show welcome message when no conversation is active

## Task 7: Integration & Testing

- [ ] 7.1 Test end-to-end: create a chat ProviderProfile with capabilities=["chat.completions"], verify it appears in model selector
- [ ] 7.2 Test end-to-end: send a message and verify streaming response displays correctly
- [ ] 7.3 Test conversation CRUD: create, list, switch between, delete conversations
- [ ] 7.4 Test error handling: verify 401 for unauthenticated, 403 for wrong user, 502/504 for upstream errors
- [ ] 7.5 Test context window: verify that conversations with >50 messages only send the last 50 to the API
- [ ] 7.6 Verify existing image generation functionality is unaffected by the changes

