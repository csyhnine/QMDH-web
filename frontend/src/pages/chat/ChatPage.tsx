import { useChat, type UIMessage } from "@ai-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../../api";
import { useAuth } from "../../context/AuthContext";
import {
  getPersistedMessageId,
  getUiMessageAgentTaskProposals,
  getUiMessageAgentThinkingSteps,
  getUiMessageAgentToolCalls,
  getUiMessageAttachments,
  getUiMessagePolicyVersion,
  getUiMessageText,
  toUiMessages,
} from "../../lib/chat/qmdhChatMessageUtils";
import { chatRoundElementId, extractChatRounds } from "../../lib/chat/chatRoundUtils";
import {
  flushChatTelemetry,
  mapClientStreamErrorMessage,
  reportChatStreamStatus,
  reportChatTelemetry,
  resetChatStreamStatusTelemetry,
} from "../../lib/chat/chatTelemetry";
import { QmdhChatTransport } from "../../lib/chat/qmdhChatTransport";
import type { ChatTaskProposal, ChatThinkingStep, ChatToolCall } from "../../lib/chat/qmdhSseParser";
import { chatAgentModeDefaultFor } from "../../lib/featureFlags";
import { useChatAgentUiEnabled } from "../../lib/useChatAgentUiEnabled";
import { useChatAttachments } from "../../lib/chat/useChatAttachments";
import { chatAttachmentMessageUrl, releaseChatAttachmentPreviews } from "../../lib/chat/chatAttachmentUtils";
import { ChatSendLifecycle, chatSendScopeKey, createChatClientMessageId, type ChatSendScope, type ChatSendEntry, type ChatSendFinish } from "../../lib/chat/chatSendLifecycle";
import ChatAgentCapabilitiesDrawer from "./ChatAgentCapabilitiesDrawer";
import ChatAgentMemoryDrawer from "./ChatAgentMemoryDrawer";
import ChatAgentThinkingPanel, { mergeThinkingSteps } from "./ChatAgentThinkingPanel";
import type { ChatAgentPolicy } from "./chatAgentConstants";
import ChatConversationNav from "./ChatConversationNav";
import ChatMessageContent from "./ChatMessageContent";
import ChatTaskProposalCard, { type ProposalDecision } from "./ChatTaskProposalCard";
import ChatToolCallList from "./ChatToolCallList";

const ACTIVE_CHAT_STORAGE_KEY = "qmdh.active.chat";
const AGENT_MODE_STORAGE_KEY = "qmdh.chat.agent_mode";

type ChatConversation = {
  id: number;
  title: string;
  model_provider_id: number | null;
  has_context_summary?: boolean;
  context_usage_percent?: number;
  context_tokens?: number;
  context_window_tokens?: number;
  created_at: string;
  updated_at: string;
};

