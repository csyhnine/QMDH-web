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
function harness({ response = () => sse([{ delta: "synthetic response" }, "[DONE]"]), agentEnabled = false, setup } = {}) {
  let cursor = 0, changed = false, mounted = true, tree, lateWrites = 0;
  const slots = [], effects = [], updates = [], requests = [], events = [], sends = [], chats = [], revoked = [], previews = [];
  const world = { historyReads: [], historyFail: false, records: new Map([[1, []], [2, []]]), response, uploads: 0 };
  world.owner = 1; world.actions = []; world.conversations = [1,2].map(id => ({ id, title: `conversation ${id}`, model_provider_id: id, context_usage_percent: id * 10, context_tokens: id * 100, context_window_tokens: 1000, created_at: "", updated_at: "" })); setup?.(world);
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
    getChatModels: async () => world.models ? world.models() : [1,2,3].map(provider_id => ({ provider_id, provider_name: "synthetic", display_name: `model ${provider_id}`, model_name: "synthetic", base_url: "unused" })),
    getChatConversations: async () => world.getConversations ? world.getConversations() : clone(world.conversations),
    getChatAgentPolicy: async () => ({ enabled_tools: [], policy_version: "synthetic-policy" }),
    updateChatConversation: async (id, payload) => { world.actions.push({ kind: "model", id, payload }); return world.update(id,payload); },
    createChatConversation: async model => { world.actions.push({ kind: "create", model }); return world.create(model); },
    deleteChatConversation: async id => { world.actions.push({ kind: "delete", id }); return world.delete(id); },
    exportChatMessageWord: async (id, payload) => { world.actions.push({ kind: "export", id, payload }); return world.exportWord(id,payload); },
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
  const imports = { react: hooks, "@ai-sdk/react": { useChat }, "../../api": { api }, "../../context/AuthContext": { useAuth: () => ({ currentUser: { id: world.owner, display_name: "synthetic" }, isGuest: false }) },
    "../../lib/chat/qmdhChatMessageUtils": messageUtils, "../../lib/chat/chatRoundUtils": rounds, "../../lib/chat/chatTelemetry": telemetry,
    "../../lib/chat/qmdhChatTransport": transport, "../../lib/featureFlags": { chatAgentModeDefaultFor: () => false },
    "../../lib/useChatAgentUiEnabled": { useChatAgentUiEnabled: () => agentEnabled }, "../../lib/chat/useChatAttachments": attachmentBridge,
    "../../lib/chat/chatAttachmentUtils": attachmentUtils };
  if (existsSync(new URL("../src/lib/chat/chatSendLifecycle.ts", import.meta.url))) imports["../../lib/chat/chatSendLifecycle"] = compile(read("lib/chat/chatSendLifecycle.ts"), {}, globals);
  for (const name of ["ChatAgentCapabilitiesDrawer", "ChatAgentMemoryDrawer", "ChatConversationNav", "ChatMessageContent", "ChatTaskProposalCard", "ChatToolCallList"]) { const Component = () => null; Component.displayName = name; imports[`./${name}`] = { default: Component }; }
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
    chooseNow(id) { nodes().find(n => n.type === "div" && n.props.className?.startsWith("chat-conv-item") && text(n).includes(`conversation ${id}`)).props.onClick(); render(); },
    async choose(id) { this.chooseNow(id); await this.flush(); },
    modelNow(id) { nodes().find(n => n.type === "select" && n.props.className === "chat-model-select").props.onChange({ target: { value: String(id) } }); render(); },
    createNow() { nodes().find(n => n.type === "button" && n.props.className === "chat-new-btn").props.onClick(); render(); },
    deleteNow(id) { const row=nodes().find(n => n.type === "div" && n.props.className?.startsWith("chat-conv-item") && text(n).includes(`conversation ${id}`)); nodes(row).find(n=>n.type === "button").props.onClick({ stopPropagation() {} }); render(); },
    get view() { return { title: text(nodes().find(n=>n.props.className === "chat-topbar-title")), model: nodes().find(n=>n.type === "select" && n.props.className === "chat-model-select")?.props.value, context: text(nodes().find(n=>n.props.className === "chat-context-meter-label")), tools: nodes().filter(n=>n.type?.displayName === "ChatToolCallList").flatMap(n=>n.props.toolCalls), proposals: nodes().filter(n=>n.type?.displayName === "ChatTaskProposalCard").map(n=>n.props.proposal) }; },
    startAttach(files) { nodes().find(n => n.type === "input" && n.props.type === "file").props.onChange({ target: { files } }); render(); },
    async send() { this.clickSend(); await Promise.allSettled(sends); await this.flush(); },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); for (const id of previews) URL.revokeObjectURL(id); } };
}


