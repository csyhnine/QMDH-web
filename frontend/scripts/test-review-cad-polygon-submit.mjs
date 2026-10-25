import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const clone = value => JSON.parse(JSON.stringify(value));
function compile(source, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText,
  { exports, Error, ...globals, require(name) { if (Object.hasOwn(imports, name)) return imports[name]; throw Error(`Unexpected import ${name}`); } });
  return exports;
}
const page = ts.createSourceFile("Page.tsx", read("pages/studio/CadExtractPage.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(["CadExtractResult", "hexToRgb", "roomAreaText", "FurnitureGlyph", "statusLabel", "errorLabel", "roleLabel", "formatExtents", "ChipList", "cadRoomEditWasRejected", "CadExtractPage", "cadExtension", "toCadDataUrl"]);
const code = page.statements.filter(n => ts.isVariableStatement(n) || (ts.isFunctionDeclaration(n) && names.has(n.name?.text))).map(n => n.getText(page)).join("\n");
const componentSource = 'import {useState,useEffect,useMemo,useRef} from "react";\nimport {api} from "api";\nconst CAD_ROOM_KINDS=[]; const CadPreparationPanel=()=>null; const CadProgramPanel=()=>null; const params={get:()=>null}; const useNavigate=()=>()=>{}; const useSearchParams=()=>[params]; const useAuth=()=>({isGuest:false,currentUser:{id:1}}); const fileToDataUrl=async()=>"data:application/dxf;base64,QQ=="; const formatUploadSize=String; const formatChinaMonthDayTime=String;\n' + code + "\nexport {CadExtractResult,CadExtractPage};";
const apiSource = ts.createSourceFile("api.ts", read("api.ts"), ts.ScriptTarget.Latest, true);
const buildErrorSource = apiSource.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "buildError").getText(apiSource);
const { buildError } = compile('const MAX_REFERENCE_UPLOAD_BYTES=100; const formatUploadSize=n=>String(n);\n' + buildErrorSource + "\nexport {buildError};");
const httpError = status => buildError(new Response(JSON.stringify({ detail: "synthetic ordinary rejection" }), { status, headers: { "content-type": "application/json" } }));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const floor = index => ({ floor_index: index, label: `floor ${index}`, preview_path: `/floor-${index}.png`, line_path: `/floor-${index}-lines.png`,
  undo_count: 1, rooms: [{ room_id: `f${index}_r1`, marker: "1", area_ratio: 1, area_m2: 30, proposal: "办公", swatch: "#ff0000" }] });
const record = (id = "synthetic-A") => ({ extract_id: id, file_name: `${id}.dxf`, source_format: "dxf", source_storage_path: "unused.dxf", status: "ok", warnings: [], data: { spaces: { floors: [floor(1), floor(2)] } } });
function text(n) { if (n == null || typeof n === "boolean") return ""; if (Array.isArray(n)) return n.map(text).join(""); return typeof n === "object" ? text(n.props?.children) : String(n); }
function harness(initial = record(), view = "result") {
  let cursor = 0, changed = false, mounted = true, tree, lateWrites = 0;
  const slots = [], effects = [], updates = [], calls = [], returned = [], gates = { post: [], get: [], create: [] }, listeners = new Map();
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], next => { if (mounted) { updates.push({ i, next }); changed = true; } else lateWrites++; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(create, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) slots[i] = { deps, value: create() }; return slots[i].value; },
    useEffect(create, deps) { const i = cursor++, old = slots[i]; if (!deps || !old || deps.some((v, j) => !Object.is(v, old.deps[j]))) { const next = { deps }; slots[i] = next; effects.push(() => { old?.cleanup?.(); next.cleanup = create(); }); } },
  };
  const window = { addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); }, removeEventListener(name, fn) { listeners.get(name)?.delete(fn); } };
  class HTMLElement { tagName = "DIV"; }
  const props = { record: initial, copied: false, draftOwner: "synthetic-user-1", onCopy() {}, onDownload() {},
    onUpdated(result) { returned.push(result); props.record = result; } };
  function invoke(method, id, body) { calls.push({ method, id, body: body ? clone(body) : undefined, rawBody: body }); const gate = gates[method].shift(); if (!gate) throw Error(`Missing offline gate ${method}`); return gate.promise; }
  const api = { editCadRoom: (id, body) => invoke("post", id, body), getCadExtract: id => invoke("get", id), listCadExtracts: async () => [clone(initial), record("synthetic-B")], createCadExtract: body => invoke("create", "", body) };
  const jsx = (type, props) => ({ type, props });
  const { CadExtractResult, CadExtractPage } = compile(componentSource, { react: hooks, api: { api }, "react/jsx-runtime": { jsx, jsxs: jsx } }, { window, HTMLElement });
  let points = [];
  const ctx = new Proxy({ clearRect() { points = []; }, arc(x, y) { points.push([x, y]); } }, { get: (o, k) => o[k] ?? (() => {}) });
  const canvas = { width: 600, height: 500, getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 500 }), getContext: () => ctx };
  function render() { if (!mounted) return; for (let pass = 0; pass < 30; pass++) {
    for (const { i, next } of updates.splice(0)) slots[i] = typeof next === "function" ? next(slots[i]) : next;
    cursor = 0; changed = false; tree = view === "page" ? CadExtractPage() : CadExtractResult(props); effects.splice(0).forEach(fn => fn()); if (!changed) return;
  } throw Error("Component did not settle"); }
  function nodes(n) { if (!arguments.length) n = tree; if (Array.isArray(n)) return n.flatMap(n => nodes(n)); if (!n || typeof n !== "object") return []; return [n, ...nodes(n.props?.children)]; }
  const canvasNode = () => nodes().find(n => n.type === "canvas");
  render(); if (view === "result") { canvasNode().props.ref.current = canvas; render(); }
  return { props, calls, returned, render, nodes, get text() { return text(tree); }, get pointCount() { return points.length; }, get lateWrites() { return lateWrites; },
    beforeUnload() { const e = { prevented: false, preventDefault() { this.prevented = true; } }; for (const fn of listeners.get("beforeunload") ?? []) fn(e); return e.prevented; },
    button(label) { return nodes().find(n => n.type === "button" && text(n) === label); },
    nameInput() { return nodes().find(n => n.type === "input" && n.props.maxLength === 40); },
    name(value) { this.nameInput().props.onChange({ target: { value } }); render(); },
    point(x, y) { canvasNode().props.onPointerDown({ clientX: x * 600, clientY: y * 500, preventDefault() {} }); render(); },
    key(key, extra = {}) { for (const fn of [...listeners.get("keydown") ?? []]) fn({ key, target: new HTMLElement(), preventDefault() {}, ...extra }); render(); },
    hold(method) { const gate = deferred(); gates[method].push(gate); return gate; },
    async flush() { await new Promise(resolve => setImmediate(resolve)); render(); },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); } };
}
function sketch(h, count = 3) { h.button("新建分区").props.onClick(); h.render(); h.name("retained name");
  for (const [x, y] of [[.1, .1], [.8, .1], [.8, .8], [.5, .9], [.1, .8]].slice(0, count)) h.point(x, y); }

