import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = (path) => readFileSync(new URL(`../src/features/canvas/${path}`, import.meta.url), "utf8");
const clone = (value) => JSON.parse(JSON.stringify(value));
const graph = (id) => ({ nodes: [{ id }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function compile(code, imports, globals) {
  const exports = {};
  const js = ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(js, { exports, Error, ...globals, require(name) {
    if (Object.hasOwn(imports, name)) return imports[name];
    throw new Error(`Unstubbed import: ${name}`);
  } });
  return exports;
}
function world() {
  const records = new Map([1, 2, 3].map((id) => [id, {
    id, title: `project-${id}`, graph_json: graph(`original-${id}`), created_at: "fixture", updated_at: "fixture",
  }]));
  const saved = new Map(), calls = [], gates = new Map(), prompts = [];
  let nextId = 4, nextSaveId = 0, storageFails = false, restoreConflict = false;
  const storage = {
    getItem(key) { if (storageFails) throw new Error("storage unavailable"); return saved.get(key) ?? null; },
    setItem(key, value) { if (storageFails) throw new Error("storage unavailable"); saved.set(key, value); },
    removeItem(key) { if (storageFails) throw new Error("storage unavailable"); saved.delete(key); },
  };
  async function invoke(method, id, body, apply) {
    calls.push({ method, id, body: body ? clone(body) : undefined });
    const queue = gates.get(`${method}:${id}`), gate = queue?.shift();
    const response = gate ? await gate.promise : undefined;
    const result = apply();
    return clone(response ?? result);
  }
  const api = {
    canvasProjects: () => invoke("list", 0, null, () => [...records.values()]),
    getCanvasProject: (id) => invoke("get", id, null, () => {
      if (!records.has(id)) throw new Error("missing project");
      return records.get(id);
    }),
    updateCanvasProject: (id, body) => invoke("update", id, body, () => {
      if (!records.has(id)) throw new Error("missing project");
      const next = { ...records.get(id), ...clone(body), updated_at: `update-${calls.length}` };
      records.set(id, next); return next;
    }),
    createCanvasProject: (body) => invoke("create", 0, body, () => {
      const next = { id: nextId++, ...clone(body), created_at: "fixture", updated_at: "fixture" };
      records.set(next.id, next); return next;
    }),
    deleteCanvasProject: (id) => invoke("delete", id, null, () => { records.delete(id); return null; }),
  };
  return {
    api, storage, saved, records, calls, prompts,
    crypto: { getRandomValues(bytes) { bytes.fill(++nextSaveId); return bytes; } },
    confirm(message) { prompts.push(message); return restoreConflict; },
    set restoreConflict(value) { restoreConflict = value; },
    set storageFails(value) { storageFails = value; },
    hold(method, id) {
      const key = `${method}:${id}`, gate = deferred();
      if (!gates.has(key)) gates.set(key, []);
      gates.get(key).push(gate); return gate;
    },
    writes() { return calls.filter((call) => call.method === "update" && call.body.graph_json); },
  };
}

// Reuse the project's real-Hook VM/effect driver pattern. The save queue,
// callbacks, default API arguments and storage helper execute from disk.
function harness(w = world(), enabled = true) {
  let cursor = 0, dirty = false, mounted = true, result, timerId = 0, lateWrites = 0;
  const slots = [], effects = [], updates = [], timers = new Map(), listeners = new Map();
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next) => {
        if (!mounted) { lateWrites += 1; return; }
        updates.push({ index, next }); dirty = true;
      }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useCallback(fn, deps) {
      const index = cursor++, old = slots[index];
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) slots[index] = { deps, fn };
      return slots[index].fn;
    },
    useEffect(create, deps) {
      const index = cursor++, old = slots[index];
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
        const record = { deps, create, cleanup: null };
        slots[index] = record;
        effects.push(() => { old?.cleanup?.(); record.cleanup = create(); });
      }
    },
  };
  const window = {
    sessionStorage: w.storage,
    confirm: (message) => w.confirm(message),
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
  };
  const imports = {
    react, "../../api": { api: w.api },
    // Parsing is an unchanged graph boundary; saving/restore is not mocked.
    "./canvasGraphUtils": { parseCanvasGraph: clone },
    "./canvasTypes": { emptyCanvasGraph: () => ({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }) },
    "./canvasId": compile(source("canvasId.ts"), {}, { crypto: w.crypto }),
  };
  if (existsSync(new URL("../src/features/canvas/canvasProjectDrafts.ts", import.meta.url))) {
    // A production ES module outlives a Hook unmount/remount in the same tab.
    w.draftModule ??= compile(source("canvasProjectDrafts.ts"), {}, { window });
    imports["./canvasProjectDrafts"] = w.draftModule;
  }
  const hook = compile(source("useCanvasProject.ts"), imports, { window, crypto: w.crypto }).useCanvasProject;
  function commit() {
    if (!mounted) return;
    for (let pass = 0; pass < 20; pass += 1) {
      for (const { index, next } of updates.splice(0)) slots[index] = typeof next === "function" ? next(slots[index]) : next;
      cursor = 0; dirty = false; result = hook(enabled, 7);
      for (const effect of effects.splice(0)) effect();
      if (!dirty) return;
    }
    throw new Error("Hook did not settle");
  }
  async function flush() { for (let i = 0; i < 30; i += 1) { await Promise.resolve(); if (mounted && dirty) commit(); } }
  commit();
  return {
    w, flush,
    get result() { return result; },
    get lateWrites() { return lateWrites; },
    get timerCount() { return timers.size; },
    async tick(ms = 700) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay <= ms) { timers.delete(id); timer.fn(); }
        else timer.delay -= ms;
      }
      await flush();
    },
    unmount() { mounted = false; for (const slot of slots) slot?.cleanup?.(); },
    beforeUnload() {
      const event = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
      for (const fn of listeners.get("beforeunload") ?? []) fn(event);
      return event.prevented;
    },
    async open(id) { await result.openProject(id); await flush(); },
  };
}
const idOf = (record) => record.graph_json.nodes[0]?.id;
async function ready(w) { const h = harness(w); await h.flush(); assert.equal(h.result.activeProject.id, 1); return h; }