function deferred() { let resolve, reject; const promise = new Promise((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; }
const record=(id,content,role="user")=>({id,role,content,created_at:"synthetic"});

test("late A history cannot replace the real SDK current B messages", async t => {
  const h=harness(); t.after(()=>h.unmount()); await h.flush(); const a=deferred(),b=deferred();
  h.world.getMessages=id=>id===1?a.promise:b.promise;
  h.chooseNow(1); h.chooseNow(2); b.resolve([record(21,"B history")]); await h.flush();
  assert.equal(h.sdk.messages[0].id,"21"); a.resolve([record(11,"late A history")]); await h.flush();
  assert.equal(h.sdk.messages[0].id,"21"); assert.equal(h.view.title,"conversation 2"); assert.equal(h.view.model,2); assert.equal(h.view.context,"上下文 20%");
});

test("late A history failure cannot clear successful B history or show its error", async t => {
  const h=harness(); t.after(()=>h.unmount()); await h.flush(); const a=deferred(),b=deferred();
  h.world.getMessages=id=>id===1?a.promise:b.promise; h.chooseNow(1); h.chooseNow(2);
  b.resolve([record(21,"B history")]); await h.flush(); a.reject(Error("obsolete A failure")); await h.flush();
  assert.equal(h.sdk.messages[0]?.id,"21"); assert.doesNotMatch(h.text,/obsolete A failure/);
});

test("same conversation history requests apply only the latest request", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();const first=deferred(),second=deferred();let n=0;
  h.world.getMessages=()=>++n===1?first.promise:second.promise;h.chooseNow(1);h.chooseNow(1);
  second.resolve([record(12,"latest A")]);await h.flush();first.resolve([record(11,"obsolete A")]);await h.flush();assert.equal(h.sdk.messages[0].id,"12");
});

test("A B A reentry rejects the first A generation even though the id matches again", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();const first=deferred(),last=deferred();let n=0;
  h.world.getMessages=id=>id===2?Promise.resolve([record(21,"B")]):++n===1?first.promise:last.promise;
  h.chooseNow(1);await h.choose(2);h.chooseNow(1);last.resolve([record(12,"new A")]);await h.flush();
  first.reject(Error("first A error"));await h.flush();assert.equal(h.sdk.messages[0].id,"12");assert.doesNotMatch(h.text,/first A error/);
});

test("current reload failure reports an error while preserving already displayed messages", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();h.world.records.set(1,[record(10,"existing")]);await h.choose(1);
  h.world.getMessages=async()=>{throw Error("current read failed");};await h.choose(1);
  assert.equal(h.sdk.messages[0].id,"10");assert.match(h.text,/current read failed/);assert.doesNotMatch(h.text,/正在加载本会话记录/);
});

test("history resolving before a queued selection render cannot write the old SDK instance", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();h.world.records.set(1,[record(10,"A")]);await h.choose(1);
  const oldSdk=h.sdk;h.world.records.set(2,[record(20,"B")]);
  h.nodes().find(n=>n.type==="div"&&n.props.className?.startsWith("chat-conv-item")&&text(n).includes("conversation 2")).props.onClick();
  await tick();assert.equal(oldSdk.messages[0].id,"10");await h.flush();assert.notEqual(h.sdk,oldSdk);assert.equal(h.sdk.messages[0].id,"20");assert.equal(oldSdk.messages[0].id,"10");
});

function controlledSse() { let controller;const body=new ReadableStream({start(c){controller=c;}});return { response:new Response(body,{headers:{"content-type":"text/event-stream","X-QMDH-Chat-User-Message-ID":"101"}}),emit(value){controller.enqueue(new TextEncoder().encode(`data: ${typeof value==="string"?value:JSON.stringify(value)}\n\n`));},close(){controller.close();} }; }
const metadata=tag=>({status:"thinking",label:`label-${tag}`,context:{usage_percent:77,tokens:770,window_tokens:1000,compressed:true},tool_calls:[{name:`tool-${tag}`,summary:tag}],task_proposals:[{proposal_id:`proposal-${tag}`,title:tag}],thinking_step:{key:tag,label:tag,detail:tag,status:"running"},policy_version:`policy-${tag}`});

