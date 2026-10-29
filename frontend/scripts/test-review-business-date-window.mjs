import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const helperPath = new URL("../src/lib/businessDateWindow.ts", import.meta.url);
function output(code) {
  return ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
}
function compile(code, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(output(code), { exports, ...globals, require(name) {
    if (Object.hasOwn(imports, name)) return imports[name];
    throw new Error(`Unstubbed import: ${name}`);
  } });
  return exports;
}
function declaration(file, name) {
  const parsed = ts.createSourceFile(file, src(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  return found?.getText(parsed) ?? "";
}

// Execute the actual route, not a copy of its state/handler/API logic. Only this
// route and its local date builder are extracted, avoiding all other routers.
function harness(now = "2026-10-20T19:30:00Z") {
  const clock = { now, reads: 0 };
  class ClockDate extends Date {
    constructor(...args) {
      if (!args.length) { super(clock.now); clock.reads += 1; }
      else super(...args);
    }
    static now() { return new Date(clock.now).getTime(); }
  }
  const globals = { Date: ClockDate };
  const shared = existsSync(helperPath) ? compile(readFileSync(helperPath, "utf8"), {}, globals) : {};
  const calls = { dashboard: [], query: [], csv: [] };
  const emptyDashboard = {
    daily_series: [], model_rankings: [], execution_rankings: [], account_usage: [],
    failure_reasons: [], cost_by_currency: [], cost_notes: [], success_rate: 0,
    successful_tasks: 0, failed_tasks: 0,
  };
  const api = {
    async dashboardStats(days) { calls.dashboard.push(days); return emptyDashboard; },
    async userGroupSummaries(start, end) { calls.query.push([start, end]); return []; },
    async exportUserGroupSummariesCsv(start, end) { calls.csv.push([start, end]); },
  };
  const jsx = (type, props) => ({ type, props });
  const runtime = { jsx, jsxs: jsx };
  function component(load) {
    const slots = [], pending = [];
    let cursor = 0, dirty = false, tree;
    const react = {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
        return [slots[index], (next) => {
          const value = typeof next === "function" ? next(slots[index]) : next;
          if (!Object.is(slots[index], value)) { slots[index] = value; dirty = true; }
        }];
      },
      useEffect(create, deps) {
        const index = cursor++, previous = slots[index];
        if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
          slots[index] = { deps };
          pending.push(() => { previous?.cleanup?.(); slots[index].cleanup = create(); });
        }
      },
    };
    const render = load(react);
    function commit(props) {
      for (let pass = 0; pass < 20; pass += 1) {
        cursor = 0; dirty = false; tree = render(props);
        for (const effect of pending.splice(0)) effect();
        if (!dirty) return tree;
      }
      throw new Error("Component did not settle");
    }
    return { commit };
  }
  const route = component((react) => {
    const builder = declaration("router.tsx", "buildDashboardDateWindow");
    const code = `${builder || "const buildDashboardDateWindow = buildBusinessDateWindow;"}\n${declaration("router.tsx", "DashboardRoute")}\nexport { DashboardRoute };`;
    return compile(code, { "react/jsx-runtime": runtime }, {
      ...globals, ...react, api, buildBusinessDateWindow: shared.buildBusinessDateWindow,
      AppShell: "AppShell", DashboardPage: "DashboardPage",
    }).DashboardRoute;
  });
  const page = component((react) => compile(src("pages/admin/DashboardPage.tsx"), {
    react, "react/jsx-runtime": runtime, "../../api": { api },
  }, globals).default);
  let props;
  const sync = async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    const tree = route.commit();
    assert.equal(tree.props.children.type, "DashboardPage");
    props = tree.props.children.props;
    return props;
  };
  return {
    clock, calls, sync,
    get props() { return props; },
    renderPage() { return page.commit(props); },
    async start() { await sync(); await sync(); },
  };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (tree && typeof tree === "object") return [tree, ...nodes(tree.props?.children)];
  return [];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree && typeof tree === "object") return text(tree.props?.children);
  return tree == null || typeof tree === "boolean" ? "" : String(tree);
}
function button(tree, label) {
  const found = nodes(tree).filter((node) => node.type === "button" && text(node) === label);
  assert.equal(found.length, 1, label);
  return found[0];
}
async function assertConsumers(h, expected, follows = true) {
  const tree = h.renderPage();
  assert.deepEqual(h.calls.query.at(-1), [expected.startDate, expected.endDate]);
  assert.ok(text(tree).includes(`结算窗口：${expected.startDate} 至 ${expected.endDate}（${follows ? `跟随看板 ${h.props.dashboardStatsDays} 天` : "自定义"}）`));
  await button(tree, "导出 CSV").props.onClick();
  assert.deepEqual(h.calls.csv.at(-1), [expected.startDate, expected.endDate]);
  return tree;
}
function businessWindow(days, iso) {
  // Before the helper exists, run the actual old route builder for the same
  // counterexamples. The finished implementation must provide the shared helper.
  const shared = existsSync(helperPath) ? compile(readFileSync(helperPath, "utf8")) : null;
  if (shared) return plain(shared.buildBusinessDateWindow(days, new Date(iso)));
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [iso])); } }
  return plain(compile(`${declaration("router.tsx", "buildDashboardDateWindow")}\nexport { buildDashboardDateWindow };`, {}, { Date: FixedDate }).buildDashboardDateWindow(days));
}

