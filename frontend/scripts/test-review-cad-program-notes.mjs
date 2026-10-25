import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const clone = value => JSON.parse(JSON.stringify(value));
function compile(source, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText,
  { exports, Error, require(name) { if (Object.hasOwn(imports, name)) return imports[name]; throw Error(`Unexpected import ${name}`); } });
  return exports;
}
const program = compile(read("features/studio/cadProgram.ts"));
const page = ts.createSourceFile("CadExtractPage.tsx", read("pages/studio/CadExtractPage.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(["CadProgramPanel", "gapsForFloor", "hasProgramNotes", "writableItems", "normalizeNotes", "notesVersion"]);
const selected = page.statements.filter(n => ts.isFunctionDeclaration(n) && names.has(n.name?.text)).map(n => n.getText(page)).join("\n");
const componentSource = 'import {useState,useEffect,useMemo,useRef} from "react";\nimport {api} from "api";\nimport {buildCadProgram} from "program";\n' + selected + "\nexport {CadProgramPanel};";
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const record = (notes = { r1: "old room", general: "old general" }, id = "synthetic-A") => ({ extract_id: id, data: { spaces: {
  program_review: { notes: clone(notes) }, floors: [{ floor_index: 1, label: "floor 1", rooms: [{ room_id: "r1", marker: "1", area_ratio: 1, area_m2: 30, proposal: "办公" }] }],
} } });
function text(n) {
  if (n == null || typeof n === "boolean") return "";
  if (Array.isArray(n)) return n.map(text).join("");
  return typeof n === "object" ? text(n.props?.children) : String(n);
}
function harness(initial = record()) {
  let cursor = 0, changed = false, mounted = true, tree, lateWrites = 0;
  const slots = [], effects = [], updates = [], calls = [], returned = [], gates = { save: [], rearrange: [], apply: [] };
  const props = { record: initial, activeFloorIndex: 1, onFocus() {}, onUpdated(result) { returned.push(result); props.record = result; } };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], next => { if (mounted) { updates.push({ i, next }); changed = true; } else lateWrites++; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(create, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) slots[i] = { deps, value: create() }; return slots[i].value; },
    useEffect(create, deps) { const i = cursor++, old = slots[i]; if (!deps || !old || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
      const next = { deps }; slots[i] = next; effects.push(() => { old?.cleanup?.(); next.cleanup = create(); }); } },
  };
  function invoke(method, id, body) { calls.push({ method, id, body: clone(body ?? {}) }); const gate = gates[method].shift();
    if (!gate) throw Error(`Missing offline gate ${method}`); return gate.promise; }
  const api = { saveCadProgramReview: (id, body) => invoke("save", id, body), rearrangeCadProgram: id => invoke("rearrange", id), applyCadProgram: (id, body) => invoke("apply", id, body) };
  const jsx = (type, props) => ({ type, props });
  const { CadProgramPanel } = compile(componentSource, { react: hooks, api: { api }, program,
    "react/jsx-runtime": { jsx, jsxs: jsx } });
  function render() { if (!mounted) return;
    for (let pass = 0; pass < 30; pass++) {
      for (const { i, next } of updates.splice(0)) slots[i] = typeof next === "function" ? next(slots[i]) : next;
      cursor = 0; changed = false; tree = CadProgramPanel(props); effects.splice(0).forEach(fn => fn());
      if (!changed) return;
    } throw Error("Component did not settle");
  }
  function nodes(n) { if (!arguments.length) n = tree; if (Array.isArray(n)) return n.flatMap(n => nodes(n));
    if (!n || typeof n !== "object") return []; return [n, ...nodes(n.props?.children)]; }
  const textarea = kind => nodes().filter(n => n.type === "textarea")[kind === "room" ? 0 : 1];
  render();
  return { props, calls, returned, render, textarea, get text() { return text(tree); }, get lateWrites() { return lateWrites; },
    button(label) { return nodes().find(n => n.type === "button" && text(n) === label); },
    edit(kind, value) { textarea(kind).props.onChange({ target: { value } }); render(); },
    hold(method) { const gate = deferred(); gates[method].push(gate); return gate; },
    async flush() { await new Promise(resolve => setImmediate(resolve)); render(); },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); } };
}