test("a history read started before a send cannot erase the real SDK optimistic user or partial response", async t => {
  const stream=controlledSse(),h=harness({response:()=>stream.response});t.after(()=>h.unmount());await h.flush();const old=deferred();h.world.getMessages=()=>old.promise;
  h.chooseNow(1);h.edit("new live send");const send=h.clickSend();stream.emit({delta:"live partial"});await h.flush();
  old.resolve([record(9,"old read")]);await h.flush();assert.ok(h.sdk.messages.some(m=>m.parts.some(p=>p.text==="new live send")));assert.ok(h.sdk.messages.some(m=>m.parts.some(p=>p.text==="live partial")));
  stream.emit("[DONE]");stream.close();await send;await h.flush();assert.equal(h.requests.length,1);
});

test("late bootstrap model success loads model choices without overriding a manual B selection", async t => {
  const gate=deferred(),h=harness({setup:w=>{w.models=()=>gate.promise;}});t.after(()=>h.unmount());await h.flush();h.world.records.set(2,[record(21,"B")]);await h.choose(2);
  gate.resolve([{provider_id:2,display_name:"late model",model_name:"synthetic"}]);await h.flush();assert.equal(h.view.title,"conversation 2");assert.equal(h.sdk.messages[0].id,"21");assert.equal(h.view.model,2);assert.ok(h.nodes().some(n=>n.type==="option"&&text(n)==="late model"));
});

test("late bootstrap failure cannot add an obsolete page error to B", async t => {
  const gate=deferred(),h=harness({setup:w=>{w.models=()=>gate.promise;}});t.after(()=>h.unmount());await h.flush();await h.choose(2);gate.reject(Error("old bootstrap error"));await h.flush();assert.equal(h.view.title,"conversation 2");assert.doesNotMatch(h.text,/old bootstrap error/);
});

test("current stream metadata works but late A metadata and finish cannot mutate active B", async t => {
  const a=controlledSse(),b=controlledSse(),h=harness({agentEnabled:true,response:path=>path.includes("/1/")?a.response:b.response});t.after(()=>h.unmount());await h.flush();
  h.edit("A send");const sendA=h.clickSend();a.emit(metadata("A-current"));await h.flush();assert.equal(h.view.tools[0].name,"tool-A-current");assert.equal(h.view.context,"上下文 77%");
  await h.choose(2);assert.equal(h.view.tools.length,0);assert.equal(h.view.proposals.length,0);assert.equal(h.view.context,"上下文 20%");
  h.edit("B send");const sendB=h.clickSend();b.emit({...metadata("B"),context:{usage_percent:33}});await h.flush();
  a.emit(metadata("A-late"));a.emit({error:"obsolete upstream error"});a.emit("[DONE]");a.close();await sendA;await h.flush();
  assert.equal(h.view.tools[0].name,"tool-B");assert.equal(h.view.proposals[0].proposal_id,"proposal-B");assert.equal(h.view.context,"上下文 33%");assert.doesNotMatch(h.text,/label-A-late|obsolete upstream error/);
  assert.ok(h.nodes().filter(n=>n.type?.displayName==="ChatToolCallList").every(n=>n.props.policyVersion==="policy-B"));
  b.emit({delta:"B response"});b.emit("[DONE]");b.close();await sendB;await h.flush();assert.equal(h.requests.length,2);
});

test("old A stream notifications stay stale after A B A while its send remains tracked", async t => {
  const a=controlledSse(),h=harness({response:()=>a.response});t.after(()=>h.unmount());await h.flush();h.edit("original A");const send=h.clickSend();
  await h.choose(2);await h.choose(1);a.emit(metadata("first-A-generation"));await h.flush();assert.equal(h.view.context,"上下文 10%");assert.equal(h.view.tools.length,0);assert.match(h.text,/本会话已有消息正在处理/);
  a.emit("[DONE]");a.close();await send;await h.flush();assert.equal(h.view.tools.length,0);
});

test("a switch during a single SSE renderer yield suppresses the rest of that frame", async t => {
  const h=harness({response:()=>sse([metadata("yield-A"),"[DONE]"])});t.after(()=>h.unmount());await h.flush();h.edit("yield source A");let switched=false;
  h.world.onYield=()=>{if(!switched){switched=true;h.chooseNow(2);}};await h.send();assert.equal(switched,true);assert.equal(h.view.title,"conversation 2");assert.equal(h.view.context,"上下文 20%");assert.equal(h.view.tools.length,0);assert.equal(h.view.proposals.length,0);
});

test("late model update success belongs to A and cannot change B model or context", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();const gate=deferred();h.world.update=()=>gate.promise;h.modelNow(3);await h.choose(2);
  gate.resolve({...h.world.conversations[0],model_provider_id:3,context_usage_percent:91});await h.flush();assert.equal(h.view.model,2);assert.equal(h.view.context,"上下文 20%");assert.equal(h.world.actions[0].kind,"model");assert.equal(h.world.actions[0].id,1);assert.equal(h.world.actions[0].payload.model_provider_id,3);
});