for (const count of [3, 5]) test(`${count} polygon vertices mode and name survive an explicit ordinary rejection`, async () => {
  const h = harness(), gate = h.hold("post"); sketch(h, count);
  assert.equal(h.pointCount, count); h.button("完成选区").props.onClick(); h.render(); gate.reject(await httpError(400)); await h.flush();
  assert.equal(h.pointCount, count); assert.ok(h.button("完成选区"));
  assert.equal(h.nameInput().props.value, "retained name"); assert.match(h.text, /synthetic ordinary rejection/); h.unmount();
});

function createdRecord(name = "retained name", id = "synthetic-A") {
  const result = record(id); result.data.spaces.floors[0].rooms.push({ room_id: "f1_r2", marker: "2", area_ratio: .5, area_m2: 15, proposal: name }); return result;
}

for (const method of ["button", "enter", "origin"]) test(`${method} closure captures current name and vertices then clears only on success`, async () => {
  const h = harness(), gate = h.hold("post"); sketch(h); h.name("typed after mode started");
  if (method === "button") h.button("完成选区").props.onClick(); else if (method === "enter") h.key("Enter"); else h.point(.1, .1);
  h.render(); assert.equal(h.pointCount, 3); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].body.proposal, "typed after mode started"); assert.equal(h.calls[0].body.strokes.length, 3);
  gate.resolve(createdRecord("typed after mode started")); await h.flush();
  assert.equal(h.pointCount, 0); assert.equal(h.button("完成选区"), undefined); assert.equal(h.returned.length, 1); h.unmount();
});

