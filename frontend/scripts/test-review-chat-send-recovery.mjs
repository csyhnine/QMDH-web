import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { Chat } from "@ai-sdk/react";
import { HttpChatTransport } from "ai";

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const clone = value => JSON.parse(JSON.stringify(value));
function compile(source, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText,
  { exports, Error, TypeError, URL, Response, ReadableStream, TextDecoder, TextEncoder, AbortController,
    structuredClone, crypto, ...globals, require(name) { if (Object.hasOwn(imports, name)) return imports[name]; throw Error(`Unexpected import ${name}`); } });
  return exports;
}
function text(n) { if (n == null || typeof n === "boolean") return ""; if (Array.isArray(n)) return n.map(text).join(""); return typeof n === "object" ? text(n.props?.children) : String(n); }
const tick = () => new Promise(resolve => setTimeout(resolve, 1));
const sse = (lines, userMessageId = 101) => new Response(lines.map(line => `data: ${typeof line === "string" ? line : JSON.stringify(line)}\n\n`).join(""), {
  headers: { "content-type": "text/event-stream", "X-QMDH-Chat-User-Message-ID": String(userMessageId), "X-QMDH-Chat-Turn-ID": "201" },
});
function harness({ response = () => sse([{ delta: "synthetic response" }, "[DONE]"]) } = {}) {
  let cursor = 0, changed = false, mounted = true, tree, lateWrites = 0;
  const slots = [], effects = [], updates = [], requests = [], events = [], sends = [], chats = [], revoked = [], previews = [];
  const world = { historyReads: [], historyFail: false, records: new Map([[1, []], [2, []]]), response, uploads: 0 };
  const storage = new Map([["qmdh.active.chat", "1"], ["qmdh_chat_model", "1"]]);
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], next => { if (mounted) { updates.push({ i, next }); changed = true; } else lateWrites++; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(create, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) slots[i] = { deps, value: create() }; return slots[i].value; },
    useEffect(create, deps) { const i = cursor++, old = slots[i]; if (!deps || !old || deps.some((v, j) => !Object.is(v, old.deps[j]))) { const next = { deps }; slots[i] = next; effects.push(() => { old?.cleanup?.(); next.cleanup = create(); }); } },
  };
  const api = {
    getChatModels: async () => [{ provider_id: 1, provider_name: "synthetic", display_name: "synthetic", model_name: "synthetic", base_url: "unused" }],
    getChatConversations: async () => [1, 2].map(id => ({ id, title: `conversation ${id}`, model_provider_id: 1, created_at: "", updated_at: "" })),
    getChatMessages: async id => { world.historyReads.push(id); if (world.historyFail) throw Error("synthetic history unavailable"); if (world.getMessages) return world.getMessages(id); return clone(world.records.get(id) ?? []); },
    uploadChatAttachment: async payload => { world.uploads++; if (world.uploadGate) await world.uploadGate.promise; return { file_name: payload.file_name, storage_path: world.storagePath ?? `/media/chat/${payload.file_name}`, mime_type: payload.file_name.endsWith(".txt") ? "text/plain" : "image/png", kind: payload.file_name.endsWith(".txt") ? "file" : "image" }; },
  };
  const telemetry = new Proxy({}, { get: (_, key) => key === "mapClientStreamErrorMessage" ? value => value : () => {} });
  const requestAnimationFrame = fn => queueMicrotask(fn);
  const window = { setTimeout(fn, ms) { return setTimeout(() => { world.onYield?.(); fn(); }, ms); }, clearTimeout, localStorage, addEventListener() {}, removeEventListener() {} };
  const url = class extends URL {};
  url.createObjectURL = value => { const id = URL.createObjectURL(value); previews.push(id); return id; };
  url.revokeObjectURL = id => { revoked.push(id); URL.revokeObjectURL(id); };
  class FileReader { readAsDataURL(file) { this.result = `data:${file.type};base64,c3ludGhldGlj`; queueMicrotask(() => this.onload?.()); } }
  const globals = { window, localStorage, URL: url, requestAnimationFrame, FileReader, navigator: { onLine: true } };
  const attachmentUtils = compile(read("lib/chat/chatAttachmentUtils.ts"), { "../../api": { api }, "../../utils/uploads": { validateChatDocumentSize: () => null, validateReferenceImageSize: () => null } }, globals);
  const attachmentHook = compile(read("lib/chat/useChatAttachments.ts"), { react: hooks, "./chatAttachmentUtils": attachmentUtils, "./chatTelemetry": telemetry }, globals);
  let currentAttachments;
  const attachmentBridge = { useChatAttachments(options) { return currentAttachments = attachmentHook.useChatAttachments(options); } };
  const parser = compile(read("lib/chat/qmdhSseParser.ts"));
  const types = compile(read("lib/chat/types.ts"));
  const transport = compile(read("lib/chat/qmdhChatTransport.ts"), { ai: { HttpChatTransport }, "../../api": { buildApiUrl: path => `/offline${path}`, getAuthHeaders: () => ({}) },
    "./qmdhSseParser": parser, "./chatTelemetry": telemetry, "./types": types }, { ...globals, fetch: async (path, init) => {
    requests.push({ path, body: JSON.parse(init.body), signal: init.signal });
    return world.response(path, init);
  } });
  let chatRef = { current: null };
  function useChat(options) {
    if (!chatRef.current || chatRef.current.id !== options.id) {
      const sdk = new Chat({ ...options, onError(error) { events.push({ type: "error", error }); options.onError?.(error); },
        onFinish(event) { events.push({ type: "finish", isError: event.isError, isAbort: event.isAbort, isDisconnect: event.isDisconnect }); options.onFinish?.(event); } });
      const send = sdk.sendMessage;
      sdk.sendMessage = (...args) => { const promise = send(...args); sends.push(promise); return promise; };
      chats.push(sdk); chatRef.current = sdk;
    }
    // Same mutable current-ref setter contract as the installed useChat source.
    return { messages: chatRef.current.messages, status: chatRef.current.status, error: chatRef.current.error,
      sendMessage: chatRef.current.sendMessage, stop: chatRef.current.stop,
      setMessages(update) { chatRef.current.messages = typeof update === "function" ? update(chatRef.current.messages) : update; } };
  }
  const messageUtils = compile(read("lib/chat/qmdhChatMessageUtils.ts"));
  const rounds = compile(read("lib/chat/chatRoundUtils.ts"), { "./qmdhChatMessageUtils": messageUtils });
  const imports = { react: hooks, "@ai-sdk/react": { useChat }, "../../api": { api }, "../../context/AuthContext": { useAuth: () => ({ currentUser: { id: 1, display_name: "synthetic" }, isGuest: false }) },
    "../../lib/chat/qmdhChatMessageUtils": messageUtils, "../../lib/chat/chatRoundUtils": rounds, "../../lib/chat/chatTelemetry": telemetry,
    "../../lib/chat/qmdhChatTransport": transport, "../../lib/featureFlags": { chatAgentModeDefaultFor: () => false },
    "../../lib/useChatAgentUiEnabled": { useChatAgentUiEnabled: () => false }, "../../lib/chat/useChatAttachments": attachmentBridge,
    "../../lib/chat/chatAttachmentUtils": attachmentUtils };
  if (existsSync(new URL("../src/lib/chat/chatSendLifecycle.ts", import.meta.url))) imports["../../lib/chat/chatSendLifecycle"] = compile(read("lib/chat/chatSendLifecycle.ts"), {}, globals);
  for (const name of ["ChatAgentCapabilitiesDrawer", "ChatAgentMemoryDrawer", "ChatConversationNav", "ChatMessageContent", "ChatTaskProposalCard", "ChatToolCallList"]) imports[`./${name}`] = { default: () => null };
  imports["./ChatAgentThinkingPanel"] = { default: () => null, mergeThinkingSteps: (items, step) => [...items, step] };
  const jsx = (type, props) => ({ type, props }); imports["react/jsx-runtime"] = { jsx, jsxs: jsx };
  const Page = compile(read("pages/chat/ChatPage.tsx"), imports, globals).default;
  function render() { if (!mounted) return; for (let pass = 0; pass < 30; pass++) {
    for (const { i, next } of updates.splice(0)) slots[i] = typeof next === "function" ? next(slots[i]) : next;
    cursor = 0; changed = false; tree = Page(); effects.splice(0).forEach(fn => fn()); if (!changed) return;
  } throw Error("Page did not settle"); }
  function nodes(n) { if (!arguments.length) n = tree; if (Array.isArray(n)) return n.flatMap(n => nodes(n)); if (!n || typeof n !== "object") return []; return [n, ...nodes(n.props?.children)]; }
  render();
  return { world, requests, events, sends, chats, revoked, previews, render, nodes, attachmentUtils, transport, lifecycleModule: imports["../../lib/chat/chatSendLifecycle"], navigator: globals.navigator, get text() { return text(tree); }, get lateWrites() { return lateWrites; },
    get sdk() { return chatRef.current; },
    get attachments() { return currentAttachments; },
    input() { return nodes().find(n => n.type === "textarea" && n.props.className === "chat-textarea"); },
    edit(value) { this.input().props.onChange({ target: { value } }); render(); },
    async flush() { for (let i = 0; i < 12; i++) { await tick(); render(); } },
    async attach(files) { nodes().find(n => n.type === "input" && n.props.type === "file").props.onChange({ target: { files } }); await this.flush(); },
    clickSend() { nodes().find(n => n.type === "button" && n.props.className === "chat-send-btn").props.onClick(); render(); return sends[sends.length - 1]; },
    button(label) { return nodes().find(n => n.type === "button" && text(n) === label); },
    async choose(id) { nodes().find(n => n.type === "div" && n.props.className?.startsWith("chat-conv-item") && text(n).includes(`conversation ${id}`)).props.onClick(); render(); await this.flush(); },
    startAttach(files) { nodes().find(n => n.type === "input" && n.props.type === "file").props.onChange({ target: { files } }); render(); },
    async send() { this.clickSend(); await Promise.allSettled(sends); await this.flush(); },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); for (const id of previews) URL.revokeObjectURL(id); } };
}