test("late model update error cannot report an A error in B", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();const gate=deferred();h.world.update=()=>gate.promise;h.modelNow(3);await h.choose(2);gate.reject(Error("old model failure"));await h.flush();assert.equal(h.view.model,2);assert.doesNotMatch(h.text,/old model failure/);
});

test("two model updates in one view apply only the newest response and ignore the older error", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();const first=deferred(),last=deferred();let n=0;h.world.update=()=>++n===1?first.promise:last.promise;h.modelNow(2);h.modelNow(3);
  last.resolve({...h.world.conversations[0],model_provider_id:3,context_usage_percent:63});await h.flush();first.reject(Error("older model error"));await h.flush();assert.equal(h.view.model,3);assert.equal(h.view.context,"上下文 63%");assert.doesNotMatch(h.text,/older model error/);
});

test("late create success adds its explicit row but does not navigate away from B", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();const gate=deferred();h.world.create=()=>gate.promise;h.createNow();await h.choose(2);const c={...h.world.conversations[0],id:3,title:"conversation 3"};gate.resolve(c);await h.flush();assert.equal(h.view.title,"conversation 2");assert.ok(h.text.includes("conversation 3"));
});

test("late create failure cannot replace the selected conversation error state", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();const gate=deferred();h.world.create=()=>gate.promise;h.createNow();await h.choose(2);gate.reject(Error("old create failure"));await h.flush();assert.equal(h.view.title,"conversation 2");assert.doesNotMatch(h.text,/old create failure/);
});

test("late deleting A removes only A from the list and preserves successful B history", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();const gate=deferred();h.world.delete=()=>gate.promise;h.deleteNow(1);h.world.records.set(2,[record(21,"B")]);await h.choose(2);gate.resolve();await h.flush();assert.equal(h.view.title,"conversation 2");assert.equal(h.sdk.messages[0].id,"21");assert.doesNotMatch(h.text,/conversation 1/);
});

test("late delete failure cannot surface in a different selected view", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();const gate=deferred();h.world.delete=()=>gate.promise;h.deleteNow(1);await h.choose(2);gate.reject(Error("old delete failure"));await h.flush();assert.equal(h.view.title,"conversation 2");assert.doesNotMatch(h.text,/old delete failure/);
});

test("normal create selects the new conversation and delete selects the remaining fallback", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();const c={...h.world.conversations[0],id:3,title:"conversation 3",model_provider_id:3};h.world.create=async()=>{h.world.conversations.unshift(c);return c;};h.world.records.set(3,[record(31,"C")]);h.createNow();await h.flush();assert.equal(h.view.title,"conversation 3");assert.equal(h.sdk.messages[0].id,"31");assert.equal(h.view.model,3);
  h.world.delete=async id=>{h.world.conversations=h.world.conversations.filter(c=>c.id!==id);};h.world.records.set(1,[record(11,"A")]);h.deleteNow(3);await h.flush();assert.equal(h.view.title,"conversation 1");assert.equal(h.sdk.messages[0].id,"11");
});

test("deleting the last conversation selects an empty view with an empty SDK", async t => {
  const h=harness({setup:w=>{w.conversations=w.conversations.slice(0,1);}});t.after(()=>h.unmount());await h.flush();h.world.delete=async()=>{h.world.conversations=[];};h.deleteNow(1);await h.flush();assert.equal(h.view.title,"");assert.equal(h.sdk.messages.length,0);assert.match(h.sdk.id,/chat-disabled/);
});

test("older list refresh after create cannot replace newer B model context or title", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();const list=deferred();h.world.create=async()=>({...h.world.conversations[0],id:3,title:"conversation 3"});h.world.getConversations=()=>list.promise;h.createNow();await h.flush();await h.choose(2);
  h.world.update=async()=>({...h.world.conversations[1],model_provider_id:3,context_usage_percent:68});h.modelNow(3);await h.flush();list.resolve(h.world.conversations.map(c=>({...c,title:`obsolete ${c.id}`})));await h.flush();assert.equal(h.view.title,"conversation 2");assert.equal(h.view.model,3);assert.equal(h.view.context,"上下文 68%");
});

test("unmount ignores late history and model results without any Page state writes", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();const history=deferred(),model=deferred();h.world.getMessages=()=>history.promise;h.world.update=()=>model.promise;h.chooseNow(1);h.modelNow(3);h.unmount();history.reject(Error("late history"));model.resolve({...h.world.conversations[0],model_provider_id:3});await h.flush();assert.equal(h.lateWrites,0);
});