for (const kind of ["room", "general"]) {
  test(`${kind} input typed during save survives response and remains unsaved`, async () => {
    const h = harness(), gate = h.hold("save"); h.edit(kind, "before request");
    h.button("保存审查意见").props.onClick(); h.render(); h.edit(kind, "typed during request");
    gate.resolve(record(h.calls[0].body.notes)); await h.flush();
    assert.equal(h.textarea(kind).props.value, "typed during request");
    assert.equal(h.button("保存审查意见").props.disabled, false);
    assert.match(h.text, /未保存|先保存/); h.unmount();
  });
}

test("save without later edits confirms exactly the submitted version", async () => {
  const h = harness(), gate = h.hold("save"); h.edit("room", "saved room");
  h.button("保存审查意见").props.onClick(); h.render();
  gate.resolve(record(h.calls[0].body.notes)); await h.flush();
  assert.equal(h.button("保存审查意见").props.disabled, true);
  assert.match(h.text, /审查意见已留在这张图上/); assert.equal(h.returned.length, 1); h.unmount();
});

test("save failure preserves all input and manual retry sends the current snapshot", async () => {
  const h = harness(), first = h.hold("save"); h.edit("general", "first draft");
  h.button("保存审查意见").props.onClick(); h.render(); h.edit("room", "later room");
  first.reject(new Error("synthetic refusal")); await h.flush();
  assert.match(h.text, /synthetic refusal/); assert.equal(h.textarea("general").props.value, "first draft");
  assert.equal(h.textarea("room").props.value, "later room"); assert.equal(h.calls.length, 1);
  const retry = h.hold("save"); h.button("保存审查意见").props.onClick(); h.render();
  assert.equal(h.calls[1].body.notes.r1, "later room");
  retry.resolve(record(h.calls[1].body.notes)); await h.flush();
  assert.equal(h.button("保存审查意见").props.disabled, true); h.unmount();
});

test("same tick repeated save invokes only one request while inputs remain editable", async () => {
  const h = harness(), gate = h.hold("save"); h.edit("room", "submitted");
  const click = h.button("保存审查意见").props.onClick; click(); click(); h.render();
  assert.equal(h.calls.length, 1); assert.notEqual(h.textarea("room").props.disabled, true);
  gate.resolve(record(h.calls[0].body.notes)); await h.flush(); h.unmount();
});

test("same content reordered notes and unrelated record responses do not reset drafts", () => {
  const h = harness(); h.edit("room", "local");
  h.props.record = record({ general: "old general", r1: "old room" }); h.render();
  assert.equal(h.textarea("room").props.value, "local");
  assert.equal(h.button("保存审查意见").props.disabled, false); assert.doesNotMatch(h.text, /确认替换/); h.unmount();
});

test("clean notes follow external update and dirty notes are kept behind explicit conflict", () => {
  const h = harness(); h.props.record = record({ r1: "external", general: "new general" }); h.render();
  assert.equal(h.textarea("room").props.value, "external");
  h.edit("room", "local"); h.props.record = record({ r1: "external again", general: "new general" }); h.render();
  assert.equal(h.textarea("room").props.value, "local"); assert.match(h.text, /本地内容仍在/);
  assert.equal(h.button("保存审查意见").props.disabled, true); h.unmount();
});

test("explicit adoption replaces local input only when the user chooses", () => {
  const h = harness(); h.edit("room", "local"); h.props.record = record({ r1: "external" }); h.render();
  h.button("采用图上意见，放弃本地修改").props.onClick(); h.render();
  assert.equal(h.textarea("room").props.value, "external"); assert.equal(h.button("保存审查意见").props.disabled, true); h.unmount();
});