test("actual SDK HTTP403 resolves after error and finish while unsent text and ready image remain recoverable", async () => {
  const h = harness({ response: () => new Response("synthetic ordinary refusal", { status: 403 }) }); await h.flush();
  await h.attach([new File(["synthetic"], "one.png", { type: "image/png" })]);
  h.edit("  unsent draft  "); await h.send();
  assert.deepEqual(h.events.map(e => e.type), ["error", "finish"]); assert.equal(h.events[1].isError, true);
  assert.equal((await Promise.allSettled(h.sends))[0].status, "fulfilled"); assert.equal(h.requests.length, 1);
  assert.equal(h.input().props.value, "  unsent draft  ");
  assert.equal(h.nodes().filter(n => n.type === "img" && n.props.src === h.previews[0]).length, 1);
  assert.equal(h.revoked.length, 0); assert.equal(await (await fetch(h.previews[0])).text(), "synthetic"); h.unmount();
});

test("actual SDK success with failed history sync keeps message attachment on durable URL after composer cleanup", async () => {
  const h = harness(); await h.flush(); await h.attach([new File(["synthetic"], "one.png", { type: "image/png" })]);
  assert.equal(await (await fetch(h.previews[0])).text(), "synthetic"); h.world.historyFail = true; h.edit("sent message"); await h.send();
  assert.equal(h.sdk.status, "ready"); assert.equal(h.requests.length, 1);
  const user = h.sdk.messages.find(m => m.role === "user");
  assert.equal(user.metadata.attachments[0].url, "/media/chat/one.png");
  assert.ok(h.nodes().some(n => n.type === "img" && n.props.src === "/media/chat/one.png"));
  assert.equal(h.revoked.filter(id => id === h.previews[0]).length, 1); h.unmount();
});

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const image = name => new File([`image-${name}`], name, { type: "image/png" });
function controlledSse() {
  let controller;
  const body = new ReadableStream({ start(c) { controller = c; } });
  const response = new Response(body, { headers: { "content-type": "text/event-stream", "X-QMDH-Chat-User-Message-ID": "101", "X-QMDH-Chat-Turn-ID": "201" } });
  return { response,
    emit(value) { controller.enqueue(new TextEncoder().encode(`data: ${typeof value === "string" ? value : JSON.stringify(value)}\n\n`)); },
    close() { controller.close(); }, error(error) { controller.error(error); } };
}
const userRecord = (id, content, attachments = []) => ({ id, role: "user", content, attachments, created_at: "synthetic" });

