import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const clone = value => JSON.parse(JSON.stringify(value));
const baseFloor = () => ({ floor_index: 1, label: "floor 1", line_path: "/synthetic.png", mask_file: "synthetic-mask.png",
  geometry: { min_x: 0, min_y: 0, scale: 1 }, square_meters_per_pixel: .01,
  rooms: [{ room_id: "r1", marker: "1", area_ratio: 1, function: "办公", layout_kind: "office" }],
  preparation: { current: true, calibration: { points: [{ x: .1, y: .1 }, { x: .9, y: .1 }], meters: 10 },
    confirmed_proposals: { r1: "办公" }, routes: [{ points: [{ x: .1, y: .2 }, { x: .8, y: .2 }], width_m: 1.2, origin: "manual" }] } });
function compile(code, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
  { exports, Error, ...globals, require(name) {
    if (Object.hasOwn(imports, name)) return imports[name];
    throw new Error(`Unstubbed import: ${name}`);
  } });
  return exports;
}
function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(text).join("");
  return typeof node === "object" ? text(node.props?.children) : String(node);
}
function harness(world = {}, options = {}) {
  let cursor = 0, changed = false, mounted = true, tree, pending;
  const slots = [], effects = [], updates = [], listeners = new Map(), returned = [];
  let lateWrites = 0;
  const hooks = {
    createContext(value) { return { Provider: "synthetic-provider", value }; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], next => { if (mounted) { updates.push({ i, next }); changed = true; } else lateWrites++; }]; },
    useMemo(create, deps) { const i = cursor++, old = slots[i];
      if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) slots[i] = { deps, value: create() };
      return slots[i].value; },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(create, deps) { const i = cursor++, old = slots[i];
      if (!deps || !old || deps.some((value, j) => !Object.is(value, old.deps[j]))) {
        const record = { deps }; slots[i] = record;
        effects.push(() => { old?.cleanup?.(); record.cleanup = create(); });
      } },
  };
  const window = { confirm: () => world.confirm ?? false, addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); } };
  const jsx = (type, props) => ({ type, props });
  const imports = { react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx },
    "./cadPreparation.css": {}, "../../api": { api: world.api ?? new Proxy({}, { get() { throw new Error("Unexpected API call"); } }) },
    "./cadCirculation": compile(source("features/studio/cadCirculation.ts"), {}) };
  if (existsSync(new URL("../src/features/studio/cadPreparationDrafts.ts", import.meta.url))) {
    imports["./cadPreparationDrafts"] = world.drafts ??= compile(source("features/studio/cadPreparationDrafts.ts"), {}, { window });
  }
  const { CadPreparationPanel } = compile(source("features/studio/CadPreparationPanel.tsx"), imports, { window });
  const props = { record: { extract_id: "synthetic-A" }, floor: baseFloor(), busy: false,
    draftOwner: "synthetic-user-1", onUpdated(result) { returned.push(result); if (result.data?.spaces?.floors?.[0]) props.floor = result.data.spaces.floors[0]; }, onPendingChange(value) { pending = value; }, ...options };
  let invoke = () => CadPreparationPanel(props);
  if (options.view === "result" || options.view === "page") {
    const pageImports = { react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx }, "../../api": imports["../../api"],
      "react-router-dom": { useNavigate: () => () => {}, useSearchParams: () => [world.params ??= new URLSearchParams()] },
      "../../context/AuthContext": { useAuth: () => ({ isGuest: false, currentUser: { id: 1 } }) },
      "../../features/studio/CadPreparationPanel": { CadPreparationPanel, CAD_ROOM_KINDS: [] },
      "../../features/studio/cadProgram": { buildCadProgram: () => ({}) },
      "../../features/studio/studioAssetUtils": { fileToDataUrl: async () => "data:application/octet-stream;base64,QQ==" },
      "../../lib/datetime": { formatChinaMonthDayTime: value => value },
      "../../utils/uploads": { formatUploadSize: value => String(value) } };
    const page = compile(source("pages/studio/CadExtractPage.tsx") + "\nexport { CadExtractResult };", pageImports, { window });
    invoke = options.view === "page" ? () => page.default() : () => page.CadExtractResult(props);
  }
  if (options.view === "session") {
    const session = compile(source("context/AuthContext.tsx"), { react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx },
      "../api": { api: world.api, getStoredAuthToken: () => world.token ?? null,
        setStoredAuthToken() {}, clearStoredAuthToken() {} },
      "../features/access/roleAccess": { canManageUsers: () => false, canUseBackoffice: () => false },
      "../features/access/guestMode": { readGuestModeSession: () => false, writeGuestModeSession() {} },
      "../features/studio/cadPreparationDrafts": world.drafts }, { window });
    invoke = () => session.AuthProvider({ children: null });
  }
  function render() {
    for (let pass = 0; pass < 20; pass++) {
      for (const { i, next } of updates.splice(0)) slots[i] = typeof next === "function" ? next(slots[i]) : next;
      cursor = 0; changed = false; tree = invoke();
      for (const effect of effects.splice(0)) effect();
      if (!changed) return;
    }
    throw new Error("Component effects did not settle");
  }
  function nodes(node) {
    if (!arguments.length) node = tree;
    if (Array.isArray(node)) return node.flatMap(n => nodes(n));
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children)];
  }
  const input = () => nodes().find(n => n.type === "label" && text(n).startsWith("两点实际长度")).props.children.find(n => n?.type === "input");
  render();
  if (!options.view) { nodes().find(n => n.type === "img").props.onLoad({ currentTarget: { naturalWidth: 600, naturalHeight: 500 } }); render(); }
  return { world, nodes, returned, props, get tree() { return tree; }, render, input, get pending() { return pending; }, get lateWrites() { return lateWrites; }, get text() { return text(tree); },
    button(label) { return nodes().find(n => n.type === "button" && text(n) === label); },
    async flush() { await new Promise(resolve => setImmediate(resolve)); render(); },
    beforeUnload() { const event = { prevented: false, preventDefault() { this.prevented = true; } };
      for (const fn of listeners.get("beforeunload") ?? []) fn(event); return event.prevented; },
    editMeters(value) { input().props.onChange({ target: { value } }); render(); },
    unmount() { mounted = false; for (const slot of slots) slot?.cleanup?.(); } };
}