test("unmount ignores pending bootstrap list and models without state writes", async t => {
  const list=deferred(),models=deferred(),h=harness({setup:w=>{w.models=()=>models.promise;w.getConversations=()=>list.promise;}});t.after(()=>h.unmount());h.unmount();list.resolve([]);models.resolve([]);await h.flush();assert.equal(h.lateWrites,0);
});

test("old export failure and finally do not change the next conversation", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();h.world.records.set(1,[record(12,"export answer","assistant")]);await h.choose(1);const gate=deferred();h.world.exportWord=()=>gate.promise;h.nodes().find(n=>n.type==="button"&&n.props.className==="chat-export-word-btn").props.onClick();h.render();await h.choose(2);gate.reject(Error("old export error"));await h.flush();assert.equal(h.view.title,"conversation 2");assert.doesNotMatch(h.text,/old export error|导出中/);
});

test("transport notifications keep the captured client turn even when the SDK chat id is reused", async t => {
  const a=controlledSse(),b=controlledSse(),h=harness();t.after(()=>h.unmount());await h.flush();let current="first";const seen=[],receipts=[];
  h.world.response=(_,init)=>JSON.parse(init.body).content==="first"?a.response:b.response;
  const transport=new h.transport.QmdhChatTransport({getConversationId:()=>1,isCurrentSubmission:id=>id===current,onToolCalls:tools=>seen.push(tools[0].name),onSubmissionState:value=>receipts.push(value)});
  const first=new Chat({id:"1",transport}),second=new Chat({id:"1",transport});
  const firstSend=first.sendMessage({id:"first",role:"user",parts:[{type:"text",text:"first"}]});a.emit(metadata("first"));await h.flush();assert.equal(seen.at(-1),"tool-first");
  current="second";const secondSend=second.sendMessage({id:"second",role:"user",parts:[{type:"text",text:"second"}]});b.emit(metadata("second"));await h.flush();a.emit(metadata("obsolete-first"));await h.flush();
  const last=seen.at(-1);a.emit("[DONE]");a.close();b.emit("[DONE]");b.close();await Promise.all([firstSend,secondSend]);
  assert.equal(last,"tool-second");assert.equal(receipts.filter(r=>r.kind==="complete").length,2);assert.equal(h.requests.length,2);
});

test("reselecting the same conversation supersedes an earlier create navigation intent", async t => {
  const h=harness();t.after(()=>h.unmount());await h.flush();const gate=deferred();h.world.create=()=>gate.promise;h.createNow();await h.choose(1);
  const created={...h.world.conversations[0],id:3,title:"conversation 3"};h.world.conversations.unshift(created);gate.resolve(created);await h.flush();assert.equal(h.view.title,"conversation 1");assert.ok(h.text.includes("conversation 3"));
});

test("independent deletes do not suppress the active conversation's valid fallback", async t => {
  const h=harness({setup:w=>{w.conversations.push({...w.conversations[1],id:3,title:"conversation 3"});}});t.after(()=>h.unmount());await h.flush();const a=deferred(),b=deferred();h.world.delete=id=>id===1?a.promise:b.promise;
  h.deleteNow(1);h.deleteNow(2);h.world.conversations=h.world.conversations.filter(c=>c.id!==2);b.resolve();await h.flush();h.world.conversations=h.world.conversations.filter(c=>c.id!==1);a.resolve();await h.flush();assert.equal(h.view.title,"conversation 3");assert.match(h.sdk.id,/:3:/);
});

test("a proposal decision callback captured in A cannot annotate the current B proposal", async t => {
  const a=controlledSse(),b=controlledSse(),h=harness({response:path=>path.includes("/1/")?a.response:b.response});t.after(()=>h.unmount());await h.flush();
  const proposal={proposal_id:"synthetic-shared-id",title:"synthetic proposal"};h.edit("A");const sendA=h.clickSend();a.emit({task_proposals:[proposal]});await h.flush();
  const old=h.nodes().find(n=>n.type?.displayName==="ChatTaskProposalCard").props.onDecisionChange;await h.choose(2);h.edit("B");const sendB=h.clickSend();b.emit({task_proposals:[proposal]});await h.flush();
  old(proposal.proposal_id,"accepted");h.render();const value=h.nodes().find(n=>n.type?.displayName==="ChatTaskProposalCard").props.decision;
  a.emit("[DONE]");a.close();b.emit("[DONE]");b.close();await Promise.all([sendA,sendB]);assert.equal(value,undefined);
});