test("HTTP400 restores multiple ready images and a file and manual retry does not upload again", async t => {
  const h = harness({ response: () => new Response("synthetic ordinary validation", { status: 400 }) }); t.after(() => h.unmount()); await h.flush();
  await h.attach([image("a.png"), image("b.png"), new File(["document"], "c.txt", { type: "text/plain" })]); h.edit("  retry original  "); await h.send();
  assert.equal(h.input().props.value, "  retry original  "); assert.equal(h.requests.length, 1); assert.equal(h.requests[0].body.attachments.length, 3);
  assert.equal(h.revoked.length, 0); assert.equal(h.world.uploads, 3);
  h.world.historyFail = true; h.world.response = () => sse([{ delta: "retry response" }, "[DONE]"]); await h.send();
  assert.equal(h.requests.length, 2); assert.equal(h.world.uploads, 3); assert.equal(h.input().props.value, "");
  assert.deepEqual(h.requests[1].body.attachments, h.requests[0].body.attachments);
  assert.equal(h.sdk.messages.filter(m => m.role === "user").length, 1);
  assert.equal(h.revoked.length, 2); assert.ok(h.sdk.messages[0].metadata.attachments.every(a => a.url.startsWith("/media/")));
});

test("explicit offline preflight makes no POST and restores the raw input and preview", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); await h.attach([image("offline.png")]);
  h.navigator.onLine = false; h.edit("offline raw draft"); await h.send();
  assert.equal(h.requests.length, 0); assert.equal(h.input().props.value, "offline raw draft"); assert.equal(h.revoked.length, 0);
  assert.equal(h.sdk.messages.length, 0); assert.equal(await (await fetch(h.previews[0])).text(), "image-offline.png");
  h.navigator.onLine = true; await h.send(); assert.equal(h.requests.length, 1); assert.equal(h.world.uploads, 1);
});

