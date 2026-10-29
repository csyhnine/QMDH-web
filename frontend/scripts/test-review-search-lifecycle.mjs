import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const plain = (value) => JSON.parse(JSON.stringify(value));
const source = (relative) => readFileSync(new URL(`../src/${relative}`, import.meta.url), "utf8");

function compile(code, imports = {}) {
  const exports = {};
  const output = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(output, {
    exports,
    require(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      throw new Error(`Unstubbed import: ${name}`);
    },
  });
  return exports;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Reuse the repository's slot/effect + transpiled-hook harness pattern from
// test-studio-data-loader.mjs; only timers and the search API are synthetic.
function harness(initialDomain = "templates", initialQuery = "alpha") {
  let domain = initialDomain, query = initialQuery;
  let cursor = 0, timerId = 0, now = 0, dirty = false, mounted = true;
  let result, writesAfterUnmount = 0;
  const slots = [], effects = [], stateUpdates = [], timers = new Map(), requests = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { kind: "state", value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next) => {
        if (!mounted) { writesAfterUnmount += 1; return; }
        stateUpdates.push({ index, next }); dirty = true;
      }];
    },
    useEffect(create, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        const record = { kind: "effect", deps: [...deps], create };
        slots[index] = record;
        effects.push(() => { previous?.cleanup?.(); record.cleanup = create(); });
      } else previous.create = create;
    },
  };
  const api = { search(parameters) {
    const gate = deferred();
    requests.push({ parameters: plain(parameters), ...gate });
    return gate.promise;
  } };
  const exports = {};
  const output = ts.transpileModule(source("lib/search/useServerSearch.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(output, {
    exports,
    require(name) {
      if (name === "react") return react;
      if (name === "../../api") return { api };
      throw new Error(`Unstubbed hook import: ${name}`);
    },
    window: {
      setTimeout(fn, delay) { timers.set(++timerId, { at: now + delay, fn }); return timerId; },
      clearTimeout(id) { timers.delete(id); },
    },
  });
  function renderOnly() {
    // Functional updaters run when React processes state, not in the Promise callback.
    for (const { index, next } of stateUpdates.splice(0)) {
      slots[index].value = typeof next === "function" ? next(slots[index].value) : next;
    }
    cursor = 0; dirty = false;
    result = exports.useServerSearch(domain, query);
    return plain(result);
  }
  function commit() {
    for (let pass = 0; pass < 20; pass += 1) {
      for (const effect of effects.splice(0)) effect();
      if (!dirty) return;
      renderOnly();
    }
    throw new Error("Hook did not settle");
  }
  async function flush() {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    if (mounted) commit();
  }
  function unmount() {
    mounted = false;
    for (const slot of slots) if (slot.kind === "effect") slot.cleanup?.();
  }
  renderOnly(); commit();
  return {
    requests, commit, flush, unmount,
    get result() { return plain(result); },
    get timerCount() { return timers.size; },
    get writesAfterUnmount() { return writesAfterUnmount; },
    render(nextDomain, nextQuery, runEffects = true) {
      domain = nextDomain; query = nextQuery;
      const beforeEffects = renderOnly();
      if (runEffects) commit();
      return beforeEffects;
    },
    replayEffects() {
      for (const slot of [...slots]) if (slot.kind === "effect") {
        slot.cleanup?.(); slot.cleanup = slot.create();
      }
      commit();
    },
    async advance(milliseconds) {
      const end = now + milliseconds;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
        if (!due.length) break;
        const [id, timer] = due[0];
        timers.delete(id); now = timer.at; timer.fn(); commit();
      }
      now = end; await flush();
    },
  };
}