test("Shanghai early morning 7-day query, labels and CSV include today", async () => {
  const h = harness(); await h.start();
  const expected = { startDate: "2026-10-15", endDate: "2026-10-21" };
  const tree = await assertConsumers(h, expected);
  assert.ok(text(tree).includes("统计窗口：2026-10-15 至 2026-10-21"));
  const record = "2026-10-21";
  assert.ok(expected.startDate <= record && record <= expected.endDate);
});

test("00:00, 03:30, 07:59, 08:00 and 13:30 use Shanghai calendar days", () => {
  for (const iso of ["2026-10-20T16:00:00Z", "2026-10-20T19:30:00Z", "2026-10-20T23:59:00Z", "2026-10-21T00:00:00Z", "2026-10-21T05:30:00Z"]) {
    assert.deepEqual(businessWindow(7, iso), { startDate: "2026-10-15", endDate: "2026-10-21" }, iso);
  }
});

test("Shanghai midnight changes once, on both sides of month and year boundaries", () => {
  for (const [iso, startDate, endDate] of [
    ["2026-10-20T15:59:59.999Z", "2026-10-14", "2026-10-20"],
    ["2026-10-20T16:00:00.000Z", "2026-10-15", "2026-10-21"],
    ["2026-10-31T16:00:00Z", "2026-10-26", "2026-11-01"],
    ["2026-12-31T16:00:00Z", "2026-12-26", "2027-01-01"],
    ["2024-02-29T16:00:00Z", "2024-02-24", "2024-03-01"],
  ]) assert.deepEqual(businessWindow(7, iso), { startDate, endDate }, iso);
});

test("7/30/90 inclusive windows keep exactly the selected number of days", () => {
  for (const [days, startDate] of [[7, "2026-10-15"], [30, "2026-09-22"], [90, "2026-07-24"]]) {
    const range = businessWindow(days, "2026-10-20T19:30:00Z");
    assert.deepEqual(range, { startDate, endDate: "2026-10-21" });
    assert.equal((Date.parse(range.endDate) - Date.parse(range.startDate)) / 86400000 + 1, days);
  }
});

test("shared helper does not mutate the caller's now snapshot", () => {
  assert.ok(existsSync(helperPath), "shared business date helper exists");
  const { buildBusinessDateWindow } = compile(readFileSync(helperPath, "utf8"));
  const now = new Date("2026-10-20T19:30:00Z"), before = now.getTime();
  assert.deepEqual(plain(buildBusinessDateWindow(30, now)), { startDate: "2026-09-22", endDate: "2026-10-21" });
  assert.equal(now.getTime(), before);
});