test("network disconnect stays unknown and cannot automatically restore or directly repeat the POST", async t => {
  const h = harness({ response: () => { throw new TypeError("synthetic network disconnect"); } }); t.after(() => h.unmount()); await h.flush();
  await h.attach([image("unknown.png")]); h.edit("unknown original"); await h.send();
  assert.equal(h.events.at(-1).isDisconnect, true); assert.equal(h.requests.length, 1);
  assert.equal(h.input().props.value, ""); assert.match(h.text, /是否被接收尚未确认/); assert.match(h.text, /unknown original/);
  assert.equal(h.button("恢复这次未发送的草稿"), undefined); assert.equal(h.revoked.length, 0);
  h.edit("new draft while waiting"); await h.send(); assert.equal(h.requests.length, 1); assert.equal(h.input().props.value, "new draft while waiting");
});

test("HTTP500 is not considered a rejection and explicit abandonment releases only its snapshot", async t => {
  const h = harness({ response: () => new Response("synthetic server failure", { status: 500 }) }); t.after(() => h.unmount()); await h.flush();
  await h.attach([image("server.png")]); h.edit("may have been accepted"); await h.send();
  assert.equal(h.input().props.value, ""); assert.match(h.text, /尚未确认/); assert.equal(h.revoked.length, 0);
  assert.equal(await (await fetch(h.previews[0])).text(), "image-server.png");
  h.button("放弃本次重发并清除恢复草稿").props.onClick(); h.render();
  assert.equal(h.revoked.length, 1); assert.equal(h.requests.length, 1); assert.equal(h.sdk.messages[0].metadata.submission_state, "unknown_abandoned");
});

test("accepted upstream error retains the user message partial assistant text and durable attachment", async t => {
  const h = harness({ response: () => sse([{ delta: "partial upstream result" }, { error: { code: "synthetic", summary: "synthetic upstream failed" } }, "[DONE]"]) }); t.after(() => h.unmount()); await h.flush();
  await h.attach([image("partial.png")]); h.edit("accepted original"); await h.send();
  assert.equal(h.requests.length, 1); assert.equal(h.input().props.value, ""); assert.equal(h.revoked.length, 1);
  assert.ok(h.sdk.messages.some(m => m.role === "assistant" && m.parts.some(p => p.type === "text" && p.text.includes("partial upstream result"))));
  assert.equal(h.sdk.messages.find(m => m.role === "user").metadata.attachments[0].url, "/media/chat/partial.png");
  assert.match(h.text, /消息已接收，回复未完成/); assert.equal(h.button("恢复这次未发送的草稿"), undefined);
});

test("early SSE EOF is incomplete even when the real SDK returns ready without isError", async t => {
  const h = harness({ response: () => sse([{ delta: "partial then EOF" }]) }); t.after(() => h.unmount()); await h.flush(); h.edit("accepted at headers"); await h.send();
  assert.equal(h.sdk.status, "ready"); assert.equal(h.events.at(-1).isError, false); assert.match(h.text, /消息已接收，回复未完成/);
  assert.ok(h.sdk.messages.some(m => m.parts.some(p => p.type === "text" && p.text.includes("partial then EOF")))); assert.equal(h.requests.length, 1);
});