test("same floor content in a new response object preserves edited meters and pending", () => {
  const h = harness();
  assert.equal(h.input().props.value, "10");
  h.editMeters("20");
  h.props.floor = clone(h.props.floor);
  h.render();
  assert.equal(h.input().props.value, "20");
  assert.equal(h.pending, true);
  h.unmount();
});

test("changed geometry retains dirty inputs and reports a recoverable conflict", () => {
  const h = harness();
  h.editMeters("20");
  h.props.floor = { ...clone(h.props.floor), geometry: { min_x: 5, min_y: 0, scale: 2 } };
  h.render();
  assert.equal(h.input().props.value, "20");
  assert.equal(h.pending, true);
  assert.match(h.text, /变化|冲突/);
  h.unmount();
});

test("notes another floor and compatibility paths do not erase preparation", () => {
  const h = harness(); h.editMeters("20");
  h.props.record = { ...h.props.record, notes: "saved elsewhere", otherFloor: "changed" };
  h.props.floor = { ...clone(h.props.floor), line_path: "/new-cache.png", preview_path: "/new-preview.png" };
  h.render();
  assert.equal(h.input().props.value, "20"); assert.equal(h.pending, true);
  assert.doesNotMatch(h.text, /草稿仍保留/); h.unmount();
});

test("clean preparation follows relevant server updates normally", () => {
  const h = harness();
  h.props.floor = clone(h.props.floor); h.props.floor.preparation.calibration.meters = 30;
  h.render(); assert.equal(h.input().props.value, "30"); assert.equal(h.pending, false); h.unmount();
});

test("relevant room change blocks saving until explicit reconfirmation", () => {
  const h = harness(); h.editMeters("20");
  h.props.floor = clone(h.props.floor); h.props.floor.rooms[0].function = "会议"; h.render();
  assert.equal(h.button("保存本层布置条件").props.disabled, true);
  h.button("按当前分区重新核对，保留尺度与通路").props.onClick(); h.render();
  assert.equal(h.input().props.value, "20"); assert.equal(h.pending, true);
  assert.doesNotMatch(h.text, /当前平面或已保存条件已变化/); h.unmount();
});