test("explicit keep choice permits a later manual save without automatically submitting", async () => {
  const h = harness(); h.edit("general", "local general"); h.props.record = record({ r1: "external" }); h.render();
  h.button("保留本地意见，确认替换后再保存").props.onClick(); h.render();
  assert.equal(h.calls.length, 0); assert.equal(h.button("保存审查意见").props.disabled, false);
  const gate = h.hold("save"); h.button("保存审查意见").props.onClick(); h.render();
  assert.equal(h.calls[0].body.notes.general, "local general"); gate.resolve(record(h.calls[0].body.notes)); await h.flush(); h.unmount();
});

test("old record save response arriving after a newer record save cannot replace it", async () => {
  const h = harness(), old = h.hold("save"); h.edit("room", "A draft"); h.button("保存审查意见").props.onClick(); h.render();
  h.props.record = record({ r1: "B original" }, "synthetic-B"); h.render();
  h.edit("room", "B draft"); const next = h.hold("save"); h.button("保存审查意见").props.onClick(); h.render();
  next.resolve(record(h.calls[1].body.notes, "synthetic-B")); await h.flush();
  old.resolve(record(h.calls[0].body.notes)); await h.flush();
  assert.equal(h.textarea("room").props.value, "B draft"); assert.equal(h.returned.length, 1);
  assert.equal(h.returned[0].extract_id, "synthetic-B"); assert.equal(h.calls.length, 2); h.unmount();
});

test("unmounted save success or failure cannot update state or invoke parent", async () => {
  for (const failure of [false, true]) {
    const h = harness(), gate = h.hold("save"); h.edit("room", "submitted"); h.button("保存审查意见").props.onClick(); h.render(); h.unmount();
    if (failure) gate.reject(new Error("synthetic late failure")); else gate.resolve(record(h.calls[0].body.notes));
    await h.flush(); assert.equal(h.returned.length, 0); assert.equal(h.lateWrites, 0);
  }
});

const suggestion = { model_name: "synthetic-offline", items: [{ floor_index: 1, floor_label: "floor 1", room_id: "r1", marker: "1",
  current_name: "办公", current_activity: "静", proposal: "会议", activity: "静", reason: "synthetic" }] };
async function propose(h) {
  const gate = h.hold("rearrange"); h.button("按意见重排").props.onClick(); h.render(); gate.resolve(clone(suggestion)); await h.flush();
}

test("normal suggestion and applying room names preserve notes typed during apply", async () => {
  const h = harness(); await propose(h); const gate = h.hold("apply");
  h.button("确认写入").props.onClick(); h.render(); h.edit("general", "typed during apply");
  const updated = record(); updated.data.spaces.floors[0].rooms[0].proposal = "会议";
  gate.resolve(updated); await h.flush();
  assert.equal(h.textarea("general").props.value, "typed during apply"); assert.equal(h.button("保存审查意见").props.disabled, false);
  assert.equal(h.returned.length, 1); h.unmount();
});

test("normal suggestion can be declined without changing saved notes", async () => {
  const h = harness(); await propose(h); h.button("放弃").props.onClick(); h.render();
  assert.equal(h.button("确认写入"), undefined); assert.equal(h.returned.length, 0);
  assert.equal(h.textarea("room").props.value, "old room"); h.unmount();
});

test("suggestion for older saved notes is ignored after external notes change", async () => {
  const h = harness(), gate = h.hold("rearrange"); h.button("按意见重排").props.onClick(); h.render();
  h.props.record = record({ r1: "external" }); h.render(); gate.resolve(clone(suggestion)); await h.flush();
  assert.equal(h.button("确认写入"), undefined); assert.match(h.text, /按最新意见重新生成/); h.unmount();
});