test("real SDK stop after acceptance preserves partial reply without restoring an unsent duplicate", async t => {
  const stream = controlledSse();
  const h = harness({ response: (_, init) => { init.signal.addEventListener("abort", () => stream.error(new DOMException("synthetic stop", "AbortError")), { once: true }); return stream.response; } });
  t.after(() => h.unmount()); await h.flush(); await h.attach([image("abort.png")]); h.edit("accepted before stop"); const send = h.clickSend();
  stream.emit({ delta: "partial before stop" }); await h.flush(); await h.sdk.stop(); await send; await h.flush();
  assert.equal(h.events.at(-1).isAbort, true); assert.equal(h.input().props.value, ""); assert.equal(h.revoked.length, 1);
  assert.match(h.text, /消息已接收，回复未完成/); assert.equal(h.requests.length, 1);
});

test("real SDK stop before response headers leaves acceptance unknown rather than clearing its snapshot", async t => {
  const h = harness({ response: (_, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("synthetic early stop", "AbortError")), { once: true })) });
  t.after(() => h.unmount()); await h.flush(); await h.attach([image("early.png")]); h.edit("early stop draft"); const send = h.clickSend();
  await h.sdk.stop(); await send; await h.flush(); assert.equal(h.events.at(-1).isAbort, true);
  assert.match(h.text, /尚未确认/); assert.match(h.text, /early stop draft/); assert.equal(h.revoked.length, 0); assert.equal(h.requests.length, 1);
});

test("successful history synchronization requires the exact acknowledged user message id", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); await h.attach([image("history.png")]);
  h.world.records.set(1, [userRecord(101, "history body", [{ file_name: "history.png", mime_type: "image/png", storage_path: "/media/chat/history.png", url: "/media/chat/history.png", kind: "image" }]), { id: 102, role: "assistant", content: "persisted response" }]);
  h.edit("history body"); await h.send(); assert.deepEqual(h.sdk.messages.map(m => m.id), ["101", "102"]);
  assert.equal(h.sdk.messages[0].metadata.attachments[0].url, "/media/chat/history.png");
  assert.equal(h.revoked.length, 1); assert.equal(h.requests.length, 1);
  assert.deepEqual(Object.keys(h.requests[0].body).sort(), ["agent_mode", "attachments", "content"]);
});

test("history without the acknowledged user id cannot wipe the streamed transcript", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); h.world.records.set(1, [userRecord(999, "unrelated older record")]);
  h.edit("keep streamed body"); await h.send();
  assert.ok(h.sdk.messages.some(m => m.role === "user" && m.parts.some(p => p.type === "text" && p.text === "keep streamed body")));
  assert.ok(!h.sdk.messages.some(m => m.id === "999")); assert.equal(h.requests.length, 1);
});

test("old accepted send releases only its own image while another conversation's new draft survives", async t => {
  const stream = controlledSse(), h = harness({ response: () => stream.response }); t.after(() => h.unmount()); await h.flush();
  await h.attach([image("A.png")]); h.edit("A request"); const send = h.clickSend(); await h.flush();
  await h.choose(2); h.edit("B new draft"); await h.attach([image("B.png")]);
  stream.emit({ delta: "A late response" }); stream.emit("[DONE]"); stream.close(); await send; await h.flush();
  assert.equal(h.input().props.value, "B new draft"); assert.ok(h.sdk.id.includes(":2:")); assert.equal(h.sdk.messages.length, 0);
  assert.equal(h.revoked.filter(id => id === h.previews[0]).length, 1); assert.equal(h.revoked.filter(id => id === h.previews[1]).length, 0);
  assert.equal(await (await fetch(h.previews[1])).text(), "image-B.png"); assert.equal(h.requests.length, 1);
});

test("old rejected send cannot restore over another conversation's text and attachments", async t => {
  const gate = deferred(), h = harness({ response: () => gate.promise }); t.after(() => h.unmount()); await h.flush();
  await h.attach([image("old-A.png")]); h.edit("A unsent"); const send = h.clickSend(); await h.choose(2);
  h.edit("B protected"); await h.attach([image("new-B.png")]); gate.resolve(new Response("synthetic late refusal", { status: 400 })); await send; await h.flush();
  assert.equal(h.input().props.value, "B protected"); assert.ok(h.nodes().some(n => n.type === "img" && n.props.src === h.previews[1]));
  assert.equal(h.button("恢复这次未发送的草稿"), undefined); assert.equal(h.revoked.length, 0); assert.equal(h.requests.length, 1);
});