type ChatModel = {
  provider_id: number;
  provider_name: string;
  display_name: string;
  model_name: string;
  base_url: string;
};

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ChatPage() {
  const { currentUser, isGuest } = useAuth();
  const chatAgentUiEnabled = useChatAgentUiEnabled();
  const showChatAgentUi = chatAgentUiEnabled ?? false;
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(() => {
    const saved = localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null;
  });
  const [chatInput, setChatInput] = useState("");
  const chatInputRef = useRef(chatInput);
  chatInputRef.current = chatInput;
  function replaceChatInput(value: string) { chatInputRef.current = value; setChatInput(value); }
  const owner = String(currentUser?.id ?? "guest");
  const selection = useRef<ChatSendScope>({ owner, conversationId: activeChatId, generation: 0 });
  if (selection.current.owner !== owner || selection.current.conversationId !== activeChatId) selection.current = { owner, conversationId: activeChatId, generation: selection.current.generation + 1 };
  const historySequence = useRef(0);
  const viewRevision = useRef(0);
  const listSequence = useRef(0);
  const modelSequence = useRef(0);
  const createSequence = useRef(0);
  const deleteSequence = useRef(new Map<number, number>());
  const exportSequence = useRef(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pendingHistory, setPendingHistory] = useState<{ scope: ChatSendScope; sequence: number; revision: number; messages: UIMessage[] } | null>(null);
  const appliedHistory = useRef(0);
  const sendScope = selection.current;
  const sdkChatId = activeChatId ? `${owner}:${activeChatId}:${sendScope.generation}` : `chat-disabled:${owner}`;
  const lifecycle = useRef<ChatSendLifecycle | null>(null);
  if (!lifecycle.current) lifecycle.current = new ChatSendLifecycle(releaseChatAttachmentPreviews);
  const attachmentRef = useRef<ReturnType<typeof useChatAttachments> | null>(null);
  const latestSend = useRef(new Map<string, string>());
  const mounted = useRef(true);
  const [, bumpRecovery] = useState(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; lifecycle.current?.dispose(); };
  }, []);
  useEffect(() => { setReplyPending(false); }, [owner, activeChatId]);
  const [chatModels, setChatModels] = useState<ChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<number | null>(() => {
    const saved = localStorage.getItem("qmdh_chat_model");
    return saved ? parseInt(saved, 10) : null;
  });
  const [chatError, setChatError] = useState("");
  const [exportingMessageId, setExportingMessageId] = useState<string | null>(null);
  const [streamStatusLabel, setStreamStatusLabel] = useState("");
  const [replyPending, setReplyPending] = useState(false);
  const [contextUsagePercent, setContextUsagePercent] = useState<number | null>(null);
  const [contextTokens, setContextTokens] = useState<number | null>(null);
  const [contextWindowTokens, setContextWindowTokens] = useState<number | null>(null);
  const [agentMode, setAgentMode] = useState(false);
  const [activeToolCalls, setActiveToolCalls] = useState<ChatToolCall[]>([]);
  const [activeTaskProposals, setActiveTaskProposals] = useState<ChatTaskProposal[]>([]);
  const [proposalDecisions, setProposalDecisions] = useState<Record<string, ProposalDecision>>({});
  const [activeThinkingSteps, setActiveThinkingSteps] = useState<ChatThinkingStep[]>([]);
  const [activePolicyVersion, setActivePolicyVersion] = useState<string | null>(null);
  const [agentThinking, setAgentThinking] = useState(false);
  const [agentPolicy, setAgentPolicy] = useState<ChatAgentPolicy | null>(null);
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesBottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const pendingInitialScrollRef = useRef(false);
  const activeChatIdRef = useRef<number | null>(activeChatId);
  activeChatIdRef.current = activeChatId;
  const busyReplyRef = useRef(false);

  const effectiveAgentMode = showChatAgentUi && agentMode;
  const agentModeRef = useRef(effectiveAgentMode);
  agentModeRef.current = effectiveAgentMode;

  const transport = useMemo(
    () =>
      new QmdhChatTransport({
        getConversationId: () => sendScope.conversationId,
        getAgentMode: () => agentModeRef.current,
        isMounted: () => ownsScope(sendScope),
        isCurrentSubmission: id => latestSend.current.get(currentTurnKey(sendScope)) === id && lifecycle.current?.get(id)?.settled === false,
        onSubmissionState: receipt => lifecycle.current?.receipt(receipt),
        onMeta: (meta) => {
          if (meta.label) {
            setStreamStatusLabel(meta.label);
          }
          if (meta.context?.usage_percent != null) {
            setContextUsagePercent(meta.context.usage_percent);
          }
          if (meta.context?.tokens != null) {
            setContextTokens(meta.context.tokens);
          }
          if (meta.context?.window_tokens != null) {
            setContextWindowTokens(meta.context.window_tokens);
          }
          if (meta.context?.compressed) {
            listSequence.current += 1;
            setConversations((current) => !ownsScope(sendScope) ? current :
              current.map((conversation) =>
                conversation.id === sendScope.conversationId
                  ? {
                      ...conversation,
                      has_context_summary: true,
                      context_usage_percent: meta.context?.usage_percent ?? conversation.context_usage_percent,
                      context_tokens: meta.context?.tokens ?? conversation.context_tokens,
                      context_window_tokens: meta.context?.window_tokens ?? conversation.context_window_tokens,
                    }
                  : conversation,
              ),
            );
          }
          if (meta.policy_version) {
            setActivePolicyVersion(meta.policy_version);
          }
        },
        onToolCalls: (toolCalls) => {
          setActiveToolCalls(toolCalls);
        },
        onTaskProposals: (proposals) => {
          setActiveTaskProposals(proposals);
        },
        onThinkingStep: (step) => {
          setAgentThinking(true);
          setActiveThinkingSteps((current) => ownsScope(sendScope) ? mergeThinkingSteps(current, step) : current);
        },
        onPolicyVersion: (policyVersion) => setActivePolicyVersion(policyVersion),
        onAgentThinking: () => setAgentThinking(true),
        onAgentProgress: () => setAgentThinking(false),
      }),
    [sdkChatId],
  );

  const {
    messages: chatMessages,
    sendMessage,
    status,
    setMessages: setChatMessages,
    error: streamError,
  } = useChat({
    id: sdkChatId,
    transport,
    experimental_throttle: 50,
    onFinish: result => finishSend(sendScope, result),
    onError: error => recordSendError(sendScope, error),
  });

  function ownsScope(scope: ChatSendScope): boolean {
    return mounted.current && chatSendScopeKey(selection.current) === chatSendScopeKey(scope);
  }
  function ownsOwner(scope: ChatSendScope): boolean { return mounted.current && selection.current.owner === scope.owner; }
  function selectConversation(conversationId: number | null): ChatSendScope {
    const current = selection.current;
    const next = current.conversationId === conversationId ? current : { ...current, conversationId, generation: current.generation + 1 };
    selection.current = next; activeChatIdRef.current = conversationId;
    historySequence.current += 1; viewRevision.current += 1;
    setActiveChatId(conversationId);
    setHistoryLoading(false); setPendingHistory(null); setReplyPending(false); setExportingMessageId(null);
    setChatError(""); setStreamStatusLabel(""); resetChatStreamStatusTelemetry();
    setActiveToolCalls([]); setActiveTaskProposals([]); setProposalDecisions({}); setActiveThinkingSteps([]); setActivePolicyVersion(null); setAgentThinking(false);
    setContextUsagePercent(null); setContextTokens(null); setContextWindowTokens(null);
    return next;
  }
  useEffect(() => {
    if (!pendingHistory || !ownsScope(pendingHistory.scope) || pendingHistory.sequence !== historySequence.current || pendingHistory.revision !== viewRevision.current || appliedHistory.current === pendingHistory.sequence) return;
    // useChat's setter follows the current ref. Apply only after this render selected the source SDK id.
    if (chatSendScopeKey(sendScope) !== chatSendScopeKey(pendingHistory.scope)) return;
    appliedHistory.current = pendingHistory.sequence;
    setChatMessages(pendingHistory.messages); setPendingHistory(null);
  }, [pendingHistory, sdkChatId]);
  function currentTurnKey(scope: ChatSendScope): string { return JSON.stringify([scope.owner, scope.conversationId]); }
  function refreshRecovery() { if (mounted.current) bumpRecovery(current => current + 1); }
  function markClientMessage(entry: ChatSendEntry, submissionState: string, remove = false) {
    if (!ownsScope(entry.scope)) return;
    setChatMessages(current => remove ? current.filter(message => message.id !== entry.id) : current.map(message => message.id === entry.id ? {
      ...message, metadata: { ...(message.metadata ?? {}), submission_state: submissionState },
    } : message));
  }
  function canRestoreDraft(entry: ChatSendEntry): boolean {
    const composer = attachmentRef.current;
    return entry.phase === "rejected" && selection.current.owner === entry.scope.owner && selection.current.conversationId === entry.conversationId &&
      chatInputRef.current === "" && composer !== null && !composer.uploading && composer.getAttachments().length === 0;
  }
  function restoreRejectedDraft(id: string) {
    const entry = lifecycle.current?.get(id), composer = attachmentRef.current;
    if (!entry || !composer || !canRestoreDraft(entry) || !composer.restoreAttachments(entry.held)) return;
    const draft = lifecycle.current?.takeRejected(id);
    if (draft) replaceChatInput(draft.rawText);
    refreshRecovery();
  }
  function recordSendError(scope: ChatSendScope, error: unknown) {
    lifecycle.current?.error(scope, error);
    const message = error instanceof Error ? error.message : String(error);
    reportChatTelemetry({ event: "chat.stream.client_error", detail: message.slice(0, 500), conversation_id: scope.conversationId });
    if (ownsScope(scope)) setChatError(mapClientStreamErrorMessage(message));
  }
  function finishSend(scope: ChatSendScope, result: ChatSendFinish) {
    const pending = lifecycle.current?.forScope(scope);
    if (!pending) return;
    const entry = lifecycle.current?.finish(pending.id, result);
    if (!entry) return;
    if (ownsScope(scope)) {
      setReplyPending(false); setStreamStatusLabel(""); resetChatStreamStatusTelemetry(); setAgentThinking(false);
    }
    if (entry.phase === "rejected") {
      markClientMessage(entry, "rejected", true);
      if (ownsScope(scope) && canRestoreDraft(entry)) restoreRejectedDraft(entry.id);
      if (ownsScope(scope)) setChatError(entry.error ? mapClientStreamErrorMessage(entry.error) : "本次消息未被接收，草稿已保留，可核对后手动重试。");
    } else if (entry.phase === "unknown") {
      markClientMessage(entry, "unknown");
      if (ownsScope(scope)) setChatError("是否接收这条消息尚未确认。原文和附件已保留，请先核对服务器记录，不要直接重发。");
    } else {
      markClientMessage(entry, entry.failed ? "accepted_failed" : "accepted");
      if (entry.failed) {
        if (ownsScope(scope)) setChatError("消息已被接收，但回复未完成；已保留收到的正文和产物，请勿重复发送这条消息。");
      } else void syncChatMessagesFromServer(entry);
    }
    refreshRecovery();
    void flushChatTelemetry();
  }
  async function syncChatMessagesFromServer(entry: ChatSendEntry) {
    const revision = viewRevision.current, listRequest = ++listSequence.current;
    try {
      const [nextConversations, nextMessages] = await Promise.all([api.getChatConversations(), api.getChatMessages(entry.conversationId)]);
      if (!ownsScope(entry.scope) || revision !== viewRevision.current || latestSend.current.get(currentTurnKey(entry.scope)) !== entry.id) return;
      if (entry.userMessageId == null || !nextMessages.some(message => message.id === entry.userMessageId && message.role === "user")) return;
      if (listRequest === listSequence.current) setConversations(nextConversations);
      setChatMessages(toUiMessages(nextMessages));
      setActiveThinkingSteps([]); setActiveTaskProposals([]); setActiveToolCalls([]);
    } catch {
      // Keep the streamed transcript, durable attachments and known artifacts.
    }
  }
  async function inspectUnknownSend(id: string) {
    const entry = lifecycle.current?.get(id);
    if (!entry || entry.phase !== "unknown" || entry.checking || entry.scope.owner !== selection.current.owner || entry.conversationId !== selection.current.conversationId) return;
    const inspectionScope = selection.current;
    entry.checking = true; entry.checked = false; refreshRecovery();
    try {
      const records = await api.getChatMessages(entry.conversationId);
      if (!ownsScope(inspectionScope) || lifecycle.current?.get(id) !== entry) return;
      entry.inspectedMessages = records; entry.checked = true;
    } catch (error) {
      if (ownsScope(inspectionScope)) setChatError(`未完成服务器记录核对，仍不能直接重发。${error instanceof Error ? error.message : "请稍后重试"}`);
    } finally {
      entry.checking = false; refreshRecovery();
    }
  }
  function dismissRecovery(id: string, acknowledged: boolean) {
    const entry = lifecycle.current?.get(id);
    if (!entry || entry.checking || entry.scope.owner !== selection.current.owner || entry.conversationId !== selection.current.conversationId || (acknowledged && !entry.checked)) return;
    markClientMessage(entry, acknowledged ? "accepted_by_user" : "unknown_abandoned");
    lifecycle.current?.discard(id); refreshRecovery();
  }

  const streaming = status === "streaming" || status === "submitted";
  const busyReply = streaming || replyPending;
  busyReplyRef.current = busyReply;
  const activeConversation = conversations.find((conversation) => conversation.id === activeChatId) ?? null;
  const displayUsagePercent = contextUsagePercent ?? activeConversation?.context_usage_percent ?? 0;
  const displayContextTokens = contextTokens ?? activeConversation?.context_tokens ?? 0;
  const displayContextWindow = contextWindowTokens ?? activeConversation?.context_window_tokens ?? 0;
  const attachmentState = useChatAttachments({
    disabled: isGuest || busyReply || activeChatId == null,
    conversationId: activeChatId,
  });
  attachmentRef.current = attachmentState;
  const sendRecoveries = lifecycle.current?.recoveries(owner, activeChatId) ?? [];
  const sendBlocked = lifecycle.current?.blocking(owner, activeChatId) ?? false;

  useEffect(() => {
    if (!busyReply || !streamStatusLabel.trim()) {
      return;
    }
    reportChatStreamStatus(streamStatusLabel, activeChatIdRef.current);
  }, [busyReply, streamStatusLabel]);

  function updateAutoScrollState() {
    const element = messagesRef.current;
    if (!element) {
      return;
    }
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= 96;
  }

  function scrollMessagesToBottom(behavior: ScrollBehavior = "auto") {
    messagesBottomRef.current?.scrollIntoView({ block: "end", behavior });
  }

  function resizeTextarea() {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }

  async function refreshConversations(scope: ChatSendScope) {
    const request = ++listSequence.current;
    const nextConversations = await api.getChatConversations();
    if (ownsOwner(scope) && request === listSequence.current) setConversations(nextConversations);
    // This owner-level list read never chooses a view or clears a mutable SDK ref.
    return nextConversations;
  }

  async function loadConversation(conversationId: number, listedConversation?: ChatConversation) {
    if (!ownsOwner(sendScope)) return;
    const previousConversationId = selection.current.conversationId;
    if (previousConversationId === conversationId && lifecycle.current?.blocking(owner, conversationId)) return;
    if (busyReplyRef.current && previousConversationId != null && previousConversationId !== conversationId) {
      reportChatTelemetry({ event: "chat.conversation.switch", detail: `from=${previousConversationId} to=${conversationId}`, conversation_id: previousConversationId });
      void flushChatTelemetry();
    }
    const scope = selectConversation(conversationId), sequence = historySequence.current, revision = viewRevision.current;
    setHistoryLoading(true);
    pendingInitialScrollRef.current = true; previousMessageCountRef.current = 0;
    const listed = listedConversation ?? conversations.find(item => item.id === conversationId);
    setContextUsagePercent(listed?.context_usage_percent ?? 0);
    setContextTokens(listed?.context_tokens ?? 0);
    setContextWindowTokens(listed?.context_window_tokens ?? 0);
    setSelectedModel(listed?.model_provider_id ?? null);
    if (listed?.model_provider_id != null) localStorage.setItem("qmdh_chat_model", String(listed.model_provider_id));
    const current = () => ownsScope(scope) && sequence === historySequence.current && revision === viewRevision.current;
    try {
      const nextMessages = await api.getChatMessages(conversationId);
      if (current()) setPendingHistory({ scope, sequence, revision, messages: toUiMessages(nextMessages) });
    } catch (error) {
      if (current()) setChatError(error instanceof Error ? error.message : "加载会话消息失败");
    } finally {
      if (current()) setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (chatAgentUiEnabled === null) {
      return;
    }
    if (!chatAgentUiEnabled) {
      setAgentMode(false);
      return;
    }
    const saved = localStorage.getItem(AGENT_MODE_STORAGE_KEY);
    if (saved === null) {
      setAgentMode(chatAgentModeDefaultFor(true));
      return;
    }
    setAgentMode(saved !== "false");
  }, [chatAgentUiEnabled]);

  useEffect(() => {
    if (!showChatAgentUi) {
      return;
    }
    localStorage.setItem(AGENT_MODE_STORAGE_KEY, agentMode ? "true" : "false");
  }, [agentMode, showChatAgentUi]);

  useEffect(() => {
    if (!effectiveAgentMode) {
      setAgentPolicy(null);
      return;
    }
    let cancelled = false;
    void api
      .getChatAgentPolicy()
      .then((policy) => {
        if (!cancelled) {
          setAgentPolicy(policy);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgentPolicy(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveAgentMode]);

  useEffect(() => {
    let cancelled = false;
    const scope = selection.current, initialSequence = historySequence.current;
    async function bootstrap() {
      try {
        const [models, nextConversations] = await Promise.all([api.getChatModels(), refreshConversations(scope)]);
        if (cancelled || !ownsOwner(scope)) return;
        setChatModels(models);
        if (!ownsScope(scope) || initialSequence !== historySequence.current) return;
        setChatError("");
        const initialConversationId = nextConversations.some(item => item.id === scope.conversationId) ? scope.conversationId : nextConversations[0]?.id ?? null;
        if (initialConversationId !== null) await loadConversation(initialConversationId, nextConversations.find(item => item.id === initialConversationId));
        else selectConversation(null);
      } catch (error) {
        if (!cancelled && ownsScope(scope) && initialSequence === historySequence.current) setChatError(error instanceof Error ? error.message : "加载 Chat 页面失败");
      }
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, [owner, isGuest]);

  useEffect(() => {
    if (activeChatId == null) {
      localStorage.removeItem(ACTIVE_CHAT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, String(activeChatId));
  }, [activeChatId]);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    pendingInitialScrollRef.current = true;
    previousMessageCountRef.current = 0;
  }, [activeChatId]);

  useEffect(() => {
    resizeTextarea();
  }, [chatInput]);

  useEffect(() => {
    if (!streamError || lifecycle.current?.blocking(owner, activeChatId)) {
      return;
    }
    const friendly = mapClientStreamErrorMessage(streamError.message);
    setChatError((current) => (current === friendly ? current : friendly));
  }, [streamError, owner, activeChatId]);

  const lastMessage = chatMessages[chatMessages.length - 1];
  const lastMessageContent = lastMessage ? getUiMessageText(lastMessage) : "";

  useEffect(() => {
    const messageCount = chatMessages.length;
    if (messageCount === 0) {
      previousMessageCountRef.current = 0;
      return;
    }

    const hasNewMessage = messageCount > previousMessageCountRef.current;
    const shouldScroll = pendingInitialScrollRef.current || shouldAutoScrollRef.current;

    if (shouldScroll) {
      const behavior: ScrollBehavior = hasNewMessage ? "smooth" : "auto";
      requestAnimationFrame(() => scrollMessagesToBottom(behavior));
      pendingInitialScrollRef.current = false;
    }

    previousMessageCountRef.current = messageCount;
  }, [activeChatId, chatMessages.length, lastMessageContent]);

  async function handleModelChange(nextProviderId: number) {
    const scope = sendScope, navigation = historySequence.current;
    if (!(ownsScope(scope) && navigation === historySequence.current)) return;
    const request = ++modelSequence.current;
    listSequence.current += 1;
    setSelectedModel(nextProviderId); localStorage.setItem("qmdh_chat_model", String(nextProviderId));
    if (scope.conversationId == null) return;
    try {
      const updated = await api.updateChatConversation(scope.conversationId, { model_provider_id: nextProviderId });
      if (!(ownsScope(scope) && navigation === historySequence.current) || request !== modelSequence.current) return;
      listSequence.current += 1;
      setConversations(current => !(ownsScope(scope) && navigation === historySequence.current) || request !== modelSequence.current ? current : current.map(conversation => conversation.id === scope.conversationId ? {
        ...conversation, model_provider_id: updated.model_provider_id,
        has_context_summary: updated.has_context_summary ?? conversation.has_context_summary,
        context_usage_percent: updated.context_usage_percent ?? conversation.context_usage_percent,
        context_tokens: updated.context_tokens ?? conversation.context_tokens,
        context_window_tokens: updated.context_window_tokens ?? conversation.context_window_tokens,
        updated_at: updated.updated_at,
      } : conversation));
      setContextUsagePercent(updated.context_usage_percent ?? null);
      setContextTokens(updated.context_tokens ?? null); setContextWindowTokens(updated.context_window_tokens ?? null); setChatError("");
    } catch (error) {
      if ((ownsScope(scope) && navigation === historySequence.current) && request === modelSequence.current) setChatError(error instanceof Error ? error.message : "切换模型失败");
    }
  }

  async function handleCreateConversation() {
    const scope = sendScope, navigation = historySequence.current;
    if (!(ownsScope(scope) && navigation === historySequence.current)) return;
    if (isGuest) { setChatError("访客模式无法新建对话，请先登录。"); return; }
    if (!selectedModel) { setChatError("请先选择模型。"); return; }
    const request = ++createSequence.current;
    listSequence.current += 1;
    try {
      const conversation = await api.createChatConversation(selectedModel);
      if (!ownsOwner(scope) || request !== createSequence.current) return;
      listSequence.current += 1;
      setConversations(current => ownsOwner(scope) ? [conversation, ...current.filter(item => item.id !== conversation.id)] : current);
      if (!(ownsScope(scope) && navigation === historySequence.current)) return;
      const nextConversations = await refreshConversations(scope);
      if ((ownsScope(scope) && navigation === historySequence.current) && request === createSequence.current) await loadConversation(conversation.id, nextConversations.find(item => item.id === conversation.id) ?? conversation);
    } catch (error) {
      if ((ownsScope(scope) && navigation === historySequence.current) && request === createSequence.current) setChatError(error instanceof Error ? error.message : "创建新对话失败");
    }
  }

  async function handleDeleteConversation(conversationId: number) {
    const scope = sendScope, navigation = historySequence.current;
    if (!(ownsScope(scope) && navigation === historySequence.current)) return;
    if (isGuest) { setChatError("访客模式无法删除对话，请先登录。"); return; }
    const request = (deleteSequence.current.get(conversationId) ?? 0) + 1;
    deleteSequence.current.set(conversationId, request);
    listSequence.current += 1;
    try {
      await api.deleteChatConversation(conversationId);
      if (!ownsOwner(scope)) return;
      listSequence.current += 1;
      setConversations(current => ownsOwner(scope) ? current.filter(item => item.id !== conversationId) : current);
      if (!(ownsScope(scope) && navigation === historySequence.current) || request !== deleteSequence.current.get(conversationId) || scope.conversationId !== conversationId) return;
      const nextConversations = await refreshConversations(scope);
      if (!(ownsScope(scope) && navigation === historySequence.current) || request !== deleteSequence.current.get(conversationId)) return;
      const fallback = nextConversations.find(item => item.id !== conversationId);
      if (fallback) await loadConversation(fallback.id, fallback);
      else selectConversation(null);
    } catch (error) {
      if ((ownsScope(scope) && navigation === historySequence.current) && request === deleteSequence.current.get(conversationId)) setChatError(error instanceof Error ? error.message : "删除会话失败");
    }
  }

  async function handleExportWord(message: UIMessage) {
    const scope = sendScope, navigation = historySequence.current, request = ++exportSequence.current;
    if (!(ownsScope(scope) && navigation === historySequence.current) || !activeChatId) {
      return;
    }
    const text = getUiMessageText(message).trim();
    if (!text) {
      return;
    }

    const messageId = getPersistedMessageId(message);
    setExportingMessageId(message.id);
    setChatError("");
    try {
      await api.exportChatMessageWord(activeChatId, {
        message_id: messageId ?? undefined,
        content: messageId ? undefined : text,
      });
    } catch (error) {
      if ((ownsScope(scope) && navigation === historySequence.current) && request === exportSequence.current) setChatError(error instanceof Error ? error.message : "导出 Word 失败");
    } finally {
      if ((ownsScope(scope) && navigation === historySequence.current) && request === exportSequence.current) setExportingMessageId(null);
    }
  }

  async function handleSendMessage() {
    if (!ownsScope(sendScope)) return;
    if (isGuest) { setChatError("访客模式无法发送消息，请先登录。"); return; }
    const currentAttachments = attachmentState.getAttachments();
    const ready = currentAttachments.filter(item => item.status === "ready" && item.storagePath);
    const rawText = chatInputRef.current;
    const hasText = Boolean(rawText.trim()), hasAttachments = ready.length > 0;
    if ((!hasText && !hasAttachments) || !activeChatId || busyReply || attachmentState.uploading || currentAttachments.some(item => item.status === "uploading") || lifecycle.current?.blocking(owner, activeChatId)) {
      if (busyReply || lifecycle.current?.blocking(owner, activeChatId)) setChatError("本会话仍有发送中或受理未知的消息，请先等待或核对，不要重复发送。");
      return;
    }
    let uiAttachments;
    try {
      uiAttachments = ready.map(item => ({ file_name: item.fileName, mime_type: item.mimeType,
        url: chatAttachmentMessageUrl(item.storagePath), storage_path: item.storagePath, kind: item.kind }));
    } catch (error) { setChatError(error instanceof Error ? error.message : "附件地址未就绪，草稿已保留。"); return; }
    const attachments = attachmentState.toSendPayload();
    const detached = attachmentState.takeAttachments(ready.map(item => item.localId));
    const id = createChatClientMessageId();
    let entry: ChatSendEntry;
    try { entry = lifecycle.current!.begin(id, sendScope, rawText, detached); }
    catch (error) { attachmentState.restoreAttachments(detached); setChatError(error instanceof Error ? error.message : "无法开始发送，草稿已保留。"); return; }
    viewRevision.current += 1; setHistoryLoading(false);
    latestSend.current.set(currentTurnKey(sendScope), id);
    replaceChatInput(""); setChatError(""); setReplyPending(true); setStreamStatusLabel("准备处理您的消息…");
    reportChatTelemetry({ event: "chat.send.clicked", detail: hasAttachments ? `attachments=${ready.length}` : "", conversation_id: activeChatId });
    attachmentState.setError(""); shouldAutoScrollRef.current = true;
    setActiveToolCalls([]); setActiveTaskProposals([]); setActiveThinkingSteps([]); setActivePolicyVersion(null);
    if (effectiveAgentMode) setAgentThinking(true);
    try {
      void sendMessage({ id, role: "user", parts: [{ type: "text", text: rawText.trim() }], metadata: { attachments: uiAttachments, submission_state: "pending" } }, {
        body: { attachments, agent_mode: effectiveAgentMode, conversation_id: activeChatId, client_message_id: id, sdk_chat_id: sdkChatId },
      }).then(() => {
        // Fulfillment is not success. The installed SDK reports failures through callbacks.
        if (lifecycle.current?.get(id) && !entry.settled) finishSend(entry.scope, { isError: true, isAbort: false, isDisconnect: false });
      }).catch((error: unknown) => {
        if (!entry.settled) { recordSendError(entry.scope, error); finishSend(entry.scope, { isError: true, isAbort: false, isDisconnect: false }); }
      });
    } catch (error) {
      recordSendError(entry.scope, error); finishSend(entry.scope, { isError: true, isAbort: false, isDisconnect: false });
    }
  }

  const canSendMessage =
    !isGuest &&
    Boolean(activeChatId) &&
    !busyReply &&
    !sendBlocked &&
    !attachmentState.uploading &&
    (Boolean(chatInput.trim()) || attachmentState.readyCount > 0);

  const chatRounds = useMemo(() => extractChatRounds(chatMessages), [chatMessages]);
  const emptyStreamingText =
    streamStatusLabel || (effectiveAgentMode ? "助手思考中…" : "正在回复…");

  return (
    <section className="chat-page">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-head">
          <button
            type="button"
            className="chat-new-btn"
            disabled={isGuest}
            onClick={() => void handleCreateConversation()}
          >
            <span>+</span>
            {isGuest ? "登录后新建" : "新对话"}
          </button>
          {chatError ? <p className="chat-sidebar-error">{chatError}</p> : null}
        </div>

        <div className="chat-conv-list">
          {conversations.length > 0 ? (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`chat-conv-item ${activeChatId === conversation.id ? "active" : ""}`}
                onClick={() => void loadConversation(conversation.id)}
              >
                <div className="chat-conv-copy">
                  <span className="chat-conv-title">{conversation.title}</span>
                  <small className="chat-conv-time">
                    {formatConversationTime(conversation.updated_at || conversation.created_at)}
                  </small>
                </div>
                <button
                  type="button"
                  className="chat-conv-del"
                  aria-label="删除会话"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDeleteConversation(conversation.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))
          ) : (
            <div className="chat-conv-empty">
              <strong>{isGuest ? "登录后开始对话" : "还没有对话"}</strong>
              <span>
                {isGuest
                  ? "访客模式可浏览对话界面与模型列表，登录后可新建会话。"
                  : "选择模型后，新建一个会话开始聊天。"}
              </span>
            </div>
          )}
        </div>
      </aside>

      <div className="chat-main">
        <header className="chat-topbar">
          <div className="chat-topbar-inner">
            <select
              className="chat-model-select"
              value={selectedModel || ""}
              title={activeChatId ? "切换后，后续回答将使用新模型" : "新建对话时将使用所选模型"}
              onChange={(event) => {
                const value = parseInt(event.target.value, 10);
                if (Number.isNaN(value)) {
                  return;
                }
                void handleModelChange(value);
              }}
            >
              <option value="" disabled>
                选择模型
              </option>
              {chatModels.map((model) => (
                <option key={model.provider_id} value={model.provider_id}>
                  {model.display_name || model.model_name}
                </option>
              ))}
            </select>
            {activeChatId ? (
              <div className="chat-topbar-meta">
                <span className="chat-topbar-title">
                  {activeConversation?.title || ""}
                  {activeConversation?.has_context_summary ? (
                    <span className="chat-context-summary-hint" title="早期对话已压缩为摘要，近期消息仍完整保留">
                      已压缩
                    </span>
                  ) : null}
                </span>
                <div
                  className={`chat-context-meter${displayUsagePercent >= 85 ? " is-high" : ""}`}
                  title={`上下文约 ${displayContextTokens} / ${displayContextWindow || "?"} tokens（摘要+最近原文估算；发消息后更新）`}
                >
                  <span className="chat-context-meter-label">上下文 {displayUsagePercent}%</span>
                  <span className="chat-context-meter-track" aria-hidden="true">
                    <span
                      className="chat-context-meter-fill"
                      style={{ width: `${Math.min(100, displayUsagePercent)}%` }}
                    />
                  </span>
                </div>
              </div>
            ) : null}
            {showChatAgentUi ? (
              <div className="chat-agent-controls">
                <label
                  className={`chat-agent-toggle${agentMode ? " is-on" : " is-off"}`}
                  title="开启后可搜索模板、创建生图/改图/视频任务，并使用记忆"
                >
                  <input
                    type="checkbox"
                    checked={agentMode}
                    onChange={(event) => setAgentMode(event.target.checked)}
                    disabled={streaming || isGuest}
                  />
                  <span className="chat-agent-switch" aria-hidden="true">
                    <span className="chat-agent-switch-frame">
                      <span className="chat-agent-switch-track">
                        <span className="chat-agent-switch-led chat-agent-switch-led--green" />
                        <span className="chat-agent-switch-led chat-agent-switch-led--red" />
                        <span className="chat-agent-switch-knob" />
                      </span>
                    </span>
                  </span>
                  <span className="chat-agent-toggle-label">设计助手</span>
                  <em className="chat-agent-toggle-meta">
                    {agentPolicy ? `${agentPolicy.enabled_tools.length} 工具` : "—"}
                  </em>
                </label>
                <div className={`chat-agent-actions${agentMode ? " is-open" : ""}`} aria-hidden={!agentMode}>
                  <button
                    type="button"
                    className="chat-agent-capabilities-btn"
                    disabled={!agentMode}
                    tabIndex={agentMode ? 0 : -1}
                    onClick={() => setCapabilitiesOpen(true)}
                  >
                    我的助手能力
                  </button>
                  <button
                    type="button"
                    className="chat-agent-capabilities-btn"
                    disabled={!agentMode}
                    tabIndex={agentMode ? 0 : -1}
                    onClick={() => setMemoryOpen(true)}
                  >
                    我的记忆
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </header>

        {showChatAgentUi ? (
          <ChatAgentCapabilitiesDrawer
            open={capabilitiesOpen && agentMode}
            policy={agentPolicy}
            onClose={() => setCapabilitiesOpen(false)}
          />
        ) : null}
        {showChatAgentUi ? (
          <ChatAgentMemoryDrawer open={memoryOpen && agentMode} onClose={() => setMemoryOpen(false)} />
        ) : null}

        {activeChatId ? (
          <div
            className={`chat-compose${attachmentState.isDragging ? " is-dragging" : ""}`}
            onDragEnter={attachmentState.handleDragEnter}
            onDragLeave={attachmentState.handleDragLeave}
            onDragOver={attachmentState.handleDragOver}
            onDrop={attachmentState.handleDrop}
          >
            {attachmentState.isDragging ? (
              <div className="chat-drop-overlay" aria-hidden="true">
                <strong>松开鼠标上传</strong>
                <span>支持图片，或 PDF / TXT / MD / JSON / CSV / DOCX / XLSX</span>
              </div>
            ) : null}
            <div className="chat-messages-wrap">
              <div className="chat-messages" ref={messagesRef} onScroll={updateAutoScrollState}>
                {activeToolCalls.length > 0 ? (
                  <div className="chat-tool-call-panel">
                    <ChatToolCallList
                      toolCalls={activeToolCalls}
                      policyVersion={activePolicyVersion ?? agentPolicy?.policy_version}
                    />
                  </div>
                ) : null}
                {activeTaskProposals.length > 0 ? (
                  <div className="chat-task-proposal-panel">
                    {activeTaskProposals.map((proposal) => (
                      <ChatTaskProposalCard
                        key={proposal.proposal_id}
                        proposal={proposal}
                        conversationId={activeChatId}
                        policyVersion={activePolicyVersion ?? agentPolicy?.policy_version}
                        decision={proposalDecisions[proposal.proposal_id]}
                        onDecisionChange={(proposalId, decision) =>
                          ownsScope(sendScope) && setProposalDecisions((current) => ownsScope(sendScope) ? { ...current, [proposalId]: decision } : current)
                        }
                      />
                    ))}
                  </div>
                ) : null}
                {chatMessages.map((message, index) => {
                  const messageToolCalls = getUiMessageAgentToolCalls(message);
                  const messageTaskProposals = getUiMessageAgentTaskProposals(message);
                  const messageThinkingSteps = getUiMessageAgentThinkingSteps(message);
                  const messagePolicyVersion = getUiMessagePolicyVersion(message);
                  const isStreamingMessage =
                    streaming && index === chatMessages.length - 1 && message.role === "assistant";

                  return (
                    <div
                      key={message.id || `${message.role}-${index}`}
                      id={message.role === "user" ? chatRoundElementId(message.id || `user-${index}`) : undefined}
                      className={`chat-msg ${message.role}`}
                    >
                      {message.role === "assistant" ? <div className="chat-msg-avatar">AI</div> : null}
                      {message.role === "user" && ["unknown", "unknown_abandoned", "accepted_failed"].includes(String((message.metadata as { submission_state?: string } | undefined)?.submission_state)) ?
                        <p role="status">{(message.metadata as { submission_state?: string }).submission_state === "accepted_failed" ? "消息已接收，回复未完成；请勿重复发送本条。" : "本条受理尚未确认；不要直接重复发送。"}</p> : null}
                      <div className="chat-msg-bubble">
                        {getUiMessageAttachments(message).length > 0 ? (
                          <div className="chat-msg-attachments">
                            {getUiMessageAttachments(message).map((attachment) =>
                              attachment.kind === "file" ? (
                                <a
                                  key={`${attachment.storage_path}-${attachment.url}`}
                                  className="chat-msg-file"
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <span className="chat-msg-file-icon">DOC</span>
                                  <span className="chat-msg-file-name">{attachment.file_name}</span>
                                </a>
                              ) : (
                                <a
                                  key={`${attachment.storage_path}-${attachment.url}`}
                                  className="chat-msg-attachment"
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <img src={attachment.url} alt={attachment.file_name || "图片附件"} loading="lazy" />
                                </a>
                              ),
                            )}
                          </div>
                        ) : null}
                        {message.role === "assistant" &&
                        isStreamingMessage &&
                        effectiveAgentMode &&
                        (agentThinking || activeThinkingSteps.length > 0) ? (
                          activeThinkingSteps.length > 0 ? (
                            <ChatAgentThinkingPanel steps={activeThinkingSteps} live compact />
                          ) : (
                            <div className="chat-agent-thinking" role="status" aria-live="polite">
                              <span className="chat-agent-thinking-dot" aria-hidden="true" />
                              {emptyStreamingText}
                            </div>
                          )
                        ) : message.role === "assistant" && messageThinkingSteps.length > 0 ? (
                          <ChatAgentThinkingPanel steps={messageThinkingSteps} compact />
                        ) : null}
                        {message.role === "assistant" && messageToolCalls.length > 0 ? (
                          <ChatToolCallList
                            toolCalls={messageToolCalls}
                            compact
                            policyVersion={messagePolicyVersion}
                          />
                        ) : null}
                        {message.role === "assistant" && messageTaskProposals.length > 0 ? (
                          <div className="chat-task-proposal-panel is-inline">
                            {messageTaskProposals.map((proposal) => (
                              <ChatTaskProposalCard
                                key={proposal.proposal_id}
                                proposal={proposal}
                                conversationId={activeChatId}
                                policyVersion={messagePolicyVersion}
                                decision={proposalDecisions[proposal.proposal_id]}
                                onDecisionChange={(proposalId, decision) =>
                                  ownsScope(sendScope) && setProposalDecisions((current) => ownsScope(sendScope) ? { ...current, [proposalId]: decision } : current)
                                }
                              />
                            ))}
                          </div>
                        ) : null}
                        <ChatMessageContent
                          text={getUiMessageText(message)}
                          role={message.role === "user" ? "user" : "assistant"}
                          streaming={isStreamingMessage}
                          emptyStreamingText={
                            isStreamingMessage &&
                            effectiveAgentMode &&
                            (agentThinking || activeThinkingSteps.length > 0)
                              ? ""
                              : emptyStreamingText
                          }
                        />
                        {message.role === "assistant" && getUiMessageText(message).trim() ? (
                          <div className="chat-msg-actions">
                            <button
                              type="button"
                              className="chat-export-word-btn"
                              disabled={
                                streaming && index === chatMessages.length - 1
                                  ? true
                                  : exportingMessageId === message.id
                              }
                              onClick={() => void handleExportWord(message)}
                            >
                              {exportingMessageId === message.id ? "导出中..." : "导出 Word"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {message.role === "user" ? (
                        <div className="chat-msg-avatar chat-msg-avatar-user">
                          {(currentUser?.display_name || "U").slice(0, 1)}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {busyReply && lastMessage?.role === "user" ? (
                  <div className="chat-msg assistant" aria-live="polite">
                    <div className="chat-msg-avatar">AI</div>
                    <div className="chat-msg-bubble">
                      {effectiveAgentMode && (agentThinking || activeThinkingSteps.length > 0) ? (
                        activeThinkingSteps.length > 0 ? (
                          <ChatAgentThinkingPanel steps={activeThinkingSteps} live compact />
                        ) : (
                          <div className="chat-agent-thinking" role="status" aria-live="polite">
                            <span className="chat-agent-thinking-dot" aria-hidden="true" />
                            {emptyStreamingText}
                          </div>
                        )
                      ) : (
                        <div className="chat-msg-content is-pending">{emptyStreamingText}</div>
                      )}
                    </div>
                  </div>
                ) : null}
                <div ref={messagesBottomRef} aria-hidden="true" />
              </div>
              <ChatConversationNav rounds={chatRounds} scrollContainerRef={messagesRef} />
            </div>

            <div className="chat-input-area">
              {historyLoading ? <p role="status">正在加载本会话记录…</p> : null}
              {sendBlocked && !busyReply && sendRecoveries.length === 0 ? <p role="status">本会话已有消息正在处理，原文和附件已保留；请等待结束后再发送。</p> : null}
              {sendRecoveries.map(entry => <section key={entry.id} role="status" aria-label="消息草稿恢复">
                <p>{entry.phase === "rejected" ? "这次消息未被接收，原文和附件仍保留。" : "这次消息是否被接收尚未确认，核对前后都不会自动重发。"}</p>
                <pre>{entry.rawText}</pre>
                <p>{entry.attachments.map(item => item.fileName).join("、")}</p>
                {entry.phase === "rejected" ? <>
                  <button type="button" disabled={!canRestoreDraft(entry)} onClick={() => restoreRejectedDraft(entry.id)}>恢复这次未发送的草稿</button>
                  {!canRestoreDraft(entry) ? <p>当前输入或附件仍在，请先保留当前草稿；恢复不会覆盖新输入。</p> : null}
                </> : <>
                  <button type="button" disabled={entry.checking} onClick={() => void inspectUnknownSend(entry.id)}>{entry.checking ? "核对中" : "核对服务器记录"}</button>
                  {entry.checked ? <>
                    <p>以下是服务器最近记录。未找到相同文字也不能证明原请求未接收。</p>
                    {entry.inspectedMessages.slice(-6).map((message, index) => <p key={message.id ?? index}>{message.role === "user" ? "我" : "助手"}：{message.content}</p>)}
                    <button type="button" onClick={() => dismissRecovery(entry.id, true)}>我已核对服务器收下，不再重发</button>
                  </> : null}
                </>}
                <button type="button" disabled={entry.checking} onClick={() => dismissRecovery(entry.id, false)}>放弃本次重发并清除恢复草稿</button>
                <p>放弃只处理本地恢复，不代表撤回请求或确认服务器未接收。</p>
              </section>)}

              {busyReply ? (
                <p className="chat-streaming-hint" role="status" aria-live="polite">
                  {streamStatusLabel || "正在处理中…"} 大附件可能需要数十秒，请勿重复点击发送。
                </p>
              ) : null}
              {attachmentState.attachments.length > 0 ||
              attachmentState.uploading ||
              attachmentState.error ? (
                <div className="chat-attachment-bar">
                  {attachmentState.uploading ? (
                    <p className="chat-attachment-uploading" role="status" aria-live="polite">
                      附件上传中…（{attachmentState.uploadingCount}/{attachmentState.attachments.length}）
                      大文件可能需要数十秒，界面未卡死
                    </p>
                  ) : null}
                  {attachmentState.attachments.length > 0 ? (
                    <div className="chat-attachment-list">
                      {attachmentState.attachments.map((attachment, index) => (
                        <div
                          key={attachment.localId}
                          className={`chat-attachment-chip ${attachment.kind === "file" ? "is-file" : ""} ${
                            attachment.status === "uploading" ? "is-uploading" : ""
                          }`}
                          title={
                            attachment.status === "uploading"
                              ? `${attachment.fileName}（上传中）`
                              : attachment.fileName
                          }
                        >
                          {attachment.kind === "image" && attachment.previewUrl ? (
                            <img src={attachment.previewUrl} alt={attachment.fileName} />
                          ) : (
                            <div className="chat-attachment-file">
                              <span>DOC</span>
                              <small>{attachment.fileName}</small>
                            </div>
                          )}
                          {attachment.status === "uploading" ? (
                            <span className="chat-attachment-uploading-mask" aria-hidden="true">
                              <span className="chat-attachment-spinner" />
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="chat-attachment-remove"
                              aria-label={`移除 ${attachment.fileName}`}
                              onClick={() => attachmentState.removeAttachment(index)}
                              disabled={busyReply || attachmentState.uploading}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {attachmentState.error ? <p className="chat-attachment-error">{attachmentState.error}</p> : null}
                </div>
              ) : null}
              <div className="chat-input-box">
                <input
                  ref={attachmentState.fileInputRef}
                  type="file"
                  accept={attachmentState.accept}
                  multiple
                  className="chat-file-input"
                  onChange={attachmentState.handleFileInputChange}
                  disabled={busyReply || attachmentState.uploading || !attachmentState.canAddMore}
                />
                <button
                  type="button"
                  className="chat-attach-btn"
                  aria-label="上传图片或文档"
                  disabled={busyReply || attachmentState.uploading || !attachmentState.canAddMore}
                  onClick={() => attachmentState.fileInputRef.current?.click()}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none" />
                    <path d="M21 15l-5.2-5.2a1.5 1.5 0 0 0-2.1 0L7 16.5" />
                  </svg>
                </button>
                <textarea
                  ref={textareaRef}
                  className="chat-textarea"
                  value={chatInput}
                  onChange={(event) => replaceChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                  placeholder={isGuest ? "登录后可发送消息" : "和我聊聊吧，可附带图片或文档"}
                  rows={1}
                  disabled={isGuest || busyReply || attachmentState.uploading}
                />
                <button
                  type="button"
                  className="chat-send-btn"
                  disabled={!canSendMessage}
                  aria-label={
                    busyReply ? "正在处理中" : attachmentState.uploading ? "附件上传中" : "发送"
                  }
                  title={
                    busyReply
                      ? "正在处理上一条消息，请稍候"
                      : attachmentState.uploading
                        ? "附件上传中，请稍候"
                        : "发送"
                  }
                  onClick={() => void handleSendMessage()}
                >
                  {attachmentState.uploading ? (
                    <span className="chat-send-uploading" aria-hidden="true">
                      <span className="chat-attachment-spinner" />
                    </span>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 2L11 13" />
                      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="chat-empty">
            {chatModels.length === 0 ? (
              <div className="chat-empty-inner">
                <h2>暂无可用模型</h2>
                <p>请先在后台模型管理里启用支持 chat.completions 的模型。</p>
              </div>
            ) : (
              <div className="chat-empty-inner">
                <h2>{isGuest ? "访客模式" : "QMDH Chat"}</h2>
                <p>
                  {isGuest
                    ? "登录后可选择模型并新建会话，与 AI 对话。"
                    : "选择模型并创建新对话后，就可以开始聊天了。"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