function initializer(file, name, property = false) {
  const parsed = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  function visit(node) {
    if ((property ? ts.isPropertyAssignment(node) : ts.isVariableDeclaration(node)) && node.name?.getText(parsed) === name) found.push(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.equal(found.length, 1, `${file}: ${name}`);
  return { node: found[0], parsed };
}

// Execute the consumers' actual readonly expressions, not replicas of their
// filtering logic. Preview, tracking, page rendering and all API calls stay out.
const templateUtils = compile(source("features/studio/studioTemplateUtils.ts"));
const browserUtils = compile(source("features/studio/studioTemplateBrowserUtils.ts"), { "./studioTemplateUtils": templateUtils });
const templateMemo = initializer("features/studio/useSharedTemplateBrowser.ts", "filteredSharedTemplates");
const templateCount = initializer("features/studio/useSharedTemplateBrowser.ts", "templateSearchHitCount", true);
assert.ok(ts.isCallExpression(templateMemo.node) && ts.isArrowFunction(templateMemo.node.arguments[0]));
// The projection has no runtime imports; inject only the real filter function.
const projectionCode = `
export function project(sharedTemplates, templateSearch, result) {
  const activeTemplateCategory = "all", activeTemplateSubcategory = "all", templateQuickFilter = "all";
  const templateSearchMatchIds = result.matchIds, usingTemplateServerSearch = result.usingServerSearch;
  const rows = (${templateMemo.node.arguments[0].getText(templateMemo.parsed)})();
  return { ids: rows.map(row => row.id), count: (${templateCount.node.getText(templateCount.parsed)}) };
}`;
const templateExports = {};
vm.runInNewContext(ts.transpileModule(projectionCode, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports: templateExports, filterSharedTemplates: browserUtils.filterSharedTemplates });
const inspirationRows = initializer("pages/inspiration/InspirationPage.tsx", "visiblePosts");
const normalized = initializer("pages/inspiration/InspirationPage.tsx", "normalizedQuery");
const inspirationExports = compile(`
export function project(posts, sourceFilter, result) {
  const inspirationSearchQuery = result.trimmedQuery, inspirationSearchMatchIds = result.matchIds;
  const usingInspirationServerSearch = result.usingServerSearch;
  const normalizedQuery = ${normalized.node.getText(normalized.parsed)};
  return (${inspirationRows.node.getText(inspirationRows.parsed)}).map(post => post.id);
}`);
const records = [
  { id: 1, label: "alpha", title: "alpha", source_type: "user" },
  { id: 2, label: "beta", title: "beta", source_type: "external" },
  { id: 3, label: "beta local", title: "beta local", source_type: "user" },
].map((row) => ({ category: "architecture", subcategory: "house", is_featured: false, tags: [], ...row }));
const templates = (query, result) => plain(templateExports.project(records, query, result));
const inspiration = (result, sourceFilter = "all") => plain(inspirationExports.project(records, sourceFilter, result));
const response = (ids, engine) => ({ hits: ids.map((id) => ({ id })), engine });

test("trimmed serial search keeps the 300ms debounce and stable input does not retry", async (t) => {
  const h = harness("templates", " alpha "); t.after(h.unmount);
  await h.advance(299); assert.equal(h.requests.length, 0);
  await h.advance(1); assert.deepEqual(h.requests[0].parameters, { q: "alpha", domain: "templates", limit: 50 });
  assert.equal(h.result.isSearching, true);
  h.requests[0].resolve(response([1], "serial")); await h.flush();
  assert.deepEqual(h.result, { trimmedQuery: "alpha", matchIds: [1], engine: "serial", isSearching: false, usingServerSearch: true });
  h.render("templates", "alpha"); await h.advance(1000);
  assert.equal(h.requests.length, 1); assert.deepEqual(h.result.matchIds, [1]);
});

test("new query hides old hits and metadata before passive effects, including both consumers", async (t) => {
  const h = harness(); t.after(h.unmount);
  await h.advance(300); h.requests[0].resolve(response([1], "alpha-engine")); await h.flush();
  const immediate = h.render("templates", "beta", false);
  assert.deepEqual(immediate, { trimmedQuery: "beta", matchIds: null, engine: null, isSearching: false, usingServerSearch: false });
  assert.deepEqual(templates("beta", immediate), { ids: [2, 3], count: null });
  assert.deepEqual(inspiration(immediate), [2, 3]);
  h.commit(); await h.advance(300); h.requests[1].resolve(response([3], "beta-engine")); await h.flush();
  assert.deepEqual(templates("beta", h.result), { ids: [3], count: 1 });
  assert.deepEqual(inspiration(h.result), [3]);
});

test("alpha success arriving after beta success cannot replace beta", async (t) => {
  const h = harness(); t.after(h.unmount);
  await h.advance(300); h.render("templates", "beta"); await h.advance(300);
  h.requests[1].resolve(response([2], "beta")); await h.flush();
  h.requests[0].resolve(response([1], "alpha")); await h.flush();
  assert.deepEqual(h.result, { trimmedQuery: "beta", matchIds: [2], engine: "beta", isSearching: false, usingServerSearch: true });
  assert.deepEqual(templates("beta", h.result), { ids: [2], count: 1 });
  assert.deepEqual(inspiration(h.result), [2]);
});

test("old failure after new success cannot clear new results or engine", async (t) => {
  const h = harness(); t.after(h.unmount);
  await h.advance(300); h.render("templates", "beta"); await h.advance(300);
  h.requests[1].resolve(response([2], "beta")); await h.flush();
  h.requests[0].reject(new Error("synthetic old failure")); await h.flush();
  assert.deepEqual(h.result.matchIds, [2]); assert.equal(h.result.engine, "beta"); assert.equal(h.result.usingServerSearch, true);
});

test("old finally cannot stop loading for a newer pending request", async (t) => {
  const h = harness(); t.after(h.unmount);
  await h.advance(300); h.render("templates", "beta"); await h.advance(300);
  h.requests[0].resolve(response([1], "old")); await h.flush();
  assert.equal(h.result.isSearching, true); assert.equal(h.result.matchIds, null); assert.equal(h.result.engine, null);
  h.requests[1].resolve(response([2], "new")); await h.flush(); assert.equal(h.result.isSearching, false);
});

test("clearing query cancels debounce and invalidates already started responses", async (t) => {
  const h = harness(); t.after(h.unmount);
  h.render("templates", "  "); await h.advance(500);
  assert.equal(h.requests.length, 0); assert.equal(h.timerCount, 0);
  h.render("templates", "alpha"); await h.advance(300);
  h.render("templates", ""); h.requests[0].resolve(response([1], "late")); await h.flush();
  assert.deepEqual(h.result, { trimmedQuery: "", matchIds: null, engine: null, isSearching: false, usingServerSearch: false });
});

test("same query in another domain does not reuse stored hits or metadata", async (t) => {
  const h = harness(); t.after(h.unmount);
  await h.advance(300); h.requests[0].resolve(response([1], "templates")); await h.flush();
  const immediate = h.render("inspiration", "alpha", false);
  assert.equal(immediate.matchIds, null); assert.equal(immediate.engine, null);
  h.commit(); await h.advance(300);
  assert.deepEqual(h.requests[1].parameters, { q: "alpha", domain: "inspiration", limit: 50 });
  h.requests[1].resolve(response([3], "inspiration")); await h.flush(); assert.deepEqual(h.result.matchIds, [3]);
});

test("returning to the same query rejects the previous request with the same key", async (t) => {
  const h = harness(); t.after(h.unmount);
  await h.advance(300); h.render("templates", "beta"); h.render("templates", "alpha"); await h.advance(300);
  assert.equal(h.requests.length, 2);
  h.requests[0].resolve(response([1], "first-alpha")); await h.flush();
  assert.equal(h.result.matchIds, null); assert.equal(h.result.isSearching, true);
  h.requests[1].resolve(response([3], "second-alpha")); await h.flush();
  assert.deepEqual(h.result.matchIds, [3]); assert.equal(h.result.engine, "second-alpha");
});

test("effect cleanup and replay also invalidates a request without a key change", async (t) => {
  const h = harness(); t.after(h.unmount);
  await h.advance(300); h.replayEffects(); await h.advance(300);
  h.requests[1].resolve(response([2], "replayed")); await h.flush();
  h.requests[0].resolve(response([1], "retired")); await h.flush();
  assert.deepEqual(h.result.matchIds, [2]); assert.equal(h.result.engine, "replayed");
});

test("unmount cancels timers and prevents late success or failure state writes", async () => {
  const waiting = harness(); waiting.unmount(); await waiting.advance(300); assert.equal(waiting.requests.length, 0);
  for (const outcome of ["resolve", "reject"]) {
    const h = harness(); await h.advance(300); h.unmount();
    if (outcome === "resolve") h.requests[0].resolve(response([1], "late"));
    else h.requests[0].reject(new Error("synthetic late rejection"));
    await h.flush(); assert.equal(h.writesAfterUnmount, 0, outcome);
  }
});

test("empty server results stay empty and only current failure restores both local fallbacks", async (t) => {
  const h = harness("templates", "beta"); t.after(h.unmount);
  await h.advance(300); h.requests[0].resolve(response([], "empty-server")); await h.flush();
  assert.deepEqual(h.result.matchIds, []); assert.equal(h.result.usingServerSearch, true);
  assert.deepEqual(templates("beta", h.result), { ids: [], count: 0 }); assert.deepEqual(inspiration(h.result), []);
  h.render("templates", "beta local"); await h.advance(300);
  h.requests[1].reject(new Error("synthetic current failure")); await h.flush();
  assert.equal(h.result.matchIds, null); assert.equal(h.result.engine, null); assert.equal(h.result.isSearching, false);
  assert.deepEqual(templates("beta local", h.result), { ids: [3], count: null }); assert.deepEqual(inspiration(h.result), [3]);
});

test("malformed current response falls back instead of throwing during a queued state update", async (t) => {
  const h = harness("templates", "beta"); t.after(h.unmount);
  await h.advance(300); h.requests[0].resolve({ hits: null, engine: "malformed" }); await h.flush();
  assert.equal(h.result.matchIds, null); assert.equal(h.result.engine, null);
  assert.equal(h.result.isSearching, false); assert.equal(h.result.usingServerSearch, false);
  assert.deepEqual(templates("beta", h.result), { ids: [2, 3], count: null });
  assert.deepEqual(inspiration(h.result), [2, 3]);
});
