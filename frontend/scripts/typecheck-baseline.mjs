import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const baselinePath = path.join(root, "typecheck-baseline.json");

export function compareDiagnostics(current, baseline) {
  const counts = new Map();
  for (const entry of baseline) {
    const key = JSON.stringify(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const unexpected = [];
  for (const entry of current) {
    const key = JSON.stringify(entry);
    if ((counts.get(key) ?? 0) > 0) counts.set(key, counts.get(key) - 1);
    else unexpected.push(entry);
  }
  return { unexpected, resolved: [...counts.values()].reduce((sum, count) => sum + count, 0) };
}

export function collectDiagnostics() {
  const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, " "));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  return [...parsed.errors, ...ts.getPreEmitDiagnostics(program)].map((diagnostic) => ({
    file: diagnostic.file ? path.relative(root, diagnostic.file.fileName).split(path.sep).join("/") : "<config>",
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function main(args) {
  if (args.length > 1 || (args.length && args[0] !== "--write-baseline")) {
    throw new Error("Usage: node scripts/typecheck-baseline.mjs [--write-baseline]");
  }
  const diagnostics = collectDiagnostics();
  if (args[0] === "--write-baseline") {
    writeFileSync(baselinePath, JSON.stringify({
      typescriptVersion: ts.version,
      description: "Reviewed existing errors from 2026-10-10. This is not a clean typecheck. Do not expand this baseline to pass CI without review.",
      diagnostics,
    }, null, 2) + "\n");
    console.log(`Recorded ${diagnostics.length} existing TypeScript diagnostics for review.`);
    return 0;
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (baseline.typescriptVersion !== ts.version) throw new Error("TypeScript version changed; review diagnostics before updating the baseline.");
  const { unexpected, resolved } = compareDiagnostics(diagnostics, baseline.diagnostics);
  console.log(`TypeScript: ${diagnostics.length} current errors, ${baseline.diagnostics.length} reviewed baseline errors, ${unexpected.length} new errors.`);
  if (resolved) console.log(`${resolved} baseline errors no longer occur; remove their entries after review.`);
  if (unexpected.length) {
    for (const entry of unexpected) console.error(`${entry.file}: TS${entry.code}: ${entry.message}`);
    return 1;
  }
  console.log("No new errors. Full typecheck still fails while existing errors remain.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