test("process timezones UTC, Los Angeles and Tokyo cannot change the range", () => {
  for (const TZ of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
    const code = existsSync(helperPath) ? output(readFileSync(helperPath, "utf8")) : output(`${declaration("router.tsx", "buildDashboardDateWindow")}\nexport { buildDashboardDateWindow };`);
    const worker = `const vm=require('node:vm'); const exports={}; class FixedDate extends Date {constructor(...args){super(...(args.length?args:['2026-10-20T19:30:00Z']));}}; vm.runInNewContext(${JSON.stringify(code)},{exports,Date:FixedDate}); const fn=exports.buildBusinessDateWindow||exports.buildDashboardDateWindow; process.stdout.write(JSON.stringify(fn(7,new Date('2026-10-20T19:30:00Z'))));`;
    const result = spawnSync(process.execPath, ["-e", worker], { encoding: "utf8", env: { ...process.env, TZ }, timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { startDate: "2026-10-15", endDate: "2026-10-21" }, TZ);
  }
});

test("initial route snapshot survives midnight and page rerenders without rereading now", async () => {
  const h = harness("2026-10-20T15:59:59.999Z"); await h.start();
  const reads = h.clock.reads;
  h.clock.now = "2026-10-20T16:00:00Z";
  const tree = await assertConsumers(h, { startDate: "2026-10-14", endDate: "2026-10-20" });
  assert.ok(text(tree).includes("统计窗口：2026-10-14 至 2026-10-20"));
  h.renderPage(); assert.equal(h.clock.reads, reads, "page cannot create a fresh date window");
});

test("7/30/90 day changes share the same follow query, display and export window", async () => {
  const h = harness(); await h.start();
  for (const [days, startDate] of [[7, "2026-10-15"], [30, "2026-09-22"], [90, "2026-07-24"]]) {
    button(h.renderPage(), `${days} 天`).props.onClick(); await h.sync(); await h.sync();
    assert.equal(h.props.dashboardStatsDays, days);
    const tree = await assertConsumers(h, { startDate, endDate: "2026-10-21" });
    assert.ok(text(tree).includes(`统计窗口：${startDate} 至 2026-10-21`));
    assert.equal(h.calls.dashboard.at(-1), days);
  }
});

test("custom dates survive day changes and follow action resynchronizes all consumers", async () => {
  const h = harness("2026-10-21T05:30:00Z"); await h.start();
  const custom = { startDate: "2025-12-20", endDate: "2026-01-03" };
  let tree = h.renderPage();
  const inputs = nodes(tree).filter((node) => node.type === "input" && node.props.type === "date");
  assert.equal(inputs.length, 2);
  inputs[0].props.onChange({ target: { value: custom.startDate } });
  inputs[1].props.onChange({ target: { value: custom.endDate } });
  button(h.renderPage(), "查询").props.onClick(); await h.sync(); await h.sync();
  assert.equal(h.props.groupRangeFollowsDashboard, false);
  await assertConsumers(h, custom, false);
  button(h.renderPage(), "30 天").props.onClick(); await h.sync(); await h.sync();
  tree = await assertConsumers(h, custom, false);
  assert.ok(text(tree).includes("统计窗口：2026-09-22 至 2026-10-21"));
  button(tree, "跟随看板窗口").props.onClick(); await h.sync(); await h.sync();
  assert.equal(h.props.groupRangeFollowsDashboard, true);
  await assertConsumers(h, { startDate: "2026-09-22", endDate: "2026-10-21" });
});

test("13:30 normal control keeps query, display and CSV unchanged", async () => {
  const h = harness("2026-10-21T05:30:00Z"); await h.start();
  const tree = await assertConsumers(h, { startDate: "2026-10-15", endDate: "2026-10-21" });
  assert.ok(text(tree).includes("统计窗口：2026-10-15 至 2026-10-21"));
});

test("a new selection after Shanghai midnight takes one fresh shared snapshot", async () => {
  const h = harness("2026-10-20T15:59:59.999Z"); await h.start();
  h.clock.now = "2026-10-20T16:00:00Z";
  const reads = h.clock.reads;
  h.props.onChangeDays(30);
  assert.equal(h.clock.reads - reads, 1, "one default now read per date calculation");
  await h.sync(); await h.sync();
  const tree = await assertConsumers(h, { startDate: "2026-09-22", endDate: "2026-10-21" });
  assert.ok(text(tree).includes("统计窗口：2026-09-22 至 2026-10-21"));
});

test("restoring follow after midnight refreshes one snapshot without rewriting custom intent early", async () => {
  const h = harness("2026-10-20T15:59:59.999Z"); await h.start();
  const custom = { startDate: "2026-01-01", endDate: "2026-01-31" };
  h.props.onApplyGroupSummaryRange(custom); await h.sync(); await h.sync();
  h.clock.now = "2026-10-20T16:00:00Z";
  await assertConsumers(h, custom, false);
  const reads = h.clock.reads;
  button(h.renderPage(), "跟随看板窗口").props.onClick();
  assert.equal(h.clock.reads - reads, 1);
  await h.sync(); await h.sync();
  const expected = { startDate: "2026-10-15", endDate: "2026-10-21" };
  assert.deepEqual(plain(h.props.dashboardDateRange), expected);
  assert.deepEqual(plain(h.props.groupSummaryRange), expected);
  const tree = await assertConsumers(h, expected);
  assert.ok(text(tree).includes("统计窗口：2026-10-15 至 2026-10-21"));
});