test("returning to the origin offers explicit restore instead of silently filling a new generation", async t => {
  const gate = deferred(), h = harness({ response: () => gate.promise }); t.after(() => h.unmount()); await h.flush();
  await h.attach([image("restore-A.png")]); h.edit("A recoverable"); const send = h.clickSend(); await h.choose(2);
  gate.resolve(new Response("synthetic refusal", { status: 400 })); await send; await h.flush(); await h.choose(1);
  assert.equal(h.input().props.value, ""); const restore = h.button("恢复这次未发送的草稿"); assert.equal(restore.props.disabled, false);
  restore.props.onClick(); h.render(); assert.equal(h.input().props.value, "A recoverable"); assert.equal(h.world.uploads, 1);
  assert.equal(h.revoked.length, 0); assert.equal(h.sdk.messages.length, 0); assert.equal(h.requests.length, 1);
});

test("controlled newer composer text is never overwritten by an automatic failure restore", async t => {
  const gate = deferred(), h = harness({ response: () => gate.promise }); t.after(() => h.unmount()); await h.flush();
  h.edit("submitted draft"); const send = h.clickSend(); h.edit("new composer version");
  gate.resolve(new Response("synthetic refusal", { status: 400 })); await send; await h.flush();
  assert.equal(h.input().props.value, "new composer version"); assert.equal(h.button("恢复这次未发送的草稿").props.disabled, true);
  h.edit(""); h.button("恢复这次未发送的草稿").props.onClick(); h.render(); assert.equal(h.input().props.value, "submitted draft"); assert.equal(h.requests.length, 1);
});

test("stale send button callback after a conversation switch cannot consume the current composer", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); h.edit("A draft");
  const oldClick = h.nodes().find(n => n.type === "button" && n.props.className === "chat-send-btn").props.onClick;
  await h.choose(2); h.edit("B current"); await h.attach([image("B-current.png")]); oldClick(); h.render(); await h.flush();
  assert.equal(h.input().props.value, "B current"); assert.equal(h.requests.length, 0); assert.equal(h.revoked.length, 0);
  assert.ok(h.nodes().some(n => n.type === "img" && n.props.src === h.previews[0]));
});

test("unknown acceptance is inspected read-only without text matching triggering another POST", async t => {
  const h = harness({ response: () => { throw new TypeError("synthetic network failure"); } }); t.after(() => h.unmount()); await h.flush();
  await h.attach([image("inspect.png")]); h.edit("inspect unknown"); await h.send(); h.world.records.set(1, [userRecord(101, "inspect unknown")]);
  h.button("核对服务器记录").props.onClick(); await h.flush(); assert.match(h.text, /未找到相同文字也不能证明/);
  assert.equal(h.requests.length, 1); assert.equal(h.button("恢复这次未发送的草稿"), undefined);
  h.edit("keep next draft"); h.button("我已核对服务器收下，不再重发").props.onClick(); h.render();
  assert.equal(h.input().props.value, "keep next draft"); assert.equal(h.revoked.length, 1); assert.equal(h.requests.length, 1);
});

test("failed inspection retains unknown ownership and explicit discard does not claim rejection", async t => {
  const h = harness({ response: () => { throw new TypeError("synthetic network failure"); } }); t.after(() => h.unmount()); await h.flush();
  await h.attach([image("discard.png")]); h.edit("still unknown"); await h.send(); h.world.historyFail = true;
  h.button("核对服务器记录").props.onClick(); await h.flush(); assert.match(h.text, /仍不能直接重发/);
  assert.equal(h.button("我已核对服务器收下，不再重发"), undefined); assert.equal(h.revoked.length, 0);
  h.button("放弃本次重发并清除恢复草稿").props.onClick(); h.render();
  assert.equal(h.revoked.length, 1); assert.equal(h.requests.length, 1); assert.equal(h.sdk.messages[0].metadata.submission_state, "unknown_abandoned");
});

test("unmount releases detached pending previews once and late real SDK completion cannot write Page state", async t => {
  const gate = deferred(), h = harness({ response: () => gate.promise }); t.after(() => h.unmount()); await h.flush();
  await h.attach([image("unmount.png")]); h.edit("pending on unmount"); const send = h.clickSend(); h.unmount();
  assert.equal(h.revoked.length, 1); gate.resolve(sse([{ delta: "late reply" }, "[DONE]"])); await send; await h.flush();
  assert.equal(h.lateWrites, 0); assert.equal(h.revoked.length, 1); assert.equal(h.requests.length, 1);
});