test("normal auto-save debounces 700ms and captures the input graph", async () => {
  const h = await ready(), edited = graph("edited-A");
  h.result.queueSaveGraph(edited); edited.nodes[0].id = "mutated-after-queue";
  await h.tick(699); assert.equal(h.w.writes().length, 0);
  await h.tick(1);
  assert.equal(idOf(h.w.records.get(1)), "edited-A");
  assert.equal(h.result.saving, false);
});

test("switch before debounce saves A to A and preserves B", async () => {
  const h = await ready(); h.result.queueSaveGraph(graph("edited-A"));
  await h.open(2); await h.tick();
  assert.equal(idOf(h.w.records.get(1)), "edited-A");
  assert.equal(idOf(h.w.records.get(2)), "original-2");
  assert.equal(h.result.activeProject.id, 2);
  assert.deepEqual(h.w.writes().map((call) => call.id), [1]);
});

test("switch drains a newer edit after an in-flight save without parallel writes", async () => {
  const h = await ready(), first = h.w.hold("update", 1);
  h.result.queueSaveGraph(graph("A-v1")); await h.tick();
  h.result.queueSaveGraph(graph("A-v2"));
  const opening = h.result.openProject(2); await h.flush();
  assert.equal(h.result.activeProject.id, 1);
  assert.equal(h.w.writes().length, 1);
  first.resolve(); await opening; await h.flush(); await h.tick();
  assert.deepEqual(h.w.writes().map((call) => [call.id, call.body.graph_json.nodes[0].id]), [[1, "A-v1"], [1, "A-v2"]]);
  assert.equal(idOf(h.w.records.get(1)), "A-v2"); assert.equal(idOf(h.w.records.get(2)), "original-2");
});

test("late B load cannot replace a newer C selection", async () => {
  const h = await ready(), gate = h.w.hold("get", 2);
  const b = h.result.openProject(2); await h.flush(); await h.open(3);
  gate.resolve(); await b; await h.flush();
  assert.equal(h.result.activeProject.id, 3); assert.equal(h.result.error, "");
});

test("old load failure cannot clear a newer loading state or error", async () => {
  const h = await ready(), bGate = h.w.hold("get", 2), cGate = h.w.hold("get", 3);
  const b = h.result.openProject(2).catch((err) => err); await h.flush();
  const c = h.result.openProject(3); await h.flush();
  bGate.reject(new Error("old-B-error")); await b; await h.flush();
  assert.equal(h.result.loading, true); assert.equal(h.result.error, "");
  cGate.resolve(); await c; await h.flush(); assert.equal(h.result.activeProject.id, 3);
});