test("external changes during save preserve local text without publishing stale record response", async () => {
  const h = harness(), gate = h.hold("save"); h.edit("room", "submitted"); h.button("保存审查意见").props.onClick(); h.render();
  h.props.record = record({ r1: "external newer" }); h.render(); gate.resolve(record(h.calls[0].body.notes)); await h.flush();
  assert.equal(h.textarea("room").props.value, "submitted"); assert.equal(h.returned.length, 0);
  assert.equal(h.props.record.data.spaces.program_review.notes.r1, "external newer"); assert.match(h.text, /保存期间/); h.unmount();
});

test("wrong record response is not treated as saved and preserves the draft", async () => {
  const h = harness(), gate = h.hold("save"); h.edit("room", "submitted"); h.button("保存审查意见").props.onClick(); h.render();
  gate.resolve(record({}, "wrong-record")); await h.flush();
  assert.equal(h.textarea("room").props.value, "submitted"); assert.equal(h.returned.length, 0);
  assert.match(h.text, /保存响应不属于当前图纸/); h.unmount();
});

test("empty normalized notes save successfully and whitespace edits remain semantically clean", async () => {
  const h = harness(), gate = h.hold("save"); h.edit("room", "  "); h.edit("general", "");
  h.button("保存审查意见").props.onClick(); h.render(); assert.deepEqual(h.calls[0].body.notes, {});
  gate.resolve(record({})); await h.flush(); assert.equal(h.button("保存审查意见").props.disabled, true); h.unmount();
});

test("previous acknowledgement cannot suppress a future external notes conflict", async () => {
  const h = harness(), gate = h.hold("save"); h.edit("room", "saved once"); h.button("保存审查意见").props.onClick(); h.render();
  gate.resolve(record(h.calls[0].body.notes)); await h.flush();
  h.props.record = record({ r1: "intervening" }); h.render(); h.edit("room", "local later");
  h.props.record = record(h.calls[0].body.notes); h.render();
  assert.equal(h.textarea("room").props.value, "local later"); assert.equal(h.button("保存审查意见").props.disabled, true);
  assert.ok(h.button("保留本地意见，确认替换后再保存")); h.unmount();
});

test("server returning fewer notes keeps unacknowledged input visibly unsaved", async () => {
  const h = harness(), gate = h.hold("save"); h.edit("room", "requested room"); h.edit("general", "requested general");
  h.button("保存审查意见").props.onClick(); h.render(); gate.resolve(record({ r1: "requested room" })); await h.flush();
  assert.equal(h.textarea("general").props.value, "requested general");
  assert.equal(h.button("保存审查意见").props.disabled, false); assert.match(h.text, /本地还有未保存/); h.unmount();
});

test("typing back to the submitted normalized content does not falsely report unsaved text", async () => {
  const h = harness(), gate = h.hold("save"); h.edit("room", "submitted"); h.button("保存审查意见").props.onClick(); h.render();
  h.edit("room", "intermediate"); h.edit("room", " submitted ");
  gate.resolve(record(h.calls[0].body.notes)); await h.flush();
  assert.equal(h.textarea("room").props.value, " submitted ");
  assert.equal(h.button("保存审查意见").props.disabled, true); assert.doesNotMatch(h.text, /本地还有未保存/); h.unmount();
});

test("apply response cannot replace known newer external notes or clear local input", async () => {
  const h = harness(); await propose(h); const gate = h.hold("apply");
  h.button("确认写入").props.onClick(); h.render(); h.edit("room", "local during apply");
  h.props.record = record({ r1: "external latest" }); h.render(); gate.resolve(record()); await h.flush();
  assert.equal(h.textarea("room").props.value, "local during apply");
  assert.equal(h.returned.length, 0); assert.equal(h.props.record.data.spaces.program_review.notes.r1, "external latest"); h.unmount();
});

test("same tick duplicate suggestion calls share the immediate request guard", async () => {
  const h = harness(), gate = h.hold("rearrange"); const click = h.button("按意见重排").props.onClick;
  click(); click(); h.render(); assert.equal(h.calls.length, 1);
  gate.resolve(clone(suggestion)); await h.flush(); assert.ok(h.button("确认写入")); h.unmount();
});