test("same tick button Enter and origin cannot duplicate POST or modify locked draft", async () => {
  const h = harness(), gate = h.hold("post"); sketch(h);
  const click = h.button("完成选区").props.onClick; click(); click(); h.key("Enter"); h.point(.1, .1);
  h.key("Escape"); h.key("Backspace"); h.name("should not replace pending name"); h.render();
  assert.equal(h.calls.length, 1); assert.equal(h.pointCount, 3); assert.equal(h.nameInput().props.value, "retained name");
  assert.equal(h.nameInput().props.disabled, true);
  assert.ok(h.nodes().filter(n => n.props?.role === "tab").every(n => n.props.disabled));
  gate.reject(await httpError(400)); await h.flush(); h.unmount();
});

test("all documented ordinary rejection statuses preserve an editable draft", async () => {
  for (const status of [400, 404, 409, 413, 422]) {
    const h = harness(), gate = h.hold("post"); sketch(h); h.button("完成选区").props.onClick(); h.render();
    gate.reject(await httpError(status)); await h.flush();
    assert.equal(h.pointCount, 3, status); assert.equal(h.button("完成选区").props.disabled, false, status);
    assert.equal(h.button("核对最新记录"), undefined); h.unmount();
  }
});

test("explicit refusal permits correction and manual retry with immutable earlier strokes", async () => {
  const h = harness(), first = h.hold("post"); sketch(h); h.button("完成选区").props.onClick(); h.render();
  first.reject(await httpError(422)); await h.flush(); const original = clone(h.calls[0].rawBody.strokes);
  h.point(.1, .8); h.name("corrected name"); const second = h.hold("post"); h.button("完成选区").props.onClick(); h.render();
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].body.strokes.length, 4);
  assert.deepEqual(clone(h.calls[0].rawBody.strokes), original); assert.equal(h.calls[1].body.proposal, "corrected name");
  second.resolve(createdRecord("corrected name")); await h.flush(); assert.equal(h.pointCount, 0); h.unmount();
});

test("transport timeout 408 and server failures remain unknown without any direct replay", async () => {
  for (const status of [null, 408, 500, 502]) {
    const h = harness(), gate = h.hold("post"); sketch(h); h.button("完成选区").props.onClick(); h.render();
    gate.reject(status === null ? new Error("synthetic transport timeout") : await httpError(status)); await h.flush();
    assert.equal(h.pointCount, 3); assert.equal(h.nameInput().props.value, "retained name");
    assert.match(h.text, /是否写入尚未确认/); assert.equal(h.button("完成选区").props.disabled, true);
    h.button("完成选区").props.onClick(); h.key("Enter"); assert.equal(h.calls.filter(c => c.method === "post").length, 1);
    assert.equal(h.button("我已核对写入，结束本次草稿"), undefined); h.unmount();
  }
});

