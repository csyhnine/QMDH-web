import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function renderEvent(status, text) {
  const event = { id: 1, run_id: 1, summary: text, source: "human", platform: "codex", event_type: "user_correction", skill_name: "research", skill_version: "1.0", correlation_id: "task", occurred_at: "2026-10-10", evidence: [{ quote: text }], evaluation: { reason: text }, review_status: status, review_note: text, credential_id: 1 };
  const states = [[], null, null, [event], undefined, "", false, false, false, undefined, "pending", {}, 0];
  let index = 0;
  const source = readFileSync(new URL("../src/pages/admin/SkillFeedbackPanel.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name === "react") return { useEffect() {}, useRef: () => ({ current: 0 }), useState(initial) { const value = states[index++]; return [value === undefined ? initial : value, () => {}]; } };
      if (name === "../../api") return { api: {} };
      if (name === "./FeedbackCredentials") return { default: () => null };
      return require(name);
    },
  });
  return renderToStaticMarkup(exports.default({ onUpdated() {} }));
}

test("feedback and evidence render as inert escaped text", () => {
  const html = renderEvent("pending", '<script>alert(1)</script><img src="https://attacker.example" onerror="run()">');
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<a href="));
  assert.ok(html.includes("声明为人工反馈"));
});

test("only pending evidence exposes review actions and empty notes disable them", () => {
  const pending = renderEvent("pending", "待核实证据");
  assert.match(pending, /<button disabled="">确认并纳入改进<\/button>/);
  assert.match(pending, /<button disabled="">驳回并保留记录<\/button>/);
  assert.ok(!renderEvent("rejected", "驳回").includes("确认并纳入改进"));
  assert.ok(!renderEvent("not_required", "正常事件").includes("确认并纳入改进"));
});