test("unmount while an attachment upload is pending releases composer ownership and ignores its late update", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); h.world.uploadGate = deferred();
  h.startAttach([image("uploading.png")]); await h.flush(); assert.equal(h.world.uploads, 1); h.unmount(); assert.equal(h.revoked.length, 1);
  h.world.uploadGate.resolve(); await h.flush(); assert.equal(h.lateWrites, 0); assert.equal(h.revoked.length, 1);
});

test("durable attachment URL conversion preserves existing root paths and CDN URLs and refuses transient keys before clearing", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush();
  for (const path of ["/media/a.png", "/custom-prefix/file.pdf?x=1#page=2", "https://cdn.invalid/a.png?synthetic=1", "//cdn.invalid/a.png"]) assert.equal(h.attachmentUtils.chatAttachmentMessageUrl(path), path);
  for (const path of ["chat/raw-key.png", "blob:synthetic", "data:image/png;base64,eA==", ""]) assert.throws(() => h.attachmentUtils.chatAttachmentMessageUrl(path), /持久地址/);
  h.world.storagePath = "chat/raw-key.png"; await h.attach([image("bad-path.png")]); h.edit("preserved before preflight"); await h.send();
  assert.equal(h.requests.length, 0); assert.equal(h.input().props.value, "preserved before preflight"); assert.equal(h.revoked.length, 0);
});

test("transport uses captured SDK conversation and rejects a mismatched target before dispatch", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush();
  const receipt = [], transport = new h.transport.QmdhChatTransport({ getConversationId: () => 2, onSubmissionState: value => receipt.push(value) });
  const sdk = new Chat({ id: "1", transport });
  await sdk.sendMessage({ id: "direct-one", role: "user", parts: [{ type: "text", text: "origin one" }] }, { body: { conversation_id: 1, client_message_id: "direct-one", sdk_chat_id: "1" } });
  assert.equal(h.requests.length, 1); assert.match(h.requests[0].path, /conversations\/1\/messages$/);
  assert.equal(receipt.find(r => r.kind === "accepted").userMessageId, 101); assert.equal(receipt.find(r => r.kind === "accepted").turnId, 201);
  await sdk.sendMessage({ id: "direct-two", role: "user", parts: [{ type: "text", text: "wrong target" }] }, { body: { conversation_id: 2, client_message_id: "direct-two", sdk_chat_id: "1" } });
  assert.equal(h.requests.length, 1); assert.equal(sdk.status, "error"); assert.ok(receipt.some(r => r.kind === "not-sent"));
});

test("A B A reentry keeps the original send blocked with a visible waiting state and preserves a newer draft", async t => {
  const gate = deferred(), h = harness({ response: () => gate.promise }); t.after(() => h.unmount()); await h.flush();
  h.edit("original A"); const send = h.clickSend(); await h.choose(2); await h.choose(1); h.edit("new A draft");
  assert.match(h.text, /本会话已有消息正在处理/); assert.equal(h.nodes().find(n => n.type === "button" && n.props.className === "chat-send-btn").props.disabled, true);
  gate.resolve(new Response("synthetic old refusal", { status: 400 })); await send; await h.flush();
  assert.equal(h.input().props.value, "new A draft"); assert.equal(h.button("恢复这次未发送的草稿").props.disabled, true); assert.equal(h.requests.length, 1);
});

test("an older successful history query cannot erase a newer send in the same generation", async t => {
  let responseCount = 0;
  const h = harness({ response: () => sse([{ delta: "stream reply" }, "[DONE]"], ++responseCount === 1 ? 101 : 103) });
  t.after(() => h.unmount()); await h.flush(); const first = deferred(), second = deferred(); let reads = 0;
  h.world.getMessages = () => (++reads === 1 ? first.promise : second.promise);
  h.edit("first send"); await h.send(); h.edit("second send"); await h.send();
  first.resolve([userRecord(101, "first send"), { id: 102, role: "assistant", content: "old server reply" }]); await h.flush();
  assert.ok(h.sdk.messages.some(m => m.parts.some(p => p.type === "text" && p.text === "second send")));
  second.resolve([userRecord(101, "first send"), { id: 102, role: "assistant", content: "old server reply" }, userRecord(103, "second send"), { id: 104, role: "assistant", content: "new server reply" }]); await h.flush();
  assert.equal(h.sdk.messages.at(-1).id, "104"); assert.equal(h.requests.length, 2);
});