test("timeout after actual synthetic create uses GET and human acknowledgement without second create", async () => {
  const h = harness(), gate = h.hold("post"); sketch(h); h.button("完成选区").props.onClick(); h.render();
  const accepted = createdRecord(); gate.reject(new Error("synthetic lost response after commit")); await h.flush();
  const get = h.hold("get"); h.button("核对最新记录").props.onClick(); h.render(); get.resolve(accepted); await h.flush();
  assert.equal(h.returned.length, 1); assert.equal(h.pointCount, 3); assert.equal(h.button("完成选区").props.disabled, true);
  assert.equal(h.props.record.data.spaces.floors[0].rooms.length, 2);
  assert.equal(h.calls.filter(c => c.method === "post").length, 1); assert.equal(h.calls.filter(c => c.method === "get").length, 1);
  h.button("我已核对写入，结束本次草稿").props.onClick(); h.render();
  assert.equal(h.pointCount, 0); assert.equal(h.button("核对最新记录"), undefined); h.unmount();
});

test("unchanged GET never proves the original POST stopped and does not unlock replay", async () => {
  const h = harness(), gate = h.hold("post"); sketch(h); h.button("完成选区").props.onClick(); h.render();
  gate.reject(new Error("synthetic timeout")); await h.flush(); const get = h.hold("get"); h.button("核对最新记录").props.onClick(); h.render();
  get.resolve(record()); await h.flush(); h.key("Enter"); h.button("完成选区").props.onClick(); h.render();
  assert.equal(h.calls.filter(c => c.method === "post").length, 1); assert.equal(h.pointCount, 3);
  assert.match(h.text, /一次读取未变化也不能证明/);
  h.button("放弃本次重发并清除草稿").props.onClick(); h.render(); assert.equal(h.pointCount, 0); h.unmount();
});

test("GET duplicate guard and failed check retain unknown status and all vertices", async () => {
  const h = harness(), gate = h.hold("post"); sketch(h); h.button("完成选区").props.onClick(); h.render();
  gate.reject(new Error("synthetic timeout")); await h.flush(); const get = h.hold("get"), click = h.button("核对最新记录").props.onClick;
  click(); click(); h.render(); assert.equal(h.calls.filter(c => c.method === "get").length, 1);
  get.reject(new Error("synthetic query offline")); await h.flush();
  assert.equal(h.pointCount, 3); assert.equal(h.button("我已核对写入，结束本次草稿"), undefined); assert.match(h.text, /未完成核对/);
  assert.equal(h.button("核对最新记录").props.disabled, false); h.unmount();
});

test("malformed or wrong extract POST response cannot clear or publish the draft", async () => {
  for (const response of [record("wrong-record"), { extract_id: "synthetic-A", data: {} }]) {
    const h = harness(), gate = h.hold("post"); sketch(h); h.button("完成选区").props.onClick(); h.render(); gate.resolve(response); await h.flush();
    assert.equal(h.pointCount, 3); assert.equal(h.returned.length, 0); assert.ok(h.button("核对最新记录")); h.unmount();
  }
});

test("unmounted POST completion cannot change a new record sketch or notify its parent", async () => {
  for (const fail of [false, true]) {
    const old = harness(), gate = old.hold("post"); sketch(old); old.button("完成选区").props.onClick(); old.render(); old.unmount();
    const next = harness(record("synthetic-B")); sketch(next, 5); next.name("new record draft");
    if (fail) gate.reject(new Error("synthetic late failure")); else gate.resolve(createdRecord()); await old.flush();
    assert.equal(old.lateWrites, 0); assert.equal(old.returned.length, 0);
    assert.equal(next.pointCount, 5); assert.equal(next.nameInput().props.value, "new record draft"); next.unmount();
  }
});