test("failed save blocks switching, retains A and permits explicit retry", async () => {
  const h = await ready(), gate = h.w.hold("update", 1);
  h.result.queueSaveGraph(graph("retained-A"));
  const switched = h.result.openProject(2).catch((err) => err); await h.flush();
  gate.reject(new Error("save unavailable")); await switched; await h.flush();
  assert.equal(h.result.activeProject.id, 1); assert.match(h.result.error, /save unavailable/);
  assert.equal(h.w.calls.some((call) => call.method === "get" && call.id === 2), false);
  assert.equal(h.w.saved.size, 1); assert.equal(h.beforeUnload(), true);
  await h.result.retrySave(); await h.flush(); await h.open(2);
  assert.equal(idOf(h.w.records.get(1)), "retained-A"); assert.equal(h.w.saved.size, 0);
});

test("load failure after successful drain keeps the original graph and allows retry", async () => {
  const h = await ready(), gate = h.w.hold("get", 2);
  h.result.queueSaveGraph(graph("saved-A"));
  const opening = h.result.openProject(2).catch((err) => err); await h.flush();
  gate.reject(new Error("load unavailable")); await opening; await h.flush();
  assert.equal(h.result.activeProject.id, 1); assert.equal(idOf(h.result.activeProject), "saved-A");
  await h.open(2); assert.equal(h.result.activeProject.id, 2);
});

test("new and copied projects drain the source before changing active project", async () => {
  for (const copied of [undefined, graph("copied-template")]) {
    const h = await ready(); h.result.queueSaveGraph(graph("preserved-source"));
    const created = await h.result.createProject("new copy", copied); await h.flush(); await h.tick();
    assert.equal(idOf(h.w.records.get(1)), "preserved-source");
    assert.equal(h.result.activeProject.id, created.id);
    assert.equal(created.graph_json.nodes[0]?.id, copied?.nodes[0].id);
    assert.deepEqual(h.w.writes().map((call) => call.id), [1]);
  }
});

test("delete waits for pending save and never resurrects the deleted record", async () => {
  const h = await ready(), gate = h.w.hold("update", 1);
  h.result.queueSaveGraph(graph("before-delete")); await h.tick();
  const deleting = h.result.deleteActiveProject(); await h.flush();
  assert.equal(h.w.calls.some((call) => call.method === "delete"), false);
  gate.resolve(); await deleting; await h.flush(); await h.tick();
  assert.equal(h.result.activeProject.id, 2); assert.equal(h.w.records.has(1), false);
  assert.equal(h.w.saved.size, 0);
});

test("late rename cannot rebind the current project", async () => {
  const h = await ready(), gate = h.w.hold("update", 1);
  const renaming = h.result.renameProject("renamed-A"); await h.flush(); await h.open(2);
  gate.resolve(); await renaming; await h.flush();
  assert.equal(h.result.activeProject.id, 2); assert.equal(idOf(h.result.activeProject), "original-2");
});

test("old success cannot clear a newer backed-up revision", async () => {
  const h = await ready(), first = h.w.hold("update", 1), second = h.w.hold("update", 1);
  h.result.queueSaveGraph(graph("v1")); await h.tick(); h.result.queueSaveGraph(graph("v2"));
  first.resolve(); await h.flush();
  assert.equal(h.w.saved.size, 1);
  assert.ok([...h.w.saved.values()][0].includes("v2"));
  second.reject(new Error("second save failed")); await h.flush();
  assert.equal(h.w.saved.size, 1); assert.match(h.result.error, /second save failed/);
  await h.result.retrySave(); await h.flush(); assert.equal(idOf(h.w.records.get(1)), "v2");
});

test("unmount does not issue a parallel PATCH and a failed save remains recoverable", async () => {
  const h = await ready(), gate = h.w.hold("update", 1);
  h.result.queueSaveGraph(graph("recover-A")); await h.tick(); h.unmount();
  assert.equal(h.w.writes().length, 1); assert.equal(h.timerCount, 0);
  gate.reject(new Error("offline after unmount")); await h.flush();
  assert.equal(h.lateWrites, 0); assert.equal(h.w.saved.size, 1);
  const reopened = await ready(h.w);
  assert.equal(idOf(reopened.result.activeProject), "recover-A");
  await reopened.result.retrySave(); await reopened.flush();
  assert.equal(idOf(h.w.records.get(1)), "recover-A"); assert.equal(h.w.saved.size, 0);
});

