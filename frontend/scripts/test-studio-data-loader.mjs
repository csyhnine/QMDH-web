import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual hook without starting a browser or a live backend.
function harness(count = 125, activeId) {
  let records = Array.from({ length: count }, (_, index) => ({
    id: index + 1, status: "completed", created_at: new Date(index * 1000).toISOString(),
  })).reverse();
  if (activeId) records.find((task) => task.id === activeId).status = "running";
  let state = { tasks: [], assets: [], error: "" };
  let slots = [], cursor = 0, effects = [], result;
  const timers = new Map(), listeners = new Set();
  let timerId = 0, hidden = false, now = 1000000;
  let configurationVersion = 1, failConfiguration = false;
  let taskGate;
  const configurationCalls = [];
  let account = "designer", failPage = false;
  const calls = [];
  const react = {
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        slots[index] = { deps };
        effects.push(() => {
          previous?.cleanup?.();
          slots[index].cleanup = effect();
        });
      }
    },
  };
  const api = {
    async tasks(options = {}) {
      calls.push(options);
      if (taskGate) {
        const gate = taskGate;
        taskGate = undefined;
        await gate;
      }
      if (failPage && options.before_id) throw new Error("Page unavailable");
      let selected = records;
      if (options.status) selected = selected.filter((task) => options.status.includes(task.status));
      if (options.task_ids) selected = selected.filter((task) => options.task_ids.includes(task.id));
      if (options.before_id) selected = selected.filter((task) => task.id < options.before_id);
      return selected.slice(0, options.limit ?? selected.length).map((task) => ({ ...task }));
    },
    async assets({ task_ids }) { return task_ids.map((id) => ({ id, source_task_id: id, created_at: "2026-01-01" })); },
    async health() { configurationCalls.push("health"); return { status: "healthy" }; },
    async projects() { configurationCalls.push("projects"); return []; },
    async providers() {
      configurationCalls.push("providers");
      if (failConfiguration) throw new Error("Configuration unavailable");
      return [{ provider_name: `model-${configurationVersion}` }];
    },
    async workflows() { configurationCalls.push("workflows"); return []; },
    async promptTemplates() { configurationCalls.push("templates"); return []; },
  };
  const source = readFileSync(new URL("../src/features/studio/useStudioDataLoader.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    Error,
    Date: class extends Date { static now() { return now; } },
    require(name) {
      if (name === "react") return react;
      if (name === "../../api") return { api };
      if (name === "../../context/AuthContext") return { useAuth: () => ({ isGuest: false }) };
      return createRequire(import.meta.url)(name);
    },
    window: {
      setInterval(fn, interval) { timers.set(++timerId, { fn, interval }); return timerId; },
      clearInterval(id) { timers.delete(id); },
    },
    document: {
      get hidden() { return hidden; },
      addEventListener(name, callback) { listeners.add(callback); },
      removeEventListener(name, callback) { listeners.delete(callback); },
    },
  });
  function render() {
    cursor = 0;
    result = exports.useStudioDataLoader({
      currentUser: { name: account }, tasks: state.tasks, setPromptTemplates() {},
      setState(value) { state = typeof value === "function" ? value(state) : value; },
    });
    for (const effect of effects.splice(0)) effect();
  }
  async function settle() {
    for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));
    render();
  }
  render();
  return {
    settle, calls, configurationCalls,
    get state() { return state; }, get result() { return result; },
    get records() { return records; },
    async poll() { for (const timer of [...timers.values()]) timer.fn(); await settle(); },
    async visibility(value) { hidden = value; for (const listener of [...listeners]) listener(); await settle(); },
    advance(ms) { now += ms; },
    configure(version, fail = false) { configurationVersion = version; failConfiguration = fail; },
    get timerCount() { return timers.size; },
    get listenerCount() { return listeners.size; },
    deferNextTaskRequest() {
      let release;
      taskGate = new Promise((resolve) => { release = resolve; });
      return release;
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    async more() { await result.loadMoreHistory(); await settle(); },
    failPage(value) { failPage = value; },
    deleteTask(id) { records = records.filter((task) => task.id !== id); },
    async switchAccount() { account = "other"; records = []; render(); await settle(); },
  };
}

test("pagination preserves loaded history and associated assets through polling", async () => {
  const h = harness();
  await h.settle();
  assert.equal(h.state.tasks.length, 120);
  assert.equal(h.result.hasMoreHistory, true);
  await h.more();
  assert.equal(h.state.tasks.length, 125);
  assert.equal(h.state.assets.length, 125);
  assert.equal(h.result.hasMoreHistory, false);
  await h.poll();
  assert.equal(h.state.tasks.length, 125);
  assert.equal(h.state.assets.length, 125);
});

