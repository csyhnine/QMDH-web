import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/admin/DashboardPage.tsx", import.meta.url), "utf8");
const names = ["formatCurrencyAmount", "formatCostRows", "formatAccountQuota"];
const parsed = ts.createSourceFile("DashboardPage.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const present = new Set(parsed.statements.filter(ts.isFunctionDeclaration).map((node) => node.name?.text));
const exports = {};
const jsx = (type, props) => ({ type, props });
const react = { useEffect() {}, useState(initial) { return [typeof initial === "function" ? initial() : initial, () => {}]; } };
const output = ts.transpileModule(`${source}\nexport { ${names.filter((name) => present.has(name)).join(", ")} };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
vm.runInNewContext(output, { exports, Intl, Date, require(name) {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
  if (name === "../../api") return { api: new Proxy({}, { get() { throw new Error("R18 fixture must not call APIs"); } }) };
  throw new Error(`Unexpected import ${name}`);
} });

function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (typeof node === "object") return text(node.props?.children);
  return String(node);
}
function account(overrides = {}) {
  return { name: "fixture-user", display_name: "Fixture", group_name: "", role: "designer", is_active: true,
    quota_limit: 500, quota_used: 100, quota_currency: "CNY", quota_remaining: 400, quota_status: "ok",
    quota_comparable: true, quota_cost_by_currency: [{ currency: "CNY", total_cost: 100 }], quota_month: "2026-10",
    billing_plan: "standard", billing_status: "active", cost_by_currency: [{ currency: "CNY", total_cost: 10 }],
    image_output_count: 1, image_generate_count: 1, image_edit_count: 0, video_generate_count: 0, chat_turn_count: 0,
    chat_total_tokens: 0, last_activity_at: null, ...overrides };
}
function render(row) {
  const range = { startDate: "2026-10-23", endDate: "2026-10-23" };
  const dashboard = { daily_series: [], model_rankings: [], execution_rankings: [], account_usage: [row], failure_reasons: [],
    cost_by_currency: [], cost_notes: [], cost_formula: "fixture cost formula", total_tasks: 1, successful_tasks: 1, failed_tasks: 0, success_rate: 100,
    today_image_generate_count: 1, week_image_generate_count: 1, today_image_output_count: 1, week_image_output_count: 1,
    today_video_generate_count: 0, week_video_generate_count: 0, window_chat_turn_count: 0, window_chat_total_tokens: 0 };
  return text(exports.default({ dashboard, groupSummaries: [], userCanUseOpsViews: true, dashboardStatsDays: 1,
    dashboardDateRange: range, groupSummaryRange: range, groupRangeFollowsDashboard: true, lastSyncedAt: null,
    onChangeDays() {}, onApplyGroupSummaryRange() {}, onSyncGroupSummaryRange() {}, onRefresh() {} }));
}

test("currency formatter retains explicit CNY USD EUR and GBP units", () => {
  for (const currency of ["CNY", "USD", "EUR", "GBP"]) {
    const actual = exports.formatCurrencyAmount(10, currency);
    assert.match(actual, new RegExp(currency));
    assert.match(actual, /10\.00/);
    if (currency !== "USD") assert.doesNotMatch(actual, /\$/);
  }
});
test("mixed window costs stay separate instead of a converted scalar", () => {
  const actual = exports.formatCostRows([{ currency: "CNY", total_cost: 100 }, { currency: "USD", total_cost: 10 }]);
  assert.match(actual, /100\.00 CNY/);
  assert.match(actual, /10\.00 USD/);
  assert.doesNotMatch(actual, /110\.00/);
});
test("actual account row shows incomparable monthly currency details without false zero or balance", () => {
  const actual = render(account({ quota_comparable: false, quota_used: null, quota_remaining: null, quota_status: "incomparable",
    quota_cost_by_currency: [{ currency: "CNY", total_cost: 100 }, { currency: "USD", total_cost: 10 }] }));
  assert.match(actual, /无法按单币比较/);
  assert.match(actual, /100\.00 CNY/);
  assert.match(actual, /10\.00 USD/);
  assert.doesNotMatch(actual, /已用 0|剩余|110\.00/);
});
test("actual account row labels monthly CNY quota independently of window spend", () => {
  const actual = render(account({ quota_used: 700, quota_limit: 1000, quota_remaining: 300 }));
  assert.match(actual, /10\.00 CNY/);
  assert.match(actual, /本月已用 700\.00 CNY/);
  assert.match(actual, /1000\.00 CNY/);
  assert.match(actual, /剩余 300\.00 CNY/);
});
test("actual account row preserves a real zero CNY quota without truthy fallback", () => {
  const actual = render(account({ quota_used: 0, quota_limit: 0, quota_remaining: 0, quota_cost_by_currency: [] }));
  assert.match(actual, /本月已用 0\.00 CNY/);
  assert.match(actual, /额度 0\.00 CNY/);
  assert.match(actual, /剩余 0\.00 CNY/);
});
test("unlimited foreign account retains monthly spend without inventing a quota balance", () => {
  const actual = render(account({ quota_limit: null, quota_used: null, quota_remaining: null, quota_comparable: false,
    quota_status: "unlimited", quota_cost_by_currency: [{ currency: "USD", total_cost: 10 }] }));
  assert.match(actual, /无限制/);
  assert.match(actual, /本月.*10\.00 USD/);
  assert.doesNotMatch(actual, /剩余|已用 0/);
});
test("missing comparability metadata does not reinterpret a legacy mixed scalar", () => {
  const actual = render(account({ quota_comparable: undefined, quota_used: 110, quota_remaining: 390 }));
  assert.match(actual, /口径待同步/);
  assert.doesNotMatch(actual, /已用 110|剩余 390/);
});
test("empty filtered window still shows actual monthly quota spend", () => {
  const actual = render(account({ cost_by_currency: [], quota_used: 100, quota_remaining: 400 }));
  assert.match(actual, /未计费/);
  assert.match(actual, /本月已用 100\.00 CNY/);
  assert.match(actual, /剩余 400\.00 CNY/);
});