test("unmount before debounce preserves the draft for same-tab recovery", async () => {
  const h = await ready(); h.result.queueSaveGraph(graph("unsent-A")); h.unmount();
  assert.equal(h.w.saved.size, 1); assert.equal(h.w.writes().length, 0);
  const reopened = await ready(h.w); assert.equal(idOf(reopened.result.activeProject), "unsent-A");
  await reopened.result.retrySave(); await reopened.flush(); assert.equal(idOf(h.w.records.get(1)), "unsent-A");
});

test("disabled project mode has no API, timer or storage side effects", async () => {
  const w = world(), h = harness(w, false); await h.flush();
  h.result.queueSaveGraph(graph("disabled")); await h.tick();
  assert.equal(w.calls.length, 0); assert.equal(w.saved.size, 0); assert.equal(h.timerCount, 0);
});

test("storage failure is visible while the network retry can still preserve the edit", async () => {
  const h = await ready(); h.w.storageFails = true;
  h.result.queueSaveGraph(graph("memory-A")); await h.flush();
  assert.match(h.result.error, /草稿|备份/); assert.equal(h.beforeUnload(), true);
  await h.result.retrySave(); await h.flush();
  assert.equal(idOf(h.w.records.get(1)), "memory-A"); assert.equal(h.result.hasUnsavedChanges, false);
});

test("late create response cannot replace a newer selection", async () => {
  const h = await ready(), gate = h.w.hold("create", 0);
  const creating = h.result.createProject("created-A"); await h.flush(); await h.open(3);
  gate.resolve(); await creating; await h.flush();
  assert.equal(h.result.activeProject.id, 3);
});

test("same-project reload cannot replace an edit made during its GET", async () => {
  const h = await ready(), gate = h.w.hold("get", 1);
  const stale = clone(h.w.records.get(1));
  const loading = h.result.openProject(1); await h.flush();
  h.result.queueSaveGraph(graph("new-during-load"));
  gate.resolve(stale); await loading; await h.flush();
  assert.equal(idOf(h.result.activeProject), "new-during-load");
  assert.equal(idOf(h.w.records.get(1)), "new-during-load");
});

test("remount serializes a new revision behind the previous instance's in-flight save", async () => {
  const h = await ready(), old = h.w.hold("update", 1);
  h.result.queueSaveGraph(graph("old-instance")); await h.tick(); h.unmount();
  const next = await ready(h.w);
  next.result.queueSaveGraph(graph("new-instance")); await next.tick();
  assert.equal(h.w.writes().length, 1, "new instance waits for the old network write");
  old.resolve(); await h.flush(); await next.flush();
  assert.equal(idOf(h.w.records.get(1)), "new-instance");
  assert.equal(next.result.hasUnsavedChanges, false); assert.equal(h.w.saved.size, 0);
});

test("failed drain prevents create and delete from discarding the source", async () => {
  for (const operation of ["create", "delete"]) {
    const h = await ready(), gate = h.w.hold("update", 1);
    h.result.queueSaveGraph(graph("keep-source"));
    const result = (operation === "create" ? h.result.createProject("copy") : h.result.deleteActiveProject()).catch((err) => err);
    await h.flush(); gate.reject(new Error("save failure before transition")); await result; await h.flush();
    assert.equal(h.result.activeProject.id, 1); assert.equal(h.w.saved.size, 1);
    assert.equal(h.w.calls.some((call) => call.method === operation), false);
  }
});