test("restored composer removal and unmount each release only their currently owned preview", async t => {
  const h = harness({ response: () => new Response("synthetic refusal", { status: 400 }) }); t.after(() => h.unmount()); await h.flush();
  await h.attach([image("remove-one.png"), image("keep-two.png")]); h.edit("restore then remove"); await h.send();
  h.nodes().find(n => n.type === "button" && n.props["aria-label"] === "移除 remove-one.png").props.onClick(); h.render();
  assert.equal(h.revoked.filter(id => id === h.previews[0]).length, 1); assert.equal(h.revoked.filter(id => id === h.previews[1]).length, 0);
  await assert.rejects(fetch(h.previews[0])); assert.equal(await (await fetch(h.previews[1])).text(), "image-keep-two.png");
  h.unmount(); assert.equal(h.revoked.filter(id => id === h.previews[0]).length, 1); assert.equal(h.revoked.filter(id => id === h.previews[1]).length, 1);
});

test("upstream error before terminal DONE cancels an unreleased reader without an unhandled rejection", async t => {
  const stream = controlledSse(), h = harness({ response: () => stream.response }); t.after(() => h.unmount()); await h.flush();
  h.edit("accepted with a live reader"); const send = h.clickSend(); stream.emit({ delta: "known partial" });
  stream.emit({ error: { code: "synthetic", summary: "synthetic error before DONE" } }); await send; await h.flush();
  assert.equal(h.events.at(-1).isError, true); assert.match(h.text, /消息已接收，回复未完成/); assert.equal(h.requests.length, 1);
});

test("detached ownership finish is idempotent and duplicate local identity never overwrites another turn", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); const releases = [];
  const store = new h.lifecycleModule.ChatSendLifecycle(items => releases.push(...items.map(i => i.localId)));
  const attachment = { localId: "a", fileName: "a.png", previewUrl: "blob:owned-by-test", storagePath: "/media/a.png", mimeType: "image/png", kind: "image", status: "ready" };
  const scope = { owner: "synthetic", conversationId: 1, generation: 1 };
  const entry = store.begin("one", scope, "raw", [attachment]); attachment.fileName = "mutated";
  assert.equal(entry.attachments[0].fileName, "a.png");
  assert.throws(() => store.begin("one", { ...scope, conversationId: 2 }, "other", []), /标识重复/);
  store.receipt({ clientMessageId: "one", conversationId: 1, kind: "accepted", userMessageId: 101 });
  store.receipt({ clientMessageId: "one", conversationId: 1, kind: "complete" });
  assert.equal(store.finish("one", { isError: false, isAbort: false, isDisconnect: false }).phase, "accepted");
  assert.equal(store.finish("one", { isError: true, isAbort: false, isDisconnect: false }), null); store.dispose(); assert.deepEqual(releases, ["a"]);
});

test("metadata callbacks recheck mounting after a renderer yield within the same SSE frame", async t => {
  const h = harness({ response: () => sse([{ status: "thinking", thinking_step: { key: "late", label: "late", detail: "synthetic", status: "running" }, delta: "late" }, "[DONE]"]) });
  t.after(() => h.unmount()); await h.flush(); h.edit("leave during frame");
  let yielded = false;
  h.world.onYield = () => { if (!yielded) { yielded = true; h.unmount(); } };
  await h.clickSend(); await h.flush();
  assert.equal(yielded, true); assert.equal(h.requests.length, 1); assert.equal(h.lateWrites, 0);
});

test("selective clear uses current ownership even through an older callback without touching new attachments", async t => {
  const h = harness(); t.after(() => h.unmount()); await h.flush(); await h.attach([image("first.png"), image("second.png")]);
  const oldClear = h.attachments.clearAttachments, [first, second] = h.attachments.attachments;
  oldClear([first.localId]); h.render();
  assert.equal(h.revoked.filter(id => id === h.previews[0]).length, 1); assert.equal(h.revoked.filter(id => id === h.previews[1]).length, 0);
  await h.attach([image("third.png")]); oldClear([first.localId]); oldClear([second.localId]); h.render();
  assert.equal(h.revoked.filter(id => id === h.previews[0]).length, 1); assert.equal(h.revoked.filter(id => id === h.previews[1]).length, 1);
  assert.equal(h.revoked.filter(id => id === h.previews[2]).length, 0); assert.equal(await (await fetch(h.previews[2])).text(), "image-third.png");
  h.unmount(); assert.equal(h.revoked.filter(id => id === h.previews[2]).length, 1);
});