test("explicit discard adopts latest server values and clears only this draft", () => {
  const w = {}, h = harness(w); h.editMeters("20");
  h.props.floor = clone(h.props.floor); h.props.floor.preparation.calibration.meters = 30; h.render();
  h.button("放弃本层草稿，采用最新条件").props.onClick(); h.render();
  assert.equal(h.input().props.value, "30"); assert.equal(h.pending, false); h.unmount();
  const again = harness(w, { floor: baseFloor() });
  assert.equal(again.input().props.value, "10"); again.unmount();
});

test("floor and record unmount return restores isolated drafts", () => {
  const w = {}, a = harness(w); a.editMeters("20"); a.unmount();
  const b = harness(w, { floor: { ...baseFloor(), floor_index: 2 } });
  assert.equal(b.input().props.value, "10"); b.editMeters("40"); b.unmount();
  const other = harness(w, { record: { extract_id: "synthetic-B" } });
  assert.equal(other.input().props.value, "10"); other.unmount();
  const restored = harness(w); assert.equal(restored.input().props.value, "20"); assert.equal(restored.pending, true); restored.unmount();
  const restoredB = harness(w, { floor: { ...baseFloor(), floor_index: 2 } });
  assert.equal(restoredB.input().props.value, "40"); restoredB.unmount();
});

test("return after geometry update restores original input with conflict", () => {
  const w = {}, h = harness(w); h.editMeters("20"); h.unmount();
  const next = { ...baseFloor(), mask_file: "different-mask.png" };
  const restored = harness(w, { floor: next });
  assert.equal(restored.input().props.value, "20"); assert.match(restored.text, /当前平面或已保存条件已变化/);
  assert.equal(restored.button("保存本层布置条件").props.disabled, true); restored.unmount();
});

test("unload warning follows dirty state and explicit discard removes it", () => {
  const h = harness(); assert.equal(h.beforeUnload(), false); h.editMeters("20");
  assert.equal(h.beforeUnload(), true);
  h.button("放弃本层草稿，采用最新条件").props.onClick(); h.render();
  assert.equal(h.beforeUnload(), false); h.unmount();
});

test("draft cache separates accounts and session clear removes old drafts", () => {
  const w = {}, h = harness(w); h.editMeters("20"); h.unmount();
  const other = harness(w, { draftOwner: "synthetic-user-2" });
  assert.equal(other.input().props.value, "10"); other.editMeters("40"); other.unmount();
  w.drafts.clearCadPreparationDrafts();
  const original = harness(w); assert.equal(original.input().props.value, "10"); original.unmount();
  const second = harness(w, { draftOwner: "synthetic-user-2" }); assert.equal(second.input().props.value, "10"); second.unmount();
});

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function savedRecord(body) {
  const floor = baseFloor(); floor.preparation = { ...floor.preparation, ...clone(body), current: true };
  return { extract_id: "synthetic-A", data: { spaces: { floors: [floor] } } };
}
function savingWorld() {
  const gate = deferred(), calls = [];
  return { gate, calls, api: { saveCadPreparation(id, body) { calls.push({ id, body: clone(body) }); return gate.promise; } } };
}

test("successful save confirms submitted input and clears pending without prop-reference reset", async () => {
  const w = savingWorld(), h = harness(w); h.editMeters("20");
  h.button("保存本层布置条件").props.onClick(); h.render();
  assert.equal(w.calls[0].body.calibration.meters, 20); assert.equal(h.pending, true);
  assert.equal(h.nodes().find(n => n.type === "fieldset").props.disabled, true);
  w.gate.resolve(savedRecord(w.calls[0].body)); await h.flush();
  assert.equal(h.input().props.value, "20"); assert.equal(h.pending, false); assert.equal(h.returned.length, 1);
  h.unmount(); const restored = harness(w, { floor: savedRecord(w.calls[0].body).data.spaces.floors[0] });
  assert.equal(restored.pending, false); restored.unmount();
});