test("same component record switch and out of order results cannot clear the new draft", async () => {
  const h = harness(), old = h.hold("post"); sketch(h); h.button("完成选区").props.onClick(); h.render();
  h.props.record = record("synthetic-B"); h.render(); sketch(h); h.name("B submitted"); const newer = h.hold("post");
  h.button("完成选区").props.onClick(); h.render(); newer.resolve(createdRecord("B submitted", "synthetic-B")); await h.flush();
  sketch(h, 5); h.name("B later draft"); old.resolve(createdRecord()); await h.flush();
  assert.equal(h.pointCount, 5); assert.equal(h.nameInput().props.value, "B later draft");
  assert.equal(h.returned.length, 1); assert.equal(h.returned[0].extract_id, "synthetic-B"); h.unmount();
});

test("late GET after unmount cannot clear or update a newer view", async () => {
  const h = harness(), post = h.hold("post"); sketch(h); h.button("完成选区").props.onClick(); h.render(); post.reject(new Error("synthetic timeout")); await h.flush();
  const get = h.hold("get"); h.button("核对最新记录").props.onClick(); h.render(); h.unmount();
  get.resolve(createdRecord()); await h.flush(); assert.equal(h.lateWrites, 0); assert.equal(h.returned.length, 0);
});

test("dirty polygon and pending submission warn before unload and explicit cancel clears it", async () => {
  const h = harness(); assert.equal(h.beforeUnload(), false); sketch(h); assert.equal(h.beforeUnload(), true);
  const gate = h.hold("post"); h.button("完成选区").props.onClick(); h.render(); assert.equal(h.beforeUnload(), true);
  gate.reject(await httpError(400)); await h.flush(); assert.equal(h.beforeUnload(), true);
  h.button("取消").props.onClick(); h.render(); assert.equal(h.beforeUnload(), false); h.unmount();
});

test("ordinary rename and undo retain their existing payload and success behavior", async () => {
  const h = harness(), rename = h.hold("post"); h.name("renamed"); h.button("保存功能").props.onClick(); h.render();
  assert.equal(h.calls[0].body.action, "rename"); assert.equal(h.calls[0].body.room_id, "f1_r1");
  const result = record(); result.data.spaces.floors[0].rooms[0].proposal = "renamed"; rename.resolve(result); await h.flush();
  const undo = h.hold("post"); h.button("撤销上一步").props.onClick(); h.render(); assert.equal(h.calls[1].body.action, "undo"); assert.equal(h.calls[1].body.room_id, "");
  undo.resolve(record()); await h.flush(); assert.equal(h.returned.length, 2); assert.equal(h.nameInput().props.value, "办公"); h.unmount();
});

test("add and erase submit the correct room and erase flag without pre-clearing points", async () => {
  for (const erase of [false, true]) {
    const h = harness(), gate = h.hold("post"); h.button(erase ? "缩小范围" : "扩大范围").props.onClick(); h.render();
    for (const p of [[.1, .1], [.8, .1], [.8, .8]]) h.point(...p); h.key("Enter");
    assert.equal(h.calls[0].body.action, "paint"); assert.equal(h.calls[0].body.room_id, "f1_r1");
    assert.ok(h.calls[0].body.strokes.every(p => p.erase === erase)); assert.equal(h.pointCount, 3);
    gate.resolve(record()); await h.flush(); assert.equal(h.pointCount, 0); h.unmount();
  }
});

test("actual Page history stays locked while edit is pending or uncertain", async () => {
  const h = harness(record(), "page"); await h.flush();
  const child = () => h.nodes().find(n => n.type?.name === "CadExtractResult"); child().props.onEditBusy(true); h.render();
  const other = h.nodes().find(n => n.type === "button" && n.props.className === "cad-history-item");
  assert.equal(other.props.disabled, true); other.props.onClick(); h.render();
  assert.equal(child().props.record.extract_id, "synthetic-A"); assert.match(h.text, /等待房间编辑完成/);
  child().props.onEditBusy(false); h.render(); h.nodes().find(n => n.type === "button" && n.props.className === "cad-history-item").props.onClick(); h.render();
  assert.equal(child().props.record.extract_id, "synthetic-B"); h.unmount();
});

