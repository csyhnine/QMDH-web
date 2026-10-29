import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
const source = readFileSync(new URL("../src/features/studio/studioResultReveals.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { studioResultRevealScope: scopeFor, observeResultTask: observe, canRevealResult: eligible, claimResultReveal: claim, clearStudioResultReveals: clear } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const user = { id: 1, name: "a", company_unit: "one", group_name: "g", role: "user", project_codes: ["b", "a"] };
test("history, repeated polls, route remount and distinct assets", () => {
 clear(); const scope = scopeFor(user, false);
 observe(scope, 1, "completed"); assert.equal(eligible(scope, 1, 1, "completed"), false);
 observe(scope, 2, "pending"); observe(scope, 2, "running"); observe(scope, 2, "completed");
 assert.equal(claim(scope, 2, 1, "completed"), true);
 observe(scope, 2, "completed"); assert.equal(claim(scopeFor({...user, project_codes: ["a", "b"]}, false), 2, 1, "completed"), false);
 assert.equal(claim(scope, 2, 2, "completed"), true);
});
test("failure, guests, scope isolation and stale async claims", () => {
 clear(); const scope = scopeFor(user, false); observe(scope, 1, "running"); observe(scope, 1, "failed");
 assert.equal(claim(scope, 1, 1, "completed"), false);
 assert.equal(scopeFor(user, true), null);
 assert.notEqual(scopeFor({...user, company_unit: "two"}, false), scope);
 observe(scope, 2, "running"); clear(); assert.equal(claim(scope, 2, 1, "completed"), false);
 assert.notEqual(scopeFor(user, false), scope);
});
test("bounded records forget eligibility rather than replay completed history", () => {
 clear(); const scope = scopeFor(user, false); observe(scope, 1, "running");
 for (let id = 2; id < 700; id++) observe(scope, id, "completed");
 assert.equal(scope.tasks.size, 512); observe(scope, 1, "completed"); assert.equal(eligible(scope, 1, 1, "completed"), false);
});