test("save failure retains inputs cache pending and makes no automatic retry", async () => {
  const w = savingWorld(), h = harness(w); h.editMeters("20"); h.button("保存本层布置条件").props.onClick(); h.render();
  w.gate.reject(new Error("synthetic offline refusal")); await h.flush();
  assert.equal(h.input().props.value, "20"); assert.equal(h.pending, true); assert.match(h.text, /synthetic offline refusal/);
  assert.equal(w.calls.length, 1); h.unmount();
  const restored = harness(w); assert.equal(restored.input().props.value, "20"); restored.unmount();
});

test("save response after leaving neither updates new view nor clears cached draft", async () => {
  const w = savingWorld(), h = harness(w); h.editMeters("20"); h.button("保存本层布置条件").props.onClick(); h.render(); h.unmount();
  w.gate.resolve(savedRecord(w.calls[0].body)); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.returned.length, 0); assert.equal(h.lateWrites, 0);
  const restored = harness(w); assert.equal(restored.input().props.value, "20"); assert.equal(restored.pending, true); restored.unmount();
});

test("server change during save preserves draft and does not replace newer record", async () => {
  const w = savingWorld(), h = harness(w); h.editMeters("20"); h.button("保存本层布置条件").props.onClick(); h.render();
  h.props.floor = { ...clone(h.props.floor), mask_file: "newer-mask.png" }; h.render();
  w.gate.resolve(savedRecord(w.calls[0].body)); await h.flush();
  assert.equal(h.input().props.value, "20"); assert.equal(h.pending, true); assert.equal(h.returned.length, 0);
  assert.match(h.text, /保存期间平面内容已变化/); h.unmount();
});

test("unfinished route points and width survive same-tab departure", () => {
  const w = {}, h = harness(w); h.button("新增通路").props.onClick(); h.render();
  h.nodes().find(n => n.type === "label" && text(n).startsWith("通路预留宽度")).props.children.find(n => n?.type === "input").props.onChange({ target: { value: "1.6" } }); h.render();
  const svg = () => h.nodes().find(n => n.type === "svg");
  svg().props.onPointerDown({ clientX: 100, clientY: 100, currentTarget: { getBoundingClientRect() { return { left: 0, top: 0, width: 600, height: 500 }; } } }); h.render();
  assert.equal(h.pending, true); h.unmount();
  const restored = harness(w);
  assert.match(restored.text, /点击增加折点/);
  assert.equal(restored.nodes().filter(n => n.props?.["aria-label"] === "通路折点 1").length, 1);
  assert.equal(restored.nodes().find(n => n.type === "label" && text(n).startsWith("通路预留宽度")).props.children.find(n => n?.type === "input").props.value, "1.6");
  assert.equal(restored.pending, true); restored.unmount();
});

const record = (id = "synthetic-A") => ({ extract_id: id, status: "ok", file_name: `${id}.dxf`,
  source_format: "dxf", source_storage_path: "unused.dxf", warnings: [], data: { spaces: { floors: [baseFloor(), { ...baseFloor(), floor_index: 2, label: "floor 2" }] } } });

test("actual floor tab can cancel pending navigation then retain draft on accepted switch", () => {
  const w = {}, h = harness(w, { view: "result", record: record() });
  let child = h.nodes().find(n => n.type?.name === "CadPreparationPanel");
  child.props.onPendingChange(true); h.render();
  const tab = () => h.nodes().find(n => n.props?.role === "tab" && text(n).startsWith("floor 2"));
  tab().props.onClick(); h.render();
  assert.equal(h.nodes().find(n => n.type?.name === "CadPreparationPanel").props.floor.floor_index, 1);
  w.confirm = true; tab().props.onClick(); h.render();
  child = h.nodes().find(n => n.type?.name === "CadPreparationPanel");
  assert.equal(child.props.floor.floor_index, 2); assert.equal(child.props.draftOwner, "synthetic-user-1"); h.unmount();
});