test("the actual workspace retry button retries the retained source draft", async () => {
  const h = await ready(), gate = h.w.hold("update", 1);
  h.result.queueSaveGraph(graph("retry-from-button")); await h.tick();
  gate.reject(new Error("temporary save failure")); await h.flush();
  const file = ts.createSourceFile("CanvasWorkspace.tsx", source("CanvasWorkspace.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let element;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === "button" &&
        node.children.some((child) => ts.isJsxText(child) && child.text.trim() === "重试保存")) element = node;
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(element, "actual retry button exists");
  const jsx = (type, props) => ({ type, props });
  const { makeButton } = compile(`export function makeButton(canvas) { return (${element.getText(file)}); }`, {
    "react/jsx-runtime": { jsx, jsxs: jsx },
  });
  const button = makeButton(h.result); assert.equal(button.props.disabled, false);
  button.props.onClick(); await h.flush();
  assert.equal(idOf(h.w.records.get(1)), "retry-from-button");
  assert.equal(h.result.error, ""); assert.equal(h.w.saved.size, 0);
});

test("a stale backup after storage failure cannot silently replace a newer server graph", async () => {
  const h = await ready();
  h.result.queueSaveGraph(graph("old-backup"));
  h.w.storageFails = true;
  h.result.queueSaveGraph(graph("new-server-version"));
  await h.result.retrySave(); await h.flush(); h.unmount(); h.w.storageFails = false;
  const reopened = await ready(h.w);
  assert.equal(idOf(reopened.result.activeProject), "new-server-version");
  assert.equal(reopened.result.hasUnsavedChanges, false);
  assert.equal(h.w.prompts.length, 1); assert.equal(h.w.saved.size, 1);
  assert.match(reopened.result.error, /服务器内容/);
});

test("a changed server graph requires a deliberate choice before restoring the local draft", async () => {
  const h = await ready(); h.result.queueSaveGraph(graph("recover-local")); h.unmount();
  // Even equal/coarse timestamps cannot hide a changed base graph.
  h.w.records.set(1, { ...h.w.records.get(1), graph_json: graph("external-version") });
  h.w.restoreConflict = true;
  const reopened = await ready(h.w);
  assert.equal(h.w.prompts.length, 1); assert.equal(idOf(reopened.result.activeProject), "recover-local");
  assert.equal(h.w.writes().length, 0, "restoring does not write until retry or a new edit");
  await reopened.result.retrySave(); await reopened.flush();
  assert.equal(idOf(h.w.records.get(1)), "recover-local");
});

test("old acknowledgment cannot delete a remounted draft when its numeric revision restarts", async () => {
  const h = await ready(), old = h.w.hold("update", 1), nextSave = h.w.hold("update", 1);
  h.w.storageFails = true;
  h.result.queueSaveGraph(graph("unbacked-old-instance")); await h.tick();
  h.unmount(); h.w.storageFails = false;
  const next = await ready(h.w);
  next.result.queueSaveGraph(graph("backed-new-instance")); await next.tick();
  old.resolve(); await h.flush(); await next.flush();
  assert.equal(h.w.saved.size, 1); assert.ok([...h.w.saved.values()][0].includes("backed-new-instance"));
  nextSave.reject(new Error("new instance offline")); await next.flush();
  assert.equal(h.w.saved.size, 1);
  await next.result.retrySave(); await next.flush();
  assert.equal(idOf(h.w.records.get(1)), "backed-new-instance");
});

test("actual workspace deletion cannot auto-select an old fallback after the user chooses C", async () => {
  const h = await ready(), fallback = h.w.hold("get", 2);
  const file = ts.createSourceFile("CanvasWorkspace.tsx", source("CanvasWorkspace.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "handleDeleteProject") handler = node;
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(handler);
  const { remove } = compile(`export function make(canvas, api) { ${handler.getText(file)} return handleDeleteProject; }\nexport const remove = make;`, {});
  const inactive = await ready();
  await remove(inactive.result, inactive.w.api)(2); await inactive.flush();
  assert.equal(inactive.result.activeProject.id, 1, "deleting an inactive project keeps the current selection");
  const deleting = remove(h.result, h.w.api)(1); await h.flush();
  await h.open(3); fallback.resolve(); await deleting; await h.flush();
  assert.equal(h.result.activeProject.id, 3); assert.equal(h.w.records.has(1), false);
});

test("deleting the last project creates and selects the normal empty fallback", async () => {
  const w = world(); w.records.delete(2); w.records.delete(3);
  const h = await ready(w);
  await h.result.deleteActiveProject(); await h.flush();
  assert.equal(h.result.activeProject.title, "我的工作流");
  assert.equal(h.result.activeProject.graph_json.nodes.length, 0);
  assert.equal(w.records.has(1), false); assert.equal(w.records.size, 1);
  assert.equal(h.result.loading, false); assert.equal(w.saved.size, 0);
});