test("an active task outside both recent windows is followed to its terminal state", async () => {
  const h = harness(150, 1);
  await h.settle();
  assert.equal(h.state.tasks.find((task) => task.id === 1).status, "running");
  h.records.find((task) => task.id === 1).status = "completed";
  await h.poll();
  assert.equal(h.state.tasks.find((task) => task.id === 1).status, "completed");
  assert.ok(h.calls.some((options) => options.task_ids?.includes(1)));
  assert.ok(h.state.assets.some((asset) => asset.source_task_id === 1));
});

test("failed pagination retries the same cursor and changing accounts clears history", async () => {
  const h = harness();
  await h.settle();
  h.failPage(true);
  await h.more();
  assert.equal(h.result.historyError, "Page unavailable");
  assert.equal(h.state.tasks.length, 120);
  h.failPage(false);
  await h.more();
  assert.equal(h.state.tasks.length, 125);
  const pageCalls = h.calls.filter((options) => options.before_id);
  assert.equal(pageCalls[0].before_id, pageCalls[1].before_id);
  await h.switchAccount();
  assert.equal(h.state.tasks.length, 0);
  assert.equal(h.state.assets.length, 0);
  assert.equal(h.result.hasMoreHistory, false);
});

test("deleting a tracked active task does not block other task updates", async () => {
  const h = harness(150, 1);
  await h.settle();
  h.deleteTask(1);
  await h.poll();
  assert.equal(h.state.tasks.some((task) => task.id === 1), false);
  assert.equal(h.state.assets.some((asset) => asset.source_task_id === 1), false);
  assert.equal(h.state.error, "");
});

test("hidden pages stop timers and synchronize immediately on return", async () => {
  const h = harness(150, 1);
  await h.settle();
  await h.more();
  assert.equal(h.timerCount, 1);
  assert.equal(h.listenerCount, 1);
  await h.visibility(true);
  const before = h.calls.length;
  await h.poll();
  assert.equal(h.timerCount, 0);
  assert.equal(h.calls.length, before);
  h.records.find((task) => task.id === 1).status = "completed";
  await h.visibility(false);
  assert.ok(h.calls.length > before);
  assert.equal(h.state.tasks.find((task) => task.id === 1).status, "completed");
  assert.equal(h.state.tasks.length, 150);
  assert.equal(h.timerCount, 1);
  assert.equal(h.listenerCount, 1);
});

test("configuration refreshes only when due and preserves loaded history", async () => {
  const h = harness();
  await h.settle();
  await h.more();
  const before = h.configurationCalls.length;
  h.configure(2);
  h.advance(4 * 60 * 1000);
  await h.poll();
  assert.equal(h.configurationCalls.length, before);
  assert.equal(h.state.providers[0].provider_name, "model-1");
  h.advance(60 * 1000);
  await h.poll();
  assert.equal(h.configurationCalls.length, before + 5);
  assert.equal(h.state.providers[0].provider_name, "model-2");
  assert.equal(h.state.tasks.length, 125);
  assert.equal(h.result.hasMoreHistory, false);
});

test("configuration failures keep previous values and do not block task progress", async () => {
  const h = harness(150, 1);
  await h.settle();
  h.configure(2, true);
  h.advance(5 * 60 * 1000);
  h.records.find((task) => task.id === 1).status = "completed";
  await h.poll();
  assert.equal(h.state.providers[0].provider_name, "model-1");
  assert.equal(h.state.tasks.find((task) => task.id === 1).status, "completed");
  assert.equal(h.state.error, "Configuration unavailable");
  const callsAfterFailure = h.configurationCalls.length;
  await h.poll();
  assert.equal(h.configurationCalls.length, callsAfterFailure);
  assert.equal(h.state.error, "Configuration unavailable");
  h.configure(2);
  h.advance(5 * 60 * 1000);
  await h.poll();
  assert.equal(h.state.providers[0].provider_name, "model-2");
  assert.equal(h.state.error, "");
});

test("returning after a long hidden period refreshes configuration and cleans old listeners", async () => {
  const h = harness();
  await h.settle();
  await h.visibility(true);
  h.configure(3);
  h.advance(6 * 60 * 1000);
  await h.visibility(false);
  assert.equal(h.state.providers[0].provider_name, "model-3");
  await h.switchAccount();
  assert.equal(h.timerCount, 1);
  assert.equal(h.listenerCount, 1);
});

test("returning during an in-flight request queues one sync without overlapping requests", async () => {
  const h = harness();
  await h.settle();
  const release = h.deferNextTaskRequest();
  await h.poll();
  await h.visibility(true);
  const before = h.calls.length;
  await h.visibility(false);
  assert.equal(h.calls.length, before);
  release();
  await h.settle();
  assert.equal(h.calls.length, before + 2);
  assert.equal(h.timerCount, 1);
});

test("unmount removes timers and listeners and ignores an unfinished request", async () => {
  const h = harness();
  await h.settle();
  const release = h.deferNextTaskRequest();
  await h.poll();
  const previousState = h.state;
  h.unmount();
  assert.equal(h.timerCount, 0);
  assert.equal(h.listenerCount, 0);
  release();
  await h.settle();
  assert.equal(h.state, previousState);
});