test("actual record selection cancels or accepts retaining preparation draft", async () => {
  const w = { api: { listCadExtracts: async () => [record(), record("synthetic-B")] } };
  const h = harness(w, { view: "page" }); await h.flush();
  const result = () => h.nodes().find(n => n.type?.name === "CadExtractResult");
  assert.equal(result().props.record.extract_id, "synthetic-A");
  result().props.onPreparationPending(true); h.render();
  const link = () => h.nodes().find(n => n.type === "button" && n.props.className === "cad-history-item");
  link().props.onClick(); h.render(); assert.equal(result().props.record.extract_id, "synthetic-A");
  w.confirm = true; link().props.onClick(); h.render();
  assert.equal(result().props.record.extract_id, "synthetic-B"); assert.equal(result().props.draftOwner, "1"); h.unmount();
});

test("actual page list refresh retains pending selected record even when absent in response", async () => {
  const w = { api: { listCadExtracts: async () => [record()] } }, h = harness(w, { view: "page" });
  await h.flush(); let child = h.nodes().find(n => n.type?.name === "CadExtractResult");
  child.props.onPreparationPending(true); h.render();
  // The real list effect runs again when its router search parameter object changes.
  w.api.listCadExtracts = async () => [record("synthetic-B")];
  w.params = new URLSearchParams("extract=synthetic-B"); h.render(); await h.flush();
  child = h.nodes().find(n => n.type?.name === "CadExtractResult");
  assert.equal(child.props.record.extract_id, "synthetic-A"); h.unmount();
});

test("existing session transitions clear local CAD drafts without invoking real services", async () => {
  for (const action of ["logout", "enterGuestMode", "login", "expired"]) {
    const w = { api: { logout: async () => { throw new Error("synthetic logout offline"); },
      login: async () => ({ token: "synthetic", user: { id: 2 } }), me: async () => { throw new Error("synthetic expired session"); } } };
    const panel = harness(w); panel.editMeters("20"); panel.unmount();
    const key = w.drafts.preparationDraftKey("synthetic-user-1", "synthetic-A", 1);
    assert.ok(w.drafts.readPreparationDraft(key));
    if (action === "expired") w.token = "synthetic-expired";
    const session = harness(w, { view: "session" });
    if (action !== "expired") await session.tree.props.value[action]("synthetic", "synthetic");
    await session.flush();
    assert.equal(w.drafts.readPreparationDraft(key), undefined, action); session.unmount();
  }
});

test("malformed save response cannot acknowledge or discard the current draft", async () => {
  const w = savingWorld(), h = harness(w); h.editMeters("20"); h.button("保存本层布置条件").props.onClick(); h.render();
  w.gate.resolve({ extract_id: "synthetic-A" }); await h.flush();
  assert.equal(h.input().props.value, "20"); assert.equal(h.pending, true);
  assert.equal(h.returned.length, 0); assert.match(h.text, /保存响应缺少本层条件/); h.unmount();
});

test("suggestion from an older floor version is not adopted into newer inputs", async () => {
  const gate = deferred(), w = { api: { suggestCadRoutes: () => gate.promise } }, h = harness(w);
  h.editMeters("20"); h.button("系统生成通路建议").props.onClick(); h.render();
  h.props.floor = { ...clone(h.props.floor), mask_file: "newer.png" }; h.render();
  gate.resolve({ routes: baseFloor().preparation.routes, warnings: [], entry: null, unreachable_room_ids: [], status: "ok" });
  await h.flush(); assert.equal(h.button("采用建议，保留手画通路"), undefined);
  assert.equal(h.input().props.value, "20"); assert.equal(h.pending, true); h.unmount();
});

test("new extract completion does not automatically unmount a pending preparation", async () => {
  const w = { api: { listCadExtracts: async () => [record()], createCadExtract: async () => record("synthetic-B") } };
  const h = harness(w, { view: "page" }); await h.flush();
  h.nodes().find(n => n.type?.name === "CadExtractResult").props.onPreparationPending(true); h.render();
  h.nodes().find(n => n.type === "input" && n.props.type === "file").props.onChange({ target: { files: [{ name: "synthetic.dxf", size: 1 }] } }); h.render();
  h.nodes().find(n => n.type === "form").props.onSubmit({ preventDefault() {} }); await h.flush();
  assert.equal(h.nodes().find(n => n.type?.name === "CadExtractResult").props.record.extract_id, "synthetic-A");
  assert.match(h.text, /解析已完成，当前准备条件草稿仍保留/); h.unmount();
});