test("actual Page new extract completion preserves the edit context until reconciliation", async () => {
  const h = harness(record(), "page"); await h.flush(); const child = () => h.nodes().find(n => n.type?.name === "CadExtractResult");
  child().props.onEditBusy(true); h.render(); h.nodes().find(n => n.type === "input" && n.props.type === "file").props.onChange({ target: { files: [{ name: "synthetic.dxf", size: 1 }] } }); h.render();
  const gate = h.hold("create"); h.nodes().find(n => n.type === "form").props.onSubmit({ preventDefault() {} }); await h.flush(); gate.resolve(record("synthetic-C")); await h.flush();
  assert.equal(child().props.record.extract_id, "synthetic-A"); assert.match(h.text, /当前房间编辑仍需等待或核对/); h.unmount();
});

test("real buildError keeps Error messages while adding numeric HTTP status in every branch", async () => {
  const detail = await httpError(409); assert.ok(detail instanceof Error); assert.equal(detail.status, 409); assert.match(detail.message, /请求失败（409）：synthetic ordinary rejection/);
  for (const status of [413, 500, 404]) {
    const error = await buildError(new Response("synthetic text", { status })); assert.equal(error.status, status); assert.ok(error instanceof Error);
    assert.match(error.message, status === 413 ? /上传图片过大/ : new RegExp(`请求失败（${status}）`));
  }
  const invalid = await buildError(new Response("{", { status: 422, headers: { "content-type": "application/json" } }));
  assert.equal(invalid.status, 422); assert.match(invalid.message, /请求失败（422）/);
});

test("human acknowledgement after an unknown undo adopts the checked current room name", async () => {
  const initial = record(); initial.data.spaces.floors[0].rooms[0].proposal = "before undo";
  const h = harness(initial), post = h.hold("post"); h.button("撤销上一步").props.onClick(); h.render();
  post.reject(new Error("synthetic undo response lost")); await h.flush();
  const get = h.hold("get"); h.button("核对最新记录").props.onClick(); h.render(); get.resolve(record()); await h.flush();
  h.button("我已核对写入，结束本次草稿").props.onClick(); h.render();
  assert.equal(h.nameInput().props.value, "办公"); assert.equal(h.calls.filter(c => c.method === "post").length, 1); h.unmount();
});

test("a failed repeat GET removes previous acknowledgement controls until checked again", async () => {
  const h = harness(), post = h.hold("post"); sketch(h); h.button("完成选区").props.onClick(); h.render();
  post.reject(new Error("synthetic timeout")); await h.flush();
  const first = h.hold("get"); h.button("核对最新记录").props.onClick(); h.render(); first.resolve(record()); await h.flush();
  assert.ok(h.button("我已核对写入，结束本次草稿"));
  const second = h.hold("get"); h.button("核对最新记录").props.onClick(); h.render(); second.reject(new Error("synthetic read failure")); await h.flush();
  assert.equal(h.button("我已核对写入，结束本次草稿"), undefined); assert.equal(h.pointCount, 3);
  assert.equal(h.calls.filter(c => c.method === "post").length, 1); h.unmount();
});

test("offline reconciliation can be explicitly abandoned without claiming success or replaying", async () => {
  const h = harness(), post = h.hold("post"); sketch(h); h.button("完成选区").props.onClick(); h.render();
  post.reject(new Error("synthetic timeout")); await h.flush();
  const get = h.hold("get"); h.button("核对最新记录").props.onClick(); h.render(); get.reject(new Error("synthetic query offline")); await h.flush();
  assert.equal(h.button("我已核对写入，结束本次草稿"), undefined); assert.match(h.text, /不代表撤回或确认成功/);
  h.button("放弃本次重发并清除草稿").props.onClick(); h.render();
  assert.equal(h.pointCount, 0); assert.equal(h.button("核对最新记录"), undefined);
  assert.equal(h.button("新建分区").props.disabled, false); assert.equal(h.returned.length, 0);
  assert.equal(h.calls.filter(c => c.method === "post").length, 1); h.unmount();
});
