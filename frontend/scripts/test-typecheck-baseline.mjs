import assert from "node:assert/strict";
import { test } from "node:test";
import { compareDiagnostics } from "./typecheck-baseline.mjs";

const existing = { file: "src/example.ts", code: 2322, message: "Type 'number' is not assignable to type 'string'." };

test("existing errors are permitted while fixed errors can disappear", () => {
  assert.deepEqual(compareDiagnostics([existing], [existing]), { unexpected: [], resolved: 0 });
  assert.deepEqual(compareDiagnostics([], [existing]), { unexpected: [], resolved: 1 });
});

test("a repeated error at a new location cannot consume the same allowance twice", () => {
  assert.deepEqual(compareDiagnostics([existing, existing], [existing]), { unexpected: [existing], resolved: 0 });
});

test("a new file, error code or message fails even when the total error count is unchanged", () => {
  for (const entry of [
    { ...existing, file: "src/new.ts" },
    { ...existing, code: 2339 },
    { ...existing, message: "Different error" },
  ]) {
    assert.deepEqual(compareDiagnostics([entry], [existing]), { unexpected: [entry], resolved: 1 });
  }
});
